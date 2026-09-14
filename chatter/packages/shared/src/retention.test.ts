import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { runRetention } from './retention.js';
import type { Store } from './store.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 15);           // 15 Sep 2026

let store: Store;
beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
});

async function anAsset(opts: { expiresAt?: number } = {}) {
  // The hash IS the blob's name, so take it from put() rather than inventing
  // one - otherwise the Asset points at bytes that are not there.
  const sha256 = await store.blobs.put(
    new TextEncoder().encode(`take-${Math.random()}`));
  return store.assets.unsafeCreate({
    kind: 'AUDIO', origin: 'RECORDING', sha256,
    path: sha256, mime: 'audio/webm', bytes: 10, gateStatus: 'APPROVED',
    ...(opts.expiresAt !== undefined ? { expiresAt: opts.expiresAt } : {}),
  });
}

describe('runRetention - raw material expires, published work does not', () => {
  test('deletes a take that is past its expiry', async () => {
    const asset = await anAsset({ expiresAt: NOW - DAY });
    const result = await runRetention(store, { now: NOW });

    expect(result.assetsDeleted).toBe(1);
    expect(await store.assets.get(asset.id)).toBeUndefined();
  });

  test('the bytes go too, not just the record', async () => {
    const asset = await anAsset({ expiresAt: NOW - DAY });
    await runRetention(store, { now: NOW });
    expect(await store.blobs.has(asset.sha256)).toBe(false);
  });

  test('leaves a take that has not expired yet', async () => {
    const asset = await anAsset({ expiresAt: NOW + DAY });
    await runRetention(store, { now: NOW });
    expect(await store.assets.get(asset.id)).toBeTruthy();
  });

  test('leaves an asset with no expiry at all', async () => {
    const asset = await anAsset();
    await runRetention(store, { now: NOW });
    expect(await store.assets.get(asset.id)).toBeTruthy();
  });

  test('NEVER touches anything a published Episode references', async () => {
    const asset = await anAsset({ expiresAt: NOW - 400 * DAY });
    const story = await store.stories.create({ title: 'Taco bar', status: 'DONE' });
    await store.takes.create({ storyId: story.id, userId: 'u1', assetId: asset.id, durationSec: 58 });
    await store.episodes.create({
      title: 'Taco bar', publishedAt: NOW - 300 * DAY, channel: 'pod', storyIds: [story.id],
    });

    const result = await runRetention(store, { now: NOW });

    expect(await store.assets.get(asset.id)).toBeTruthy();
    expect(await store.blobs.has(asset.sha256)).toBe(true);
    expect(result.assetsSpared).toBe(1);
  });

  test('deletes the transcript and take rows along with the asset', async () => {
    const asset = await anAsset({ expiresAt: NOW - DAY });
    await store.takes.create({ storyId: 's1', userId: 'u1', assetId: asset.id, durationSec: 10 });
    await store.transcripts.create({ assetId: asset.id, text: 'gone', segments: [] });

    await runRetention(store, { now: NOW });

    expect(await store.takes.list()).toHaveLength(0);
    expect(await store.transcripts.list()).toHaveLength(0);
  });

  test('writes what it did to the audit log', async () => {
    await anAsset({ expiresAt: NOW - DAY });
    await runRetention(store, { now: NOW });
    const swept = (await store.events.all()).find((e) => e.action === 'retention.swept');
    expect((swept!.payload as any).assetsDeleted).toBe(1);
  });

  test('running it twice does not double-count', async () => {
    await anAsset({ expiresAt: NOW - DAY });
    await runRetention(store, { now: NOW });
    expect((await runRetention(store, { now: NOW })).assetsDeleted).toBe(0);
  });
});

describe('runRetention - the year rollover', () => {
  // The school year turns over on 1 August. Anyone on the roster from before
  // the most recent turnover is last year's roster.
  test('purges last year\'s roster and its releases', async () => {
    const kid = await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT' });
    await store.releases.create({ userId: kid.id, status: 'ON_FILE' });

    const result = await runRetention(store, { now: Date.UTC(2027, 8, 1) });

    expect(result.usersPurged).toBe(1);
    expect(await store.users.list()).toHaveLength(0);
    expect(await store.releases.list()).toHaveLength(0);
  });

  test('leaves this year\'s roster alone', async () => {
    const kid = await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT' });
    await store.releases.create({ userId: kid.id, status: 'ON_FILE' });

    await runRetention(store, { now: NOW });

    expect(await store.users.list()).toHaveLength(1);
    expect(await store.releases.list()).toHaveLength(1);
  });

  test('keeps an adviser through the rollover - it is the kids whose data expires', async () => {
    await store.users.create({ name: 'Ms. Boone', penName: 'Ms. Boone', role: 'ADVISER' });
    await runRetention(store, { now: Date.UTC(2027, 8, 1) });
    expect(await store.users.list()).toHaveLength(1);
  });
});
