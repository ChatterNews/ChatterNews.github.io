import type { SoundClip, SoundGenerator, SoundProject, SoundTrack } from '@chatter/shared';
import { audioPeak, encodeTakeWav, waveformPeaks, type TakeAudio } from './take-audio';

export const SOUND_LIMITS = Object.freeze({ tracks: 8, clips: 64, seconds: 300, sampleRate: 48000, bytes: 256 * 1024 * 1024, encodedSourceBytes: 20 * 1024 * 1024, wavSourceBytes: 64 * 1024 * 1024 });
export function soundSourceByteLimit(bytes: Uint8Array): number {
  const wav = bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 65 && bytes[10] === 86 && bytes[11] === 69;
  return wav ? SOUND_LIMITS.wavSourceBytes : SOUND_LIMITS.encodedSourceBytes;
}
const REVERB_SECONDS = 1.6;
const DELAY_TAPS = 4;
const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Sound job cancelled', 'AbortError'); };
function number(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
}
export function validateGenerator(g: SoundGenerator) {
  if (g.version !== 1 || !['TONE', 'NOISE'].includes(g.kind) || !['WHITE', 'LOW'].includes(g.color)) throw new Error('Unsupported sound generator recipe.');
  number(g.seed, 0, 0xffffffff, 'Variation seed'); if (!Number.isInteger(g.seed)) throw new Error('Variation seed must be an integer.');
  number(g.duration, 0.01, 300, 'Generator duration'); number(g.frequency, 20, 20000, 'Frequency'); number(g.endFrequency, 20, 20000, 'End frequency');
  number(g.attack, 0, g.duration, 'Attack'); number(g.release, 0, g.duration, 'Release'); number(g.pulseHz, 0, 40, 'Pulse speed');
}
function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 * 2 - 1; };
}
/** Version 1 is frozen: seeded LCG noise, a one-pole low-pass, phase-integrated sine sweep. */
export function generateSoundAudio(g: SoundGenerator, sampleRate: number = SOUND_LIMITS.sampleRate): TakeAudio {
  validateGenerator(g); number(sampleRate, 8000, 96000, 'Sample rate');
  const length = Math.ceil(g.duration * sampleRate), channel = new Float32Array(length), rng = random(g.seed);
  let phase = 0, low = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate, progress = t / g.duration;
    const frequency = g.frequency * Math.pow(g.endFrequency / g.frequency, progress);
    phase += 2 * Math.PI * frequency / sampleRate;
    const noise = rng(); const alpha = 1 - Math.exp(-2 * Math.PI * Math.min(frequency, sampleRate * 0.45) / sampleRate);
    low += alpha * (noise - low);
    const carrier = g.kind === 'TONE' ? Math.sin(phase) : g.color === 'LOW' ? low : noise;
    // Even zero-attack/release recipes get 3 ms edges to avoid accidental clicks.
    const envelope = Math.min(1, i / (Math.max(0.003, g.attack) * sampleRate)) * Math.min(1, (length - 1 - i) / (Math.max(0.003, g.release) * sampleRate));
    const pulse = g.pulseHz ? Math.pow(0.5 + 0.5 * Math.cos(t * Math.PI * 2 * g.pulseHz), 3) : 1;
    channel[i] = carrier * envelope * pulse * 0.55;
  }
  return { channels: [channel], duration: length / sampleRate, sampleRate };
}
export interface SoundEvent { clip: SoundClip; at: number; duration: number; sourceOffset: number }
export interface SoundPlan { events: SoundEvent[]; renderEnd: number; exportStart: number; duration: number; tail: number; estimatedRenderBytes: number }
export function trackTail(track: SoundTrack): number { return Math.max(track.delayMix > 0 ? track.delaySec * DELAY_TAPS : 0, track.reverbMix > 0 ? REVERB_SECONDS : 0); }
export function compileSoundPlan(project: SoundProject): SoundPlan {
  if (project.schemaVersion !== 1) throw new Error('Unsupported sound project version.');
  if (!project.tracks.length || project.tracks.length > SOUND_LIMITS.tracks || project.clips.length > SOUND_LIMITS.clips) throw new Error('Use 1–8 tracks and at most 64 clips.');
  number(project.exportStart, 0, SOUND_LIMITS.seconds, 'Export start'); number(project.exportEnd, 0.01, SOUND_LIMITS.seconds, 'Export end');
  if (project.exportEnd <= project.exportStart) throw new Error('Export end must follow export start.');
  const tracks = new Map<string, SoundTrack>();
  for (const track of project.tracks) {
    if (tracks.has(track.id)) throw new Error('Duplicate sound track ID.'); tracks.set(track.id, track);
    number(track.gainDb, -60, 12, 'Track gain'); number(track.pan, -1, 1, 'Pan'); number(track.filterHz, 20, 24000, 'Filter');
    number(track.delaySec, 0, 2, 'Delay'); number(track.delayMix, 0, 1, 'Delay mix'); number(track.reverbMix, 0, 1, 'Reverb mix');
  }
  const events: SoundEvent[] = []; const ids = new Set<string>(); let latestEnd = project.exportEnd;
  for (const clip of project.clips) {
    const track = tracks.get(clip.trackId); if (!track) throw new Error(`“${clip.name}” has a missing track.`);
    if (ids.has(clip.id)) throw new Error('Duplicate sound clip ID.'); ids.add(clip.id);
    if (Boolean(clip.assetId) === Boolean(clip.generator)) throw new Error(`“${clip.name}” must have exactly one source.`);
    if (clip.generator) validateGenerator(clip.generator);
    number(clip.start, 0, 300, 'Clip start'); number(clip.sourceIn, 0, 300, 'Source in'); number(clip.sourceOut, 0.001, 300, 'Source out');
    if (clip.sourceOut <= clip.sourceIn) throw new Error(`“${clip.name}” has an empty trim.`);
    number(clip.rate, 0.25, 4, 'Playback rate'); number(clip.repeats, 1, 64, 'Repeat count');
    if (!Number.isInteger(clip.repeats)) throw new Error('Repeat count must be an integer.');
    number(clip.gainDb, -60, 12, 'Clip gain'); const duration = (clip.sourceOut - clip.sourceIn) / clip.rate;
    number(clip.fadeIn, 0, duration, 'Fade in'); number(clip.fadeOut, 0, duration, 'Fade out');
    if (track.muted) continue;
    for (let repeat = 0; repeat < clip.repeats; repeat++) {
      const at = clip.start + repeat * duration;
      if (at >= project.exportEnd) break;
      const used = Math.min(duration, project.exportEnd - at);
      if (at + used + trackTail(track) <= project.exportStart) continue;
      events.push({ clip, at, duration: used, sourceOffset: clip.sourceIn });
      latestEnd = Math.max(latestEnd, at + used + trackTail(track));
    }
  }
  const renderEnd = project.loop ? project.exportEnd : latestEnd;
  if (renderEnd > SOUND_LIMITS.seconds) throw new Error('Sound plus effect tails exceeds five minutes. Shorten the export range or reduce effects.');
  const frames = Math.ceil(renderEnd * SOUND_LIMITS.sampleRate);
  // Offline output, copied stereo channels, WAV, peaks and convolution working space.
  const effectBytes = project.tracks.filter(t => !t.muted).reduce((total, t) => total + SOUND_LIMITS.sampleRate * 2 * 4 * (
    (t.reverbMix > 0 ? REVERB_SECONDS * 4 : 0) + (t.delayMix > 0 ? t.delaySec * DELAY_TAPS * (DELAY_TAPS + 1) / 2 : 0)
  ), 0);
  const estimatedRenderBytes = frames * 24 + effectBytes;
  const crossfade = project.loopCrossfade ?? Math.min(0.02, (project.exportEnd - project.exportStart) / 2);
  if (project.loop) number(crossfade, 0, (project.exportEnd - project.exportStart) / 2, 'Loop crossfade');
  return { events, renderEnd, exportStart: project.exportStart, duration: renderEnd - project.exportStart - (project.loop ? crossfade : 0), tail: renderEnd - project.exportEnd, estimatedRenderBytes };
}

