import { describe, expect, test } from 'vitest';
import { DEFAULT_GATE_CONFIG, Gate, MemoryStore, makePodcastClip, createPodcastProject, createPodcastShow, releaseFromQuarantine } from '@chatter/shared';
import { alignConversation, packContributions, phoneAudioMime, importPhoneRecording } from './podcast-assembly.js';
const clip = (name: string, cue: number, duration = 20) => ({ ...makePodcastClip({ assetId: name, name, trackId: name, durationSec: duration }), syncCueSec: cue });
test('shared cues align without changing source samples, trims or relative timing', () => {
  const a = { ...clip('A', 3), trimInSec: 1 }, b = clip('B', 8);
  const aligned = alignConversation([a, b]);
  expect(aligned[0]!.startSec).toBe(6); expect(aligned[1]!.startSec).toBe(0);
  expect(aligned[0]!.startSec + 3 - 1).toBe(aligned[1]!.startSec + 8);
  expect(a.startSec).toBe(0); expect(aligned[0]!.trimInSec).toBe(1);
});
test('alignment respects cuts before a cue and rejects marks removed by a cut', () => {
  const a = { ...clip('A', 5), omittedRanges: [{ start: 1, end: 3 }] };
  expect(alignConversation([a, clip('B', 5)])[0]!.startSec).toBe(2);
  expect(() => alignConversation([{ ...a, syncCueSec: 2 }, clip('B', 5)])).toThrow(/outside/);
  expect(() => alignConversation([{ ...a, syncCueSec: undefined }, clip('B', 5)])).toThrow(/Mark/);
  expect(() => alignConversation([{ ...a, syncCueSec: NaN }, clip('B', 5)])).toThrow(/Mark/);
});
test('contributions follow chosen order, union overlapping cuts, and leave the chosen gap', () => {
  const a = { ...clip('A', 2, 10), omittedRanges: [{ start: 2, end: 5 }, { start: 3, end: 6 }] };
  const result = packContributions([a, clip('B', 1)], .5);
  expect(result[1]!.startSec).toBe(6.5); expect(a.startSec).toBe(0);
  expect(() => packContributions([a], NaN)).toThrow(/gap/);
});
test('Voice Memos with empty MIME types get the correct audio container type', () => {
  expect(phoneAudioMime({ name: 'Reporter.M4A', type: '' })).toBe('audio/mp4');
  expect(phoneAudioMime({ name: 'Reporter.mp3', type: '' })).toBe('audio/mpeg');
});
describe('phone ingestion', () => {
  test('stores quarantined phone audio and returns a durable named clip on a separate voice track', async () => {
    const store = new MemoryStore(); await store.open();
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, async classify() { return 0; } });
    const show = createPodcastShow({ title: 'Our show' });
    const project = createPodcastProject(show, {});
    const file = new File([new Uint8Array([1, 2, 3])], 'Maya.m4a');
    const result = await importPhoneRecording({ store, gate, file, project, mode: 'CONVERSATION', decode: async () => ({ sampleRate: 48000, channels: [], duration: 12 }) });
    expect(result.status).toBe('QUARANTINED'); expect(result.clip.name).toBe('Maya'); expect(result.track!.id).toBe(result.clip.trackId);
    expect(result.track!.id).not.toBe(project.tracks[0]!.id);
    const asset = (await store.assets.get(result.clip.assetId))!;
    expect(asset.mime).toBe('audio/mp4'); expect(await store.blobs.has(asset.sha256)).toBe(true);
    await releaseFromQuarantine(store, asset.id, { actor: 'teacher', role: 'ADVISER' });
    expect((await store.assets.get(asset.id))!.gateStatus).toBe('APPROVED');
    await store.podcastShows.create(show);
    const saved = await store.podcastProjects.create({ ...project, clips: [{ ...result.clip, syncCueSec: 2.35 }], tracks: [...project.tracks, result.track!] });
    expect((await store.podcastProjects.get(saved.id))!.clips[0]!.syncCueSec).toBe(2.35);
  });
  test('invalid audio fails before making an asset', async () => {
    const store = new MemoryStore(); await store.open();
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, async classify() { return 0; } });
    const project = createPodcastProject(createPodcastShow({ title: 'Show' }), {});
    await expect(importPhoneRecording({ store, gate, file: new File(['bad'], 'bad.m4a'), project, mode: 'SEQUENCE', decode: async () => { throw Error('decode'); } })).rejects.toThrow(/rendered M4A/);
    expect(await store.assets.list()).toHaveLength(0);
  });
});
