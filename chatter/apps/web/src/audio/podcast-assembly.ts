import { makePodcastClip, newId, type Gate, type PodcastClip, type PodcastProject, type Store } from '@chatter/shared';
import { decodeTakeAudio } from './take-audio.js';
import { keptPodcastRanges } from './podcast-audio.js';

export function packContributions(clips: PodcastClip[], gap = .25): PodcastClip[] {
  if (!Number.isFinite(gap) || gap < 0 || gap > 5) throw new Error('Choose a gap between zero and five seconds.');
  let cursor = 0;
  return clips.map(clip => {
    const result = { ...clip, startSec: cursor };
    cursor += keptPodcastRanges(clip).reduce((sum, r) => sum + r.end - r.start, 0) + gap;
    return result;
  });
}
export function alignConversation(clips: PodcastClip[]): PodcastClip[] {
  if (clips.length < 2) throw new Error('Choose at least two recordings to align.');
  const offsets = clips.map(clip => {
    const cue = clip.syncCueSec;
    if (cue === undefined || !Number.isFinite(cue)) throw new Error(`Mark the shared sound in ${clip.name}.`);
    let offset = 0;
    for (const range of keptPodcastRanges(clip)) {
      if (cue >= range.start && cue < range.end) return offset + cue - range.start;
      offset += range.end - range.start;
    }
    throw new Error(`The sync mark in ${clip.name} is outside its kept audio. Move the mark or restore the trim.`);
  });
  const target = Math.max(...offsets);
  return clips.map((clip, i) => ({ ...clip, startSec: target - offsets[i]! }));
}
export function phoneAudioMime(file: Pick<File, 'name' | 'type'>): string {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  return ({ m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm' } as Record<string, string>)[extension ?? ''] ?? (file.type.startsWith('audio/') ? file.type : 'application/octet-stream');
}

/** One file at a time: bounded decode memory and no automatic approval of uploads. */
export async function importPhoneRecording(input: {
  store: Store; gate: Gate; file: File; project: PodcastProject; mode: 'SEQUENCE' | 'CONVERSATION';
  actor?: string; decode?: typeof decodeTakeAudio;
}) {
  const { file, project, gate } = input;
  if (!file.size || file.size > 100 * 1024 * 1024) throw new Error('Choose a non-empty recording under 100 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let duration: number;
  try { duration = (await (input.decode ?? decodeTakeAudio)(bytes)).duration; }
  catch { throw new Error('This browser could not read it. Export a rendered M4A or WAV from the recording app.'); }
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new Error('Use a recording between zero and 60 minutes.');
  const title = file.name.replace(/\.[^.]+$/, '') || 'Phone recording';
  const result = await gate.ingest({ source: 'upload', bytes, meta: {
    kind: 'AUDIO', mime: phoneAudioMime(file), origin: 'UPLOAD', creator: title,
    storyId: project.storyIds[0], actor: input.actor, license: 'OWN',
  } });
  if (!result.assetId || result.status === 'REJECTED') throw new Error('This file could not pass the media checkpoint.');
  const voice = project.tracks.find(t => t.kind === 'VOICE');
  if (!voice) throw new Error('Add a voice track before importing.');
  const track = input.mode === 'CONVERSATION' ? { ...voice, id: newId(), name: title, muted: false, solo: false } : undefined;
  const end = Math.max(0, ...project.clips.filter(c => c.trackId === voice.id).map(c => c.startSec + keptPodcastRanges(c).reduce((sum, r) => sum + r.end - r.start, 0)));
  const clip = makePodcastClip({ assetId: result.assetId, trackId: track?.id ?? voice.id, name: title, durationSec: duration, startSec: track ? 0 : end });
  return { clip, track, status: result.status };
}