interface SourceInfo { duration: number; channels: number }
/** Inspect PCM WAV without decoding; browser metadata bounds other supported containers. */
export function inspectWav(bytes: Uint8Array): SourceInfo | undefined {
  if (bytes.length < 12) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return undefined;
  let rate = 0, channels = 0, align = 0, data = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true), end = at + 8 + size;
    if (end > bytes.length) throw new Error('Incomplete WAV source. Restore the original file.');
    if (tag(at) === 'fmt ' && size >= 16) { channels = view.getUint16(at + 10, true); rate = view.getUint32(at + 12, true); align = view.getUint16(at + 20, true); }
    if (tag(at) === 'data') data += size;
    at = end + size % 2;
  }
  if (!rate || !channels || !align || !data) throw new Error('Invalid WAV source header.');
  return { duration: data / align / rate, channels };
}
async function sourceInfo(bytes: Uint8Array, signal?: AbortSignal): Promise<SourceInfo> {
  const wav = inspectWav(bytes); if (wav) return wav;
  if (typeof document === 'undefined') throw new Error('Audio metadata needs a browser.');
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer]));
  const audio = document.createElement('audio'); audio.preload = 'metadata';
  try {
    return await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancelled); audio.onloadedmetadata = null; audio.onerror = null; };
      const cancelled = () => { cleanup(); reject(new DOMException('Sound job cancelled', 'AbortError')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Could not inspect this audio. Convert it to a short WAV and import again.')); }, 15000);
      audio.onloadedmetadata = () => { cleanup(); resolve({ duration: audio.duration, channels: 2 }); };
      audio.onerror = () => { cleanup(); reject(new Error('Unsupported audio source. Convert it to WAV and import again.')); };
      signal?.addEventListener('abort', cancelled, { once: true }); if (signal?.aborted) return cancelled(); audio.src = url;
    });
  } finally { audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); }
}
function reverbBuffer(context: OfflineAudioContext): AudioBuffer {
  const result = context.createBuffer(2, Math.ceil(context.sampleRate * REVERB_SECONDS), context.sampleRate), rng = random(0xf01e);
  for (let c = 0; c < 2; c++) {
    const channel = result.getChannelData(c);
    for (let i = 0; i < channel.length; i++) channel[i] = rng() * Math.pow(1 - i / channel.length, 3);
  }
  return result;
}
function connectTrack(context: OfflineAudioContext, track: SoundTrack, nodes: AudioNode[], impulse: AudioBuffer | undefined): AudioNode {
  const filter = context.createBiquadFilter(), pan = context.createStereoPanner(), gain = context.createGain();
  filter.type = 'lowpass'; filter.frequency.value = Math.min(track.filterHz, context.sampleRate / 2); filter.Q.value = 0.707;
  gain.gain.value = Math.pow(10, track.gainDb / 20); pan.pan.value = track.pan;
  filter.connect(pan); pan.connect(gain); gain.connect(context.destination); nodes.push(filter, pan, gain);
  if (track.delayMix > 0 && track.delaySec > 0) {
    for (let tap = 1; tap <= DELAY_TAPS; tap++) {
      const delay = context.createDelay(track.delaySec * tap), wet = context.createGain(); delay.delayTime.value = track.delaySec * tap; wet.gain.value = track.delayMix * Math.pow(0.45, tap - 1);
      gain.connect(delay); delay.connect(wet); wet.connect(context.destination); nodes.push(delay, wet);
    }
  }
  if (track.reverbMix > 0 && impulse) {
    const convolver = context.createConvolver(), wet = context.createGain(); convolver.buffer = impulse; wet.gain.value = track.reverbMix;
    gain.connect(convolver); convolver.connect(wet); wet.connect(context.destination); nodes.push(convolver, wet);
  }
  return filter;
}
/** Overlap the last N frames with the first N, then remove the redundant tail.
 * The shortened loop has both a continuous wrap and a continuous join to its body.
 */
