import { describe, expect, it, vi, afterEach } from 'vitest';
import type { SoundProject, SoundGenerator } from '@chatter/shared';
import { applyLoopSeam, compileSoundPlan, generateSoundAudio, inspectSoundFile, inspectWav, renderSound, soundSourceByteLimit, SOUND_LIMITS } from './sound-engine';
import { starterSounds } from './sound-starters';
import { encodeTakeWav } from './take-audio';

const recipe: SoundGenerator = { version: 1, kind: 'NOISE', color: 'LOW', seed: 123, duration: 0.5, frequency: 200, endFrequency: 2000, attack: 0.01, release: 0.1, pulseHz: 0 };
function project(): SoundProject {
  return { id: 'p', createdAt: 1, updatedAt: 1, schemaVersion: 1, revision: 0, name: 'Test', credits: '', bpm: 120, snap: 'OFF', exportStart: 0, exportEnd: 1, loop: false,
    tracks: [{ id: 't', name: 'Track', gainDb: 0, pan: 0, muted: false, filterHz: 20000, delaySec: 0, delayMix: 0, reverbMix: 0 }],
    clips: [{ id: 'c', name: 'Noise', trackId: 't', generator: recipe, start: 0, sourceIn: 0, sourceOut: 0.5, rate: 1, repeats: 1, gainDb: 0, fadeIn: 0, fadeOut: 0 }],
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('original synthesis', () => {
  it('reproduces PCM exactly, varies seeded noise, and has silent envelope endpoints', () => {
    const a = generateSoundAudio(recipe, 8000).channels[0]!;
    expect(a).toEqual(generateSoundAudio(recipe, 8000).channels[0]);
    expect(a).not.toEqual(generateSoundAudio({ ...recipe, seed: 124 }, 8000).channels[0]);
    expect(a.length).toBe(4000); expect(Math.abs(a[0]!)).toBe(0); expect(Math.abs(a.at(-1)!)).toBe(0);
    expect([...a].every(Number.isFinite)).toBe(true); expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(0.55);
  });
  it('provides 25 distinct usable original recipes across five categories', () => {
    expect(starterSounds.length).toBeGreaterThanOrEqual(24); expect(new Set(starterSounds.map(s => s.category)).size).toBe(5);
    const signatures = starterSounds.map(s => {
      const a = generateSoundAudio(s.recipe, 8000).channels[0]!;
      expect(a.some(v => Math.abs(v) > 0.005)).toBe(true);
      return [a.length, ...Array.from({ length: 50 }, (_, i) => a[Math.floor(a.length * (i + 1) / 51)])].join(',');
    });
    expect(new Set(signatures).size).toBe(starterSounds.length);
  });
});
describe('shared render plan', () => {
  it('computes rate changes, repeat timing and explicit source offsets', () => {
    const p = project(); p.clips[0] = { ...p.clips[0]!, sourceIn: 0.1, sourceOut: 0.5, start: 0.2, rate: 2, repeats: 3 };
    const plan = compileSoundPlan(p);
    expect(plan.events.map(e => e.at)).toEqual([0.2, 0.4, 0.6000000000000001]);
    expect(plan.events.every(e => e.duration === 0.2 && e.sourceOffset === 0.1)).toBe(true);
  });
  it('includes finite tails from active clips and respects range cuts', () => {
    const p = project(); p.exportEnd = 0.3; p.tracks[0]!.delaySec = 0.5; p.tracks[0]!.delayMix = 0.3; p.tracks[0]!.reverbMix = 0.2;
    const plan = compileSoundPlan(p); expect(plan.events[0]!.duration).toBe(0.3); expect(plan.tail).toBeCloseTo(2); expect(plan.duration).toBe(2.3);
    p.tracks[0]!.muted = true; expect(compileSoundPlan(p).tail).toBe(0);
  });
  it('preserves pre-range clips whose effects enter the selected range', () => {
    const p = project(); p.exportStart = 0.8; p.tracks[0]!.delaySec = 0.25; p.tracks[0]!.delayMix = 1;
    expect(compileSoundPlan(p).events).toHaveLength(1);
    p.tracks[0]!.delayMix = 0; expect(compileSoundPlan(p).events).toHaveLength(0);
  });
  it('uses an explicit loop range without appending tails', () => {
    const p = project(); p.loop = true; p.tracks[0]!.reverbMix = 1;
    expect(compileSoundPlan(p).tail).toBe(0);
    const loop = applyLoopSeam([new Float32Array([0, 1, 2, 3, 4, 5, 6, 7])], 3)[0]!;
    expect([...loop]).toEqual([5, 3.5, 2, 3, 4]); // continuous body-to-wrap sequence 3,4,5
  });
  it('rejects track/placement, malformed ranges and tails beyond the five-minute ceiling', () => {
    const p = project(); p.tracks = Array.from({ length: 9 }, (_, i) => ({ ...p.tracks[0]!, id: String(i) })); expect(() => compileSoundPlan(p)).toThrow('1–8');
    const q = project(); q.clips = Array.from({ length: 65 }, (_, i) => ({ ...q.clips[0]!, id: String(i) })); expect(() => compileSoundPlan(q)).toThrow('64');
    const r = project(); r.clips[0]!.rate = NaN; expect(() => compileSoundPlan(r)).toThrow('Playback rate');
    const s = project(); s.exportEnd = 300; s.clips[0]!.start = 299.5; s.tracks[0]!.reverbMix = 1; expect(() => compileSoundPlan(s)).toThrow('effect tails');
  });
});
describe('preflight and cancellation', () => {
  it('fails on missing muted sources before creating any rendering context', async () => {
    const p = project(); delete p.clips[0]!.generator; p.clips[0]!.assetId = 'gone'; p.tracks[0]!.muted = true;
    const context = vi.fn(); vi.stubGlobal('OfflineAudioContext', context);
    await expect(renderSound(p, new Map())).rejects.toThrow('Missing source “Noise”'); expect(context).not.toHaveBeenCalled();
  });
  it('rejects cancelled jobs and oversized sources before context allocation', async () => {
    const p = project(); const signal = AbortSignal.abort(); await expect(renderSound(p, new Map(), { signal })).rejects.toMatchObject({ name: 'AbortError' });
    delete p.clips[0]!.generator; p.clips[0]!.assetId = 'a';
    await expect(renderSound(p, new Map([['a', new Uint8Array(SOUND_LIMITS.encodedSourceBytes + 1)]]))).rejects.toThrow('20 MiB');
  });
  it('reads mono WAV duration without browser decoding and rejects truncated containers', () => {
    const bytes = encodeTakeWav(generateSoundAudio(recipe, 8000));
    expect(inspectWav(bytes)).toEqual({ duration: 0.5, channels: 1 });
    expect(() => inspectWav(bytes.subarray(0, bytes.length - 2))).toThrow('Incomplete WAV');
  });
  it('rejects memory-over-budget projects before allocation', async () => {
    const p = project(); p.exportEnd = 300;
    await expect(renderSound(p, new Map())).rejects.toThrow('too much audio memory');
  });
});


describe('trusted local recordings', () => {
  it('validates timer bounds before decode and normalizes the captured PCM to a portable WAV', async () => {
    const close = vi.fn(async () => undefined), decode = vi.fn(async () => ({ duration: 0.5, numberOfChannels: 1, sampleRate: 8000, length: 4000, getChannelData: () => new Float32Array(4000).fill(0.25) }));
    vi.stubGlobal('AudioContext', class { decodeAudioData = decode; close = close; });
    const file = new File([new Uint8Array([1, 2, 3])], 'capture.webm', { type: 'audio/webm' });
    await expect(inspectSoundFile(file, { knownDuration: Infinity })).rejects.toThrow('no longer than five minutes'); expect(decode).not.toHaveBeenCalled();
    const result = await inspectSoundFile(file, { knownDuration: 0.5 });
    expect(inspectWav(result.normalizedBytes!)).toEqual({ duration: 0.5, channels: 1 }); expect(result.peaks[0]).toBe(0.25); expect(close).toHaveBeenCalledOnce();
  });
  it('checks actual decoded duration even when the recording timer is short', async () => {
    const close = vi.fn(async () => undefined);
    vi.stubGlobal('AudioContext', class { close = close; decodeAudioData = async () => ({ duration: 301, numberOfChannels: 2 }); });
    await expect(inspectSoundFile(new File([new Uint8Array([1])], 'capture.webm'), { knownDuration: 0.5 })).rejects.toThrow('no longer than five minutes');
    expect(close).toHaveBeenCalledOnce();
  });
});


it('distinguishes header-verified WAV and compressed byte budgets', () => {
  const wav = encodeTakeWav(generateSoundAudio(recipe, 8000));
  expect(soundSourceByteLimit(wav)).toBe(64 * 1024 * 1024);
  expect(soundSourceByteLimit(new Uint8Array([1, 2, 3]))).toBe(20 * 1024 * 1024);
  expect(SOUND_LIMITS.bytes).toBe(256 * 1024 * 1024);
});
