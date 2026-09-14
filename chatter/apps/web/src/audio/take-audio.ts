import { validateTakeEdits, type TakeEdits } from '@chatter/shared';

export interface TakeAudio { sampleRate: number; channels: Float32Array[]; duration: number }

export const boothClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}.${Math.floor(seconds % 1 * 10)}`;

export async function decodeTakeAudio(bytes: Uint8Array): Promise<TakeAudio> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
    return { sampleRate: buffer.sampleRate, duration: buffer.duration, channels: Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice()) };
  } finally { await context.close(); }
}

export function waveformPeaks(audio: TakeAudio, bars = 360): number[] {
  const length = audio.channels[0]?.length ?? 0;
  return Array.from({ length: bars }, (_, bar) => {
    let peak = 0;
    const from = Math.floor(bar * length / bars); const to = Math.max(from + 1, Math.floor((bar + 1) * length / bars));
    for (const channel of audio.channels) for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(channel[i] ?? 0));
    return peak;
  });
}

/** Non-destructive render: originals never change; preview and WAV use these same samples. */
export function renderTakeAudio(audio: TakeAudio, input: TakeEdits): TakeAudio {
  const edits = validateTakeEdits(input, audio.duration);
  const from = Math.floor(edits.trimStart * audio.sampleRate); const to = Math.min(audio.channels[0]!.length, Math.ceil(edits.trimEnd * audio.sampleRate));
  const length = to - from;
  const channels = audio.channels.map((channel) => channel.slice(from, to));
  let peak = 0;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  // Peak normalization is not loudness matching and cannot repair clipping.
  const normalization = edits.normalize && peak > 0.00001 ? Math.min(10, Math.pow(10, -1 / 20) / peak) : 1;
  const gain = Math.pow(10, edits.gainDb / 20) * normalization;
  for (const channel of channels) for (let i = 0; i < length; i++) {
    const fadeIn = edits.fadeIn ? Math.min(1, i / (edits.fadeIn * audio.sampleRate)) : 1;
    const fadeOut = edits.fadeOut ? Math.min(1, (length - 1 - i) / (edits.fadeOut * audio.sampleRate)) : 1;
    channel[i] = channel[i]! * gain * fadeIn * fadeOut;
  }
  return { sampleRate: audio.sampleRate, channels, duration: length / audio.sampleRate };
}

export function audioPeak(audio: TakeAudio): number {
  let peak = 0;
  for (const channel of audio.channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

export function encodeTakeWav(audio: TakeAudio): Uint8Array {
  const count = audio.channels.length; const frames = audio.channels[0]?.length ?? 0;
  const buffer = new ArrayBuffer(44 + frames * count * 2); const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, count, true); view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * count * 2, true); view.setUint16(32, count * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * count * 2, true);
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < count; channel++) { const sample = Math.max(-1, Math.min(1, audio.channels[channel]![i]!)); view.setInt16(44 + (i * count + channel) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); }
  return new Uint8Array(buffer);
}

export class RecordingClock {
  private accumulated = 0;
  private started?: number;
  start(now: number) { this.accumulated = 0; this.started = now; }
  pause(now: number) { if (this.started !== undefined) { this.accumulated += now - this.started; this.started = undefined; } }
  resume(now: number) { if (this.started === undefined) this.started = now; }
  seconds(now: number) { return Math.max(0, (this.accumulated + (this.started === undefined ? 0 : now - this.started)) / 1000); }
}