export function applyLoopSeam(channels: Float32Array[], frames: number): Float32Array[] {
  if (frames <= 0) return channels;
  return channels.map(channel => {
    const n = Math.min(frames, Math.floor(channel.length / 2)), end = channel.length - n;
    const result = channel.slice(0, end);
    for (let i = 0; i < n; i++) {
      const weight = n > 1 ? i / (n - 1) : 0.5;
      result[i] = channel[end + i]! * (1 - weight) + channel[i]! * weight;
    }
    return result;
  });
}
export interface RenderSoundOptions { signal?: AbortSignal; onProgress?: (stage: string, progress?: number) => void }
export async function renderSound(project: SoundProject, sources: Map<string, Uint8Array>, options: RenderSoundOptions = {}): Promise<{ bytes: Uint8Array; duration: number; peaks: number[]; peak: number }> {
  const { signal, onProgress } = options; abort(signal); const plan = compileSoundPlan(project);
  // Validate every referenced source, including muted/out-of-range clips: incomplete projects fail closed.
  const required = [...new Set(project.clips.flatMap(c => c.assetId ? [c.assetId] : []))];
  let memory = plan.estimatedRenderBytes;
  const checkBudget = () => { if (memory > SOUND_LIMITS.bytes) throw new Error('This sound needs too much audio memory. Shorten or split the source files and export range.'); };
  checkBudget();
  for (let i = 0; i < required.length; i++) {
    abort(signal); const id = required[i]!, bytes = sources.get(id); const name = project.clips.find(c => c.assetId === id)?.name ?? id;
    if (!bytes) throw new Error(`Missing source “${name}”. Restore or replace it before rendering.`);
    const byteLimit = soundSourceByteLimit(bytes);
    if (bytes.byteLength > byteLimit) throw new Error(`“${name}” exceeds the ${byteLimit / 1024 / 1024} MiB source limit. Trim or split the file before importing.`);
    onProgress?.(`Checking source ${i + 1} of ${required.length}`);
    const info = await sourceInfo(bytes, signal); abort(signal);
    if (!Number.isFinite(info.duration) || info.duration <= 0 || info.duration > SOUND_LIMITS.seconds || info.channels > 2) throw new Error(`“${name}” must be mono/stereo and no longer than five minutes. Trim or convert the source first.`);
    memory += Math.ceil(info.duration * SOUND_LIMITS.sampleRate) * 2 * 4 * 2 + bytes.byteLength * 2; checkBudget();
  }
  const generated = new Map<string, SoundGenerator>();
  for (const clip of project.clips) if (clip.generator) generated.set(JSON.stringify(clip.generator), clip.generator);
  for (const recipe of generated.values()) { memory += Math.ceil(recipe.duration * SOUND_LIMITS.sampleRate) * 8; checkBudget(); }
  abort(signal);
  if (typeof OfflineAudioContext === 'undefined') throw new Error('This browser does not support audio rendering.');
  const context = new OfflineAudioContext(2, Math.ceil(plan.renderEnd * SOUND_LIMITS.sampleRate), SOUND_LIMITS.sampleRate);
  const buffers = new Map<string, AudioBuffer>(), nodes: AudioNode[] = [], voices: AudioBufferSourceNode[] = [];
  const stop = () => { for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } } for (const node of nodes) node.disconnect(); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    for (let i = 0; i < required.length; i++) {
      abort(signal); const id = required[i]!; onProgress?.(`Decoding source ${i + 1} of ${required.length}`, i / Math.max(1, required.length));
      let buffer: AudioBuffer;
      try { buffer = await context.decodeAudioData(sources.get(id)!.slice().buffer as ArrayBuffer); } catch { abort(signal); throw new Error(`Could not decode “${project.clips.find(c => c.assetId === id)?.name ?? id}”. Convert it to WAV and import again.`); }
      abort(signal);
      if (buffer.duration > SOUND_LIMITS.seconds || buffer.numberOfChannels > 2) throw new Error('Decoded source exceeds the mono/stereo five-minute limit.');
      buffers.set(id, buffer);
    }
    for (const [key, recipe] of generated) {
      abort(signal); onProgress?.('Generating sound');
      const audio = generateSoundAudio(recipe), buffer = context.createBuffer(1, audio.channels[0]!.length, audio.sampleRate);
      buffer.copyToChannel(audio.channels[0]! as Float32Array<ArrayBuffer>, 0); buffers.set(key, buffer);
    }
    for (const clip of project.clips) {
      const buffer = buffers.get(clip.assetId ?? JSON.stringify(clip.generator))!;
      if (clip.sourceOut > buffer.duration + 1 / buffer.sampleRate) throw new Error(`“${clip.name}” extends beyond its source. Adjust the trim before rendering.`);
    }
    const impulse = project.tracks.some(t => !t.muted && t.reverbMix > 0) ? reverbBuffer(context) : undefined;
    const inputs = new Map(project.tracks.filter(t => !t.muted).map(track => [track.id, connectTrack(context, track, nodes, impulse)]));
    for (const event of plan.events) {
      const { clip, at, duration } = event; const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffers.get(clip.assetId ?? JSON.stringify(clip.generator))!; source.playbackRate.value = clip.rate;
      const fullDuration = (clip.sourceOut - clip.sourceIn) / clip.rate, level = Math.pow(10, clip.gainDb / 20);
      // Product envelope supports overlapping fades without conflicting AudioParam ramps.
      const points = Math.max(2, Math.min(16384, Math.ceil(duration * 240) + 1)), curve = new Float32Array(points);
      for (let i = 0; i < points; i++) { const t = duration * i / (points - 1); curve[i] = level * (clip.fadeIn ? Math.min(1, t / clip.fadeIn) : 1) * (clip.fadeOut ? Math.min(1, Math.max(0, fullDuration - t) / clip.fadeOut) : 1); }
      gain.gain.setValueCurveAtTime(curve, at, duration); source.connect(gain); gain.connect(inputs.get(clip.trackId)!); nodes.push(source, gain); voices.push(source);
      source.start(at, event.sourceOffset); source.stop(at + duration);
    }
    abort(signal); onProgress?.('Rendering sound'); const buffer = await context.startRendering(); abort(signal);
    const from = Math.floor(plan.exportStart * buffer.sampleRate);
    let channels: Float32Array[] = [buffer.getChannelData(0).slice(from), buffer.getChannelData(1).slice(from)];
    if (project.loop) channels = applyLoopSeam(channels, Math.round((project.loopCrossfade ?? Math.min(0.02, (project.exportEnd - project.exportStart) / 2)) * buffer.sampleRate));
    const audio = { channels, sampleRate: buffer.sampleRate, duration: channels[0]!.length / buffer.sampleRate };
    onProgress?.('Encoding WAV'); abort(signal); const peak = audioPeak(audio), peaks = waveformPeaks(audio), bytes = encodeTakeWav(audio); abort(signal);
    onProgress?.('Sound ready', 1); return { bytes, duration: audio.duration, peaks, peak };
  } finally { signal?.removeEventListener('abort', stop); stop(); buffers.clear(); }
}

