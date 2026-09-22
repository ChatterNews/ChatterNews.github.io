import { inspectSoundFile } from './sound-engine.js';
import { describe, it, expect, vi } from 'vitest';
import { MemoryStore, Gate, DEFAULT_GATE_CONFIG, makeSoundProject, emptySoundAttribution } from '@chatter/shared';
import { saveSoundProject, saveSoundVersion, validateSoundSources, recoverSoundOperations, importSoundFile, importSoundRecording } from './sound-repository.js';
vi.mock('./sound-engine.js', () => ({ inspectSoundFile: vi.fn(async () => ({ duration: .5, peaks: [.2] })), soundSourceByteLimit: () => 20 * 1024 * 1024 }));
const setup = () => { const store = new MemoryStore(); return { store, gate: new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, classify: async () => 0 }) }; };
const render = { bytes: new Uint8Array([1, 2, 3]), duration: .5, peaks: [.2], peak: .2 };
describe('sound repository', () => {
  it('keeps distinct metadata for same bytes and checks the real deduplicated status', async () => {
    const { store, gate } = setup(); const file = new File([render.bytes], 'bell.wav', { type: 'audio/wav' });
    const a = await importSoundFile(store, gate, file, { ...emptySoundAttribution(), creator: 'A' });
    const b = await importSoundFile(store, gate, file, { ...emptySoundAttribution(), creator: 'B' });
    expect(a.assetId).toBe(b.assetId); expect(a.id).not.toBe(b.id);
    expect((await store.soundItems.list()).map(i => i.attribution.creator)).toEqual(['A', 'B']);
    expect((await store.assets.get(a.assetId))?.gateStatus).toBe('QUARANTINED');
    const p = makeSoundProject('Source'); p.clips.push({ id: 'clip', name: 'bell', trackId: p.tracks[0]!.id, assetId: a.assetId, start: 0, sourceIn: 0, sourceOut: .5, rate: 1, repeats: 1, gainDb: 0, fadeIn: 0, fadeOut: 0 });
    await expect(validateSoundSources(store, p)).rejects.toThrow('review');
  });
  it('trusts duration only for a captured recording and stores normalized WAV bytes', async () => {
    const external = setup(); const inspector = vi.mocked(inspectSoundFile);
    await importSoundFile(external.store, external.gate, new File([new Uint8Array([6])], 'external.mp3'), emptySoundAttribution(), { knownDuration: 1 } as never);
    expect(inspector.mock.calls.at(-1)?.[1]).not.toHaveProperty('knownDuration');
    expect((await external.store.assets.list())[0]?.mime).toBe('audio/mpeg');
    const own = setup(); const wav = new Uint8Array([7, 8, 9]); inspector.mockResolvedValueOnce({ duration: .5, peaks: [.2], normalizedBytes: wav });
    const item = await importSoundRecording(own.store, own.gate, new File([new Uint8Array([5])], 'Take.webm', { type: 'audio/webm' }), emptySoundAttribution(), { duration: .6 });
    expect(inspector.mock.calls.at(-1)?.[1]).toHaveProperty('knownDuration', .6);
    const asset = await own.store.assets.get(item.assetId); expect(asset?.mime).toBe('audio/wav'); expect(asset?.gateStatus).toBe('APPROVED');
    expect(await own.store.blobs.get(asset!.sha256)).toEqual(wav);
    expect(item).not.toHaveProperty('normalizedBytes');
  });
  it('recovers an interrupted publication exactly once with frozen credits', async () => {
    const { store, gate } = setup(); const p = await saveSoundProject(store, { ...makeSoundProject('Cue'), credits: 'Sound design: Lee' }, 0);
    const original = store.soundItems.create.bind(store.soundItems); const spy = vi.spyOn(store.soundItems, 'create').mockRejectedValueOnce(new Error('quota'));
    await expect(saveSoundVersion(store, gate, p, render)).rejects.toThrow('quota');
    spy.mockImplementation(original); await recoverSoundOperations(store);
    const item = await saveSoundVersion(store, gate, p, render);
    expect(await store.soundItems.list()).toHaveLength(1); expect(await store.soundRevisions.list()).toHaveLength(1);
    expect((await store.soundRevisions.get(item.revisionId!))?.snapshot.credits).toBe('Sound design: Lee');
  });
  it('fails closed if an output hash was previously quarantined', async () => {
    const { store, gate } = setup(); await gate.ingest({ bytes: render.bytes, source: 'upload', meta: { kind: 'AUDIO', mime: 'audio/wav' } });
    const p = await saveSoundProject(store, makeSoundProject('Cue'), 0);
    await expect(saveSoundVersion(store, gate, p, render)).rejects.toThrow('review');
    expect(await store.soundItems.list()).toHaveLength(0);
  });
});
