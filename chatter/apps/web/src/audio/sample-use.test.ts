import { DEFAULT_GATE_CONFIG, Gate, MemoryStore } from '@chatter/shared';
import { describe, expect, it } from 'vitest';
import type { SampleLibraryEntry } from './sample-library.js';
import { ingestShelfSample } from './sample-use.js';

function shelfEntry(bytes = new Uint8Array([1, 3, 3, 7])): SampleLibraryEntry {
  const file = new File([bytes], 'school-bell.wav', { type: 'audio/wav', lastModified: 50 });
  return {
    id: 'bell', name: file.name, relativePath: 'FX/school-bell.wav', category: 'FX',
    size: file.size, lastModified: file.lastModified, mime: file.type, extension: 'WAV',
    getFile: async () => file,
  };
}

describe('using a Sound Shelf file', () => {
  it('ingests selected bytes through the Gate and credits the current story', async () => {
    const store = new MemoryStore('studio-one');
    await store.open();
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, async classify() { return 1; } });

    const result = await ingestShelfSample({ gate, store, entry: shelfEntry(), storyId: 'story-one', actorId: 'kid-one' });

    expect(result.status).toBe('QUARANTINED');
    expect(result.assetId).toBeTruthy();
    expect(result.bytes).toEqual(new Uint8Array([1, 3, 3, 7]));
    expect((await store.assets.get(result.assetId))?.origin).toBe('UPLOAD');
    expect(await store.credits.list()).toMatchObject([{ assetId: result.assetId, storyId: 'story-one', usedIn: 'story' }]);
  });

  it('adds one story credit when the same hashed sound is reused', async () => {
    const store = new MemoryStore('studio-two');
    await store.open();
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, async classify() { return 1; } });
    const entry = shelfEntry();

    await ingestShelfSample({ gate, store, entry, storyId: 'story-one' });
    await ingestShelfSample({ gate, store, entry, storyId: 'story-two' });
    await ingestShelfSample({ gate, store, entry, storyId: 'story-two' });

    const credits = await store.credits.list();
    expect(credits.map((credit: { storyId?: string }) => credit.storyId).sort()).toEqual(['story-one', 'story-two']);
    expect(await store.assets.list()).toHaveLength(1);
  });
});
