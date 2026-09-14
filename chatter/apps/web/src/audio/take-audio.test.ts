import { describe, expect, test } from 'vitest';
import { defaultTakeEdits } from '@chatter/shared';
import { audioPeak, encodeTakeWav, RecordingClock, renderTakeAudio, waveformPeaks, type TakeAudio } from './take-audio.js';

const original = (): TakeAudio => ({ sampleRate: 100, duration: 2, channels: [new Float32Array(200).fill(0.25), new Float32Array(200).fill(-0.5)] });
describe('Booth non-destructive audio processing', () => {
  test('trims sample ranges without modifying the original channels', () => {
    const source = original(); const result = renderTakeAudio(source, { ...defaultTakeEdits(2), trimStart: 0.5, trimEnd: 1.5 });
    expect(result.duration).toBe(1); expect(result.channels[0]).toHaveLength(100);
    expect(source.channels[0]).toHaveLength(200); expect(source.channels[0]![0]).toBe(0.25);
  });
  test('the same gain and fades apply to both stereo channels', () => {
    const result = renderTakeAudio(original(), { ...defaultTakeEdits(2), gainDb: -6, fadeIn: 0.2, fadeOut: 0.2 });
    expect(result.channels[0]![0]).toBe(0); expect(result.channels[1]![199]).toBeCloseTo(0);
    expect(result.channels[1]![50]).toBeCloseTo(-0.5 * Math.pow(10, -6 / 20));
  });
  test('normalizes peak amplitude with stereo balance intact and flags over-level edits', () => {
    const normalized = renderTakeAudio(original(), { ...defaultTakeEdits(2), normalize: true });
    expect(audioPeak(normalized)).toBeCloseTo(Math.pow(10, -1 / 20));
    expect(normalized.channels[0]![80]! / normalized.channels[1]![80]!).toBeCloseTo(-0.5);
    expect(audioPeak(renderTakeAudio(original(), { ...defaultTakeEdits(2), gainDb: 18 }))).toBeGreaterThan(1);
  });
  test('silent normalization stays silent and finite', () => {
    const result = renderTakeAudio({ ...original(), channels: [new Float32Array(200)] }, { ...defaultTakeEdits(2), normalize: true });
    expect(audioPeak(result)).toBe(0); expect(result.channels[0]!.every(Number.isFinite)).toBe(true);
  });
  test('WAV header and interleaved PCM match the actual processed samples', () => {
    const wav = encodeTakeWav(original()); const view = new DataView(wav.buffer as ArrayBuffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(view.getUint16(22, true)).toBe(2); expect(view.getUint32(24, true)).toBe(100);
    expect(view.getUint32(40, true)).toBe(800); expect(wav.length).toBe(844);
    expect(view.getInt16(44, true)).toBe(8192); expect(view.getInt16(46, true)).toBe(-16384);
  });
  test('waveform bars come from the largest real channel sample', () => {
    expect(waveformPeaks(original(), 20)).toEqual(new Array(20).fill(0.5));
  });
  test('paused time is excluded and repeated pause/resume does not corrupt the take duration', () => {
    const clock = new RecordingClock(); clock.start(100); clock.pause(2100); clock.pause(2500);
    expect(clock.seconds(9100)).toBe(2); clock.resume(9100); clock.resume(10000);
    expect(clock.seconds(11100)).toBe(4); clock.pause(11100); expect(clock.seconds(15100)).toBe(4);
  });
});
