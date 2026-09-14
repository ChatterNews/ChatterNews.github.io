import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { installOpfsShim } from '@chatter/shared/testing/opfs-shim';
import { MemoryStore } from '@chatter/shared';
import { seedDemoNewsroom } from './seed.js';

installOpfsShim();

describe('seedDemoNewsroom', () => {
  test('leaves a fresh store empty until the demo is requested', async () => {
    const store = new MemoryStore('device-aaa');
    await store.open();
    expect(await store.stories.list()).toHaveLength(0);

    await seedDemoNewsroom(store);
    expect((await store.stories.list()).length).toBe(7);
  });

  test('does nothing on a store that already has work in it', async () => {
    const store = new MemoryStore('device-aaa');
    await store.open();
    await seedDemoNewsroom(store);
    await seedDemoNewsroom(store);
    expect((await store.stories.list()).length).toBe(7);
  });

  test('two concurrent callers do not seed everything twice', async () => {
    // React StrictMode invokes the opening effect twice. Before the in-flight
    // guard, both runs saw an empty store and the club opened with 14 stories.
    const store = new MemoryStore('device-aaa');
    await store.open();
    await Promise.all([seedDemoNewsroom(store), seedDemoNewsroom(store)]);
    expect((await store.stories.list()).length).toBe(7);
  });

  test('never invents a duplicate slug', async () => {
    const store = new MemoryStore('device-aaa');
    await store.open();
    await Promise.all([seedDemoNewsroom(store), seedDemoNewsroom(store)]);
    const slugs = (await store.stories.list()).map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test('gives mixed-channel demo stories an explicit primary creation route', async () => {
    const store = new MemoryStore('device-aaa');
    await store.open();
    await seedDemoNewsroom(store);

    const stories = await store.stories.list();
    expect(stories.find((story) => story.title === 'Mr. Alvarez')).toMatchObject({
      channels: ['pod', 'web'],
      creationRecipeId: 'article',
    });
    expect(stories.find((story) => story.title === 'Taco bar')).toMatchObject({
      creationRecipeId: 'podcast',
    });
  });

  test('repairs the primary route in an existing legacy demo without reseeding it', async () => {
    const store = new MemoryStore('device-aaa');
    await store.open();
    const legacy = await store.stories.create({
      title: 'Mr. Alvarez',
      channels: ['pod', 'web'],
      status: 'WORK',
    });

    await seedDemoNewsroom(store);

    expect(await store.stories.list()).toHaveLength(1);
    expect(await store.stories.get(legacy.id)).toMatchObject({ creationRecipeId: 'article' });
  });
});
