import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { createStoryCode, MemoryStore, type GroupRevision, type Store, type Story } from '@chatter/shared';
import { installOpfsShim } from '@chatter/shared/testing/opfs-shim';
import { IdbStore, STORES } from './store-idb.js';

installOpfsShim();
let sequence = 0;
const revision = (): GroupRevision => ({
  id: 'caller-revision', createdAt: 1, updatedAt: 1, groupCode: createStoryCode(),
  contributionId: 'piece', kind: 'piece', authorId: 'child', authorName: 'Maya',
  title: 'My perspective', storyTitle: 'Lunch', snapshotHash: `sha256:${'a'.repeat(64)}`,
  contentHash: `sha256:${'b'.repeat(64)}`, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }] },
});

for (const kind of ['memory', 'idb'] as const) {
  describe(`${kind} group revision contract`, () => {
    const open = async (): Promise<Store> => {
      const store = kind === 'memory' ? new MemoryStore() : new IdbStore(`group-contract-${sequence++}`);
      await store.open(); return store;
    };
    test('retains caller identity and immutable clone-safe snapshots', async () => {
      const store = await open();
      try {
        const input = revision();
        const expected = structuredClone(input);
        const created = await store.groupRevisions.create(input);
        input.body.content = []; created.authorName = 'Changed';
        const fetched = (await store.groupRevisions.get(input.id))!;
        fetched.body.content = [];
        const listed = await store.groupRevisions.list(); listed[0]!.title = 'Changed';
        const events = await store.events.all();
        for (const event of events) if (event.payload && typeof event.payload === 'object') (event.payload as GroupRevision).title = 'Changed via log';
        expect(await store.groupRevisions.get(input.id)).toEqual(expected);
        await expect(store.groupRevisions.update(input.id, { title: 'Changed' })).rejects.toThrow(/immutable/i);
        await expect(store.groupRevisions.create(expected)).rejects.toThrow();
        expect(await store.groupRevisions.list()).toEqual([expected]);
      } finally { if (store instanceof IdbStore) store.close(); }
    });
    test('captures its input before yielding to the caller', async () => {
      const store = await open();
      try {
        const input = revision();
        const expected = structuredClone(input);
        const pending = store.groupRevisions.create(input);
        input.body.content = [];
        expect(await pending).toEqual(expected);
        expect(await store.groupRevisions.get(input.id)).toEqual(expected);
      } finally { if (store instanceof IdbStore) store.close(); }
    });
    test('rejects invalid codes without saving a revision or an event', async () => {
      const store = await open();
      try {
        await expect(store.groupRevisions.create({ ...revision(), groupCode: 'bad-code' })).rejects.toThrow();
        expect(await store.groupRevisions.list()).toEqual([]);
        expect(await store.events.all()).toEqual([]);
      } finally { if (store instanceof IdbStore) store.close(); }
    });
    test('preserves group membership and explicitly attached unused media on story creation and updates', async () => {
      const store = await open();
      try {
        const group: NonNullable<Story['group']> = { code: createStoryCode(), kind: 'piece', rootId: 'root', contributionId: 'piece', authorId: 'child', authorName: 'Maya', usedRevisionIds: ['prior'] };
        const created = await store.stories.create({ title: 'Lunch', portableId: 'old-portable-id', group, attachedAssetIds: ['unused-photo'] });
        expect(await store.stories.get(created.id)).toMatchObject({ group, attachedAssetIds: ['unused-photo'], portableId: 'old-portable-id' });
        await store.stories.update(created.id, { group: { ...group, lastRevisionId: 'saved' }, attachedAssetIds: ['unused-photo', 'interview'] });
        expect(await store.stories.get(created.id)).toMatchObject({ group: { lastRevisionId: 'saved' }, attachedAssetIds: ['unused-photo', 'interview'] });
        await expect(store.stories.create({ title: 'Invalid', group: { ...group, code: 'bad-code' } })).rejects.toThrow();
        await expect(store.stories.update(created.id, { group: { ...group, code: 'bad-code' } })).rejects.toThrow();
        expect(await store.stories.list()).toHaveLength(1);
      } finally { if (store instanceof IdbStore) store.close(); }
    });
  });
}

test('version 12 upgrades without losing work and group records survive reopening', async () => {
  const name = `group-v12-upgrade-${sequence++}`;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 12);
    request.onupgradeneeded = () => {
      for (const collection of STORES.filter(item => item !== 'groupRevisions')) request.result.createObjectStore(collection, { keyPath: collection === 'meta' ? 'key' : 'id' });
      request.transaction!.objectStore('stories').put({ id: 'old', title: 'Keep my work', portableId: 'original-portable', body: { type: 'doc', content: [] } });
      request.transaction!.objectStore('soundItems').put({ id: 'old-sound', name: 'Keep this sound' });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  const store = new IdbStore(name); await store.open();
  const saved = await store.groupRevisions.create(revision());
  const group: NonNullable<Story['group']> = { code: saved.groupCode, kind: 'main', contributionId: 'main', authorId: 'child', authorName: 'Maya' };
  await store.stories.update('old', { group, attachedAssetIds: ['unused-photo'] });
  store.close();
  const reopened = new IdbStore(name); await reopened.open();
  try {
    expect(await reopened.groupRevisions.get(saved.id)).toEqual(saved);
    expect(await reopened.stories.get('old')).toMatchObject({ title: 'Keep my work', portableId: 'original-portable', group, attachedAssetIds: ['unused-photo'] });
    expect(await reopened.soundItems.get('old-sound')).toMatchObject({ name: 'Keep this sound' });
  } finally { reopened.close(); }
});