/** Shared bounded import inspection. Import operations still own Gate and attribution. */
export async function inspectSoundFile(file: File, options: RenderSoundOptions & { knownDuration?: number } = {}): Promise<{ duration: number; peaks: number[]; normalizedBytes?: Uint8Array }> {
  const { signal, onProgress } = options; abort(signal);
  if (!file.size || file.size > SOUND_LIMITS.wavSourceBytes) throw new Error('Use WAV files up to 64 MiB or compressed audio up to 20 MiB. Trim or split larger recordings first.');
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer()); abort(signal);
  if (file.size > soundSourceByteLimit(header)) throw new Error('Compressed audio must be no larger than 20 MiB. Trim or split this source first.');
  onProgress?.('Checking audio'); const bytes = new Uint8Array(await file.arrayBuffer()); abort(signal);
  // Only the local recording operation supplies this timer measurement; imported files must inspect their own metadata.
  if (options.knownDuration !== undefined && (!Number.isFinite(options.knownDuration) || options.knownDuration <= 0 || options.knownDuration > SOUND_LIMITS.seconds)) throw new Error('Use a recording no longer than five minutes.');
  const info = options.knownDuration === undefined ? await sourceInfo(bytes, signal) : { duration: options.knownDuration, channels: 2 }; abort(signal);
  if (!Number.isFinite(info.duration) || info.duration <= 0 || info.duration > SOUND_LIMITS.seconds || info.channels > 2) throw new Error('Use mono or stereo audio no longer than five minutes.');
  const estimate = info.duration * SOUND_LIMITS.sampleRate * 2 * 4 * 2 + file.size * 2;
  if (estimate > SOUND_LIMITS.bytes) throw new Error('This file needs too much audio memory. Trim or split it first.');
  onProgress?.('Preparing waveform');
  const context = new AudioContext({ sampleRate: SOUND_LIMITS.sampleRate });
  try {
    const buffer = await context.decodeAudioData(bytes.buffer as ArrayBuffer); abort(signal);
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > SOUND_LIMITS.seconds || buffer.numberOfChannels > 2) throw new Error('Use mono or stereo audio no longer than five minutes.');
    if (buffer.duration * buffer.sampleRate * buffer.numberOfChannels * 4 * 2 + file.size * 2 > SOUND_LIMITS.bytes) throw new Error('This recording needs too much audio memory. Trim or split it first.');
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const audio = { duration: buffer.duration, sampleRate: buffer.sampleRate, channels };
    if (options.knownDuration !== undefined && 44 + buffer.length * buffer.numberOfChannels * 2 > SOUND_LIMITS.wavSourceBytes) throw new Error('The recorded WAV exceeds 64 MiB. Download the recovery recording and trim it before importing.');
    return { duration: buffer.duration, peaks: waveformPeaks(audio), ...(options.knownDuration === undefined ? {} : { normalizedBytes: encodeTakeWav(audio) }) };
  } catch (error) {
    abort(signal); throw error;
  } finally { await context.close(); }
}
