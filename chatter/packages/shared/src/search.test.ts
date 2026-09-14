import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { searchEverything } from './search.js';
import type { Store } from './store.js';

let store: Store;
let tacoId: string;

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();

  const taco = await store.stories.create({
    title: 'Taco bar',
    body: doc('The cafeteria is adding a taco bar on Wednesdays.'),
  });
  tacoId = taco.id;

  await store.stories.create({
    title: 'Gym floor',
    body: doc('The gym floor has been taped off for three weeks.'),
  });
});

describe('searchEverything', () => {
  test('finds a story by its title', async () => {
    const hits = await searchEverything(store, 'gym');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.title).toBe('Gym floor');
  });

  test('finds a story by what is written in it', async () => {
    const hits = await searchEverything(store, 'Wednesdays');
    expect(hits[0]!.title).toBe('Taco bar');
    expect(hits[0]!.where).toBe('what you wrote');
  });

  test('FINDS A STORY BY WHAT SOMEBODY SAID OUT LOUD', async () => {
    // The whole point of Reruns: the tape is searchable, not just the script.
    const asset = await store.assets.unsafeCreate({
      kind: 'AUDIO', origin: 'RECORDING', sha256: 'sha256:take3',
      path: 'p', mime: 'audio/webm', bytes: 1, gateStatus: 'APPROVED',
    });
    await store.takes.create({ storyId: tacoId, userId: 'u1', assetId: asset.id, durationSec: 58 });
    await store.transcripts.create({
      assetId: asset.id,
      text: 'Ms. Whitfield said the pasta line was the least taken option.',
      segments: [],
    });

    const hits = await searchEverything(store, 'Whitfield');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.storyId).toBe(tacoId);
    expect(hits[0]!.where).toBe('what somebody said');
  });

  test('is case-insensitive, because kids type how they type', async () => {
    expect(await searchEverything(store, 'TACO')).toHaveLength(1);
  });

  test('shows the words around the match so you can see why it matched', async () => {
    const hits = await searchEverything(store, 'Wednesdays');
    expect(hits[0]!.snippet).toContain('Wednesdays');
  });

  test('an empty search returns nothing rather than everything', async () => {
    expect(await searchEverything(store, '   ')).toHaveLength(0);
  });

  test('a search that matches nothing returns nothing', async () => {
    expect(await searchEverything(store, 'zebra')).toHaveLength(0);
  });

  test('one story matching in two places is listed once', async () => {
    const asset = await store.assets.unsafeCreate({
      kind: 'AUDIO', origin: 'RECORDING', sha256: 'sha256:take4',
      path: 'p', mime: 'audio/webm', bytes: 1, gateStatus: 'APPROVED',
    });
    await store.takes.create({ storyId: tacoId, userId: 'u1', assetId: asset.id, durationSec: 10 });
    await store.transcripts.create({ assetId: asset.id, text: 'taco taco taco', segments: [] });

    const hits = await searchEverything(store, 'taco');
    expect(hits.filter((h) => h.storyId === tacoId)).toHaveLength(1);
  });
});
