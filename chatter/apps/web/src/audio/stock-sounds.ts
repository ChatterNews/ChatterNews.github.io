import { sha256, type Gate, type Store, type SoundAttribution, type SoundLibraryItem, validateSoundItem } from '@chatter/shared';
import catalog from '../../public/sounds/foley/v1/catalog.json';
import { runSoundOperation } from './sound-repository.js';

export interface StockSound {
  id: string; name: string; category: string; description: string; path: string;
  sha256: string; bytes: number; duration: number; peaks: number[]; peak: number;
  sampleRate: number; channels: number; bits: number; originalFile: string; attribution: SoundAttribution;
}
export const stockSounds: readonly StockSound[] = catalog;
export const stockSoundFamilies = ['Transitions', 'Everyday', 'Footsteps', 'Places', 'Signals', 'Short cues'];
export function stockSoundUrl(sound: StockSound) { return `${import.meta.env.BASE_URL}${sound.path.replace(/^\//, '')}`; }

/** Only frozen catalog bytes receive stock approval. Uploaded metadata never enters this path. */
export async function adoptStockSound(store: Store, gate: Gate, id: string, options: { signal?: AbortSignal; onProgress?: (message: string) => void } = {}): Promise<SoundLibraryItem> {
  const sound = stockSounds.find(row => row.id === id); if (!sound) throw new Error('That included sound is unavailable.');
  return runSoundOperation(store, `stock-${id}`, async () => {
    options.signal?.throwIfAborted(); const itemId = `foley-stock-${id}`;
    const existing = await store.soundItems.get(itemId);
    if (existing) {
      const asset = await store.assets.get(existing.assetId); const bytes = asset ? await store.blobs.get(asset.path) : undefined;
      if (asset?.gateStatus === 'APPROVED' && asset.sha256 === sound.sha256 && bytes && await sha256(bytes) === sound.sha256) return existing;
      if (asset && asset.gateStatus !== 'APPROVED') throw new Error('This sound already has a local review decision. Ask an adviser to review it in Sounds.');
      throw new Error('This saved sound is missing or damaged. Restore its audio in Media Bin.');
    }
    options.onProgress?.(`Getting ${sound.name}…`);
    const response = await fetch(stockSoundUrl(sound), { signal: options.signal });
    if (!response.ok) throw new Error('This included sound could not load. Connect to the website and try again.');
    const bytes = new Uint8Array(await response.arrayBuffer()); options.signal?.throwIfAborted();
    if (bytes.byteLength !== sound.bytes || await sha256(bytes) !== sound.sha256) throw new Error('This sound did not match the included library. Refresh the app and try again.');
    options.onProgress?.(`Saving ${sound.name}…`);
    const result = await gate.ingest({ bytes, source: 'upload', bundledSoundId: sound.id, meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'UPLOAD', creator: sound.attribution.creator, license: sound.attribution.license, sourceUrl: sound.attribution.sourceUrl } });
    const asset = result.assetId ? await store.assets.get(result.assetId) : undefined;
    if (!asset || asset.gateStatus === 'REJECTED' || asset.sha256 !== sound.sha256) throw new Error('This sound needs local media review before it can be used.');
    const item: SoundLibraryItem = { id: itemId, createdAt: Date.now(), updatedAt: Date.now(), assetId: asset.id, name: sound.name, attribution: structuredClone(sound.attribution), tags: [sound.category, 'Included sounds'], collectionIds: [], favorite: false, archived: false, duration: sound.duration, peaks: [...sound.peaks] };
    validateSoundItem(item); return store.soundItems.create(item);
  });
}
