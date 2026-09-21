import type { PodcastClip, PodcastProject, Store } from '@chatter/shared';
import type { ConversationMatch, SpeechFeatures } from './conversation-sync.js';
export interface ClipMatch extends ConversationMatch { clipId: string }
export function conversationFingerprint(project: PodcastProject) {
  return JSON.stringify({ id: project.id, clips: project.clips, tracks: project.tracks });
}

export function alignmentPositions(project: PodcastProject, referenceId: string, matches: ClipMatch[]) {
  const reference = project.clips.find(c => c.id === referenceId);
  if (!reference || reference.omittedRanges.length) throw new Error('Choose a continuous reference recording without transcript cuts.');
  const positions = new Map<string, number>([[reference.id, reference.startSec]]);
  for (const match of matches.filter(m => m.status === 'READY')) {
    const clip = project.clips.find(c => c.id === match.clipId);
    if (!clip || clip.omittedRanges.length || !Number.isFinite(match.offsetSec)) throw new Error('A recording changed. Analyze the conversation again.');
    const start = reference.startSec - reference.trimInSec + match.offsetSec + clip.trimInSec;
    const end = Math.min(reference.trimOutSec, match.offsetSec + clip.trimOutSec);
    const overlap = end - Math.max(reference.trimInSec, match.offsetSec + clip.trimInSec);
    if (overlap < 3) throw new Error(`${clip.name}: restore more of the shared conversation before applying this match.`);
    positions.set(clip.id, start);
  }
  if (positions.size < 2) throw new Error('No confident matches to apply. Use the shared-cue controls.');
  const shift = Math.max(0, -Math.min(...positions.values()));
  return new Map([...positions].map(([id, start]) => [id, start + shift]));
}

/** Dedicated worker stays cancellable even during a long correlation. Decode one source at a time. */
export async function analyzeConversation(store: Store, reference: PodcastClip, clips: PodcastClip[], signal: AbortSignal, progress: (message: string) => void): Promise<ClipMatch[]> {
  if (clips.length > 12) throw new Error('Compare up to 12 recordings at once.');
  if (reference.omittedRanges.length) throw new Error('Choose a continuous reference without transcript cuts.');
  const worker = new Worker(new URL('./conversation-sync.worker.ts', import.meta.url), { type: 'module' });
  let pendingReject: ((error: Error) => void) | undefined;
  const abort = () => { worker.terminate(); pendingReject?.(new DOMException('Analysis cancelled.', 'AbortError')); };
  signal.addEventListener('abort', abort, { once: true });
  function check() { if (signal.aborted) throw new DOMException('Analysis cancelled.', 'AbortError'); }
  function call<T>(input: unknown, transfer: Transferable[] = []): Promise<T> {
    check();
    return new Promise((resolve, reject) => {
      pendingReject = reject;
      worker.onmessage = event => { pendingReject = undefined; event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result); };
      worker.onerror = () => { pendingReject = undefined; reject(new Error('The comparison tool could not start. Reload Orbit and try again.')); };
      worker.postMessage(input, transfer);
    });
  }
  async function read(clip: PodcastClip) {
    check();
    if (clip.sourceDurationSec > 3600) throw new Error('Compare recordings of at most one hour.');
    const asset = await store.assets.get(clip.assetId);
    if (!asset || asset.gateStatus !== 'APPROVED') throw new Error('Ask an adviser to approve every selected recording first.');
    const bytes = await store.blobs.get(asset.sha256);
    if (!bytes) throw new Error(`The original for ${clip.name} is missing.`);
    check();
    // The decoder resamples to 8 kHz, reducing memory; originals remain untouched.
    const context = new OfflineAudioContext(1, 1, 8000);
    const audio = await context.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
    check();
    if (audio.duration > 3600) throw new Error('Compare recordings of at most one hour.');
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i).slice());
    return call<SpeechFeatures>({ type: 'FEATURES', channels, rate: audio.sampleRate }, channels.map(c => c.buffer as ArrayBuffer));
  }
  try {
    progress('Listening to the reference…'); const referenceFeatures = await read(reference); const results: ClipMatch[] = [];
    for (const [i, clip] of clips.filter(c => c.id !== reference.id).entries()) {
      check(); progress(`Comparing recording ${i + 1}: ${clip.name}…`);
      if (clip.omittedRanges.length) { results.push({ clipId: clip.id, status: 'CHECK', offsetSec: 0, confidence: 0, driftSec: 0, anchors: [], reason: 'This recording has transcript cuts. Restore them or use manual shared cues.' }); continue; }
      const source = await read(clip);
      const result = await call<ConversationMatch>({ type: 'MATCH', reference: referenceFeatures, source });
      results.push({ ...result, clipId: clip.id });
    }
    check(); return results;
  } finally { signal.removeEventListener('abort', abort); worker.terminate(); }
}
