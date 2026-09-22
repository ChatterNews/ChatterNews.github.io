import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore, Gate, DEFAULT_GATE_CONFIG, sha256 } from '@chatter/shared';
import { STOCK_SOUND_HASHES } from '../../../../packages/shared/src/stock-sound-hashes.js';
import { adoptStockSound, stockSounds } from './stock-sounds.js';
import { exportSoundPack, importSoundPack } from './sound-pack.js';

const setup = () => { const store = new MemoryStore(); return { store, gate: new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, classify: async () => 0 }) }; };
const sound = stockSounds.find(s => s.id === 'page-turn')!;
const sourceBytes = (path: string) => readFile(new URL(`../../public${path}`, import.meta.url));
async function serve() { const bytes = await sourceBytes(sound.path); const fetcher = vi.fn(async () => new Response(bytes)); vi.stubGlobal('fetch', fetcher); return { bytes, fetcher }; }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('included sound library', () => {
  it('ships every catalog sound with its exact permission hash, valid PCM header and source credit', async () => {
    expect(stockSounds).toHaveLength(38);
    expect(new Set(stockSounds.map(s => s.id)).size).toBe(stockSounds.length);
    expect(Object.keys(STOCK_SOUND_HASHES).sort()).toEqual(stockSounds.map(s => s.id).sort());
    for (const entry of stockSounds) {
      const bytes = await sourceBytes(entry.path);
      expect(bytes.length).toBe(entry.bytes); expect(await sha256(bytes)).toBe(entry.sha256);
      expect(STOCK_SOUND_HASHES[entry.id]).toBe(entry.sha256);
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF'); expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
      expect(entry.duration).toBeGreaterThan(0); expect(entry.peaks.some(p => p > 0)).toBe(true);
      expect(entry.attribution.license).toBe('CC0 1.0'); expect(entry.attribution.creator).toBeTruthy();
      expect(entry.attribution.sourceUrl).toMatch(/^https:\/\//);
    }
  });
  it('adopts authentic bytes once, retaining edits and avoiding subsequent downloads', async () => {
    const { store, gate } = setup(); const { bytes, fetcher } = await serve();
    const first = await adoptStockSound(store, gate, sound.id);
    expect(first.attribution).toEqual(sound.attribution);
    const asset = (await store.assets.get(first.assetId))!; expect(asset.gateStatus).toBe('APPROVED');
    expect(await store.blobs.get(asset.path)).toEqual(new Uint8Array(bytes));
    await store.soundItems.update(first.id, { favorite: true, name: 'Our page turn' });
    expect(await adoptStockSound(store, gate, sound.id)).toMatchObject({ id: first.id, favorite: true, name: 'Our page turn' });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(await store.assets.list()).toHaveLength(1);
  });
  it('rejects unavailable, altered and cancelled downloads before saving assets', async () => {
    const { store, gate } = setup(); const { bytes, fetcher } = await serve();
    await expect(adoptStockSound(store, gate, 'unknown')).rejects.toThrow('unavailable');
    fetcher.mockImplementationOnce(async () => new Response(null, { status: 503 }));
    await expect(adoptStockSound(store, gate, sound.id)).rejects.toThrow('could not load');
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    fetcher.mockImplementationOnce(async () => new Response(bytes));
    await expect(adoptStockSound(store, gate, sound.id)).rejects.toThrow('did not match');
    await expect(adoptStockSound(store, gate, sound.id, { signal: AbortSignal.abort() })).rejects.toThrow();
    expect(await store.assets.list()).toHaveLength(0); expect(await store.soundItems.list()).toHaveLength(0);
  });
  it('can retry after a library write fails without duplicating the saved audio', async () => {
    const { store, gate } = setup(); await serve();
    vi.spyOn(store.soundItems, 'create').mockRejectedValueOnce(new Error('quota'));
    await expect(adoptStockSound(store, gate, sound.id)).rejects.toThrow('quota');
    await adoptStockSound(store, gate, sound.id);
    expect(await store.assets.list()).toHaveLength(1); expect(await store.soundItems.list()).toHaveLength(1);
  });
  it('preserves bytes and credits through a pack while requiring local review on the receiving device', async () => {
    const source = setup(); await serve(); await adoptStockSound(source.store, source.gate, sound.id);
    const pack = await exportSoundPack(source.store); const target = setup();
    await importSoundPack(target.store, target.gate, pack.blob);
    const item = (await target.store.soundItems.list())[0]!;
    expect(item.attribution).toEqual(sound.attribution);
    const asset = (await target.store.assets.get(item.assetId))!;
    expect(asset.gateStatus).toBe('QUARANTINED'); expect(await sha256((await target.store.blobs.get(asset.path))!)).toBe(sound.sha256);
    // Selecting the stock entry cannot override that earlier review decision.
    const adopted = await adoptStockSound(target.store, target.gate, sound.id);
    expect((await target.store.assets.get(adopted.assetId))?.gateStatus).toBe('QUARANTINED');
    await expect(adoptStockSound(target.store, target.gate, sound.id)).rejects.toThrow('review');
  });
});
