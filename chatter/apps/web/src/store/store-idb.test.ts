/**
 * The browser store runs the SAME contract as the memory store.
 * If this passes, no room can tell which one is underneath it.
 */
import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { installOpfsShim } from '@chatter/shared/testing/opfs-shim';
import { testStoreContract } from '@chatter/shared/testing/store-contract';
import { MemoryStore, setupAdviser } from '@chatter/shared';
import { eraseNewsroomWithPin, IdbStore } from './store-idb.js';

installOpfsShim();

testStoreContract('MemoryStore (tests and the Tier 0 fallback)', async () => {
  const store = new MemoryStore('device-aaa');
  await store.open();
  return store;
});

let n = 0;
testStoreContract('IdbStore (IndexedDB + OPFS, the real Chromebook path)', async () => {
  // A uniquely named database per test. Deleting a shared one instead would
  // block on the previous test's still-open connection.
  const store = new IdbStore(`chatter-test-${n++}`);
  await store.open();
  return store;
});

describe('local newsroom reset', () => {
  test('requires the adviser PIN before erasing the newsroom', async () => {
    const store = new IdbStore(`chatter-protected-erase-${n++}`);
    await store.open();
    await setupAdviser(store, { authorizationCode: '1895', penName: 'Ms. Rivera', pin: '2468' });
    const story = await store.stories.create({ title: 'Book fair' });

    await expect(eraseNewsroomWithPin(store, '9999')).rejects.toThrow(/PIN/i);
    expect(await store.stories.get(story.id)).toMatchObject({ title: 'Book fair' });

    await eraseNewsroomWithPin(store, '2468');
    expect(await store.stories.list()).toEqual([]);
    expect(await store.users.list()).toEqual([]);
  });

  test('erases every record and media byte while leaving the store ready to use', async () => {
    const store = new IdbStore(`chatter-erase-${n++}`);
    await store.open();
    await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT', active: true });
    await store.stories.create({ title: 'Book fair' });
    await store.settings.save({ setupVersion: 1, adviserPin: '2468' });
    const hash = await store.blobs.put(new Uint8Array([4, 2, 4, 2]));

    await store.eraseAll();

    expect(await store.users.list()).toEqual([]);
    expect(await store.stories.list()).toEqual([]);
    expect(await store.events.all()).toEqual([]);
    expect(await store.settings.get()).toEqual({});
    expect(await store.blobs.has(hash)).toBe(false);
    expect(await store.stories.create({ title: 'Fresh start' })).toMatchObject({ title: 'Fresh start' });
  });
});
