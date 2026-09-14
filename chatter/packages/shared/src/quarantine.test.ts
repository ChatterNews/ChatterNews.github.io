import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { Gate } from './gate-ingest.js';
import { DEFAULT_GATE_CONFIG } from './gate.js';
import { quarantined, releaseFromQuarantine, rejectFromQuarantine } from './quarantine.js';
import type { Store } from './store.js';

const PICTURE = new TextEncoder().encode('a picture the checker was unsure about');

let store: Store;

/** The checker is up, but this one landed between the thresholds. */
async function anUncertainPicture() {
  const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0.4; } });
  const result = await gate.ingest({
    bytes: PICTURE, source: 'upload',
    meta: { kind: 'IMAGE', mime: 'image/jpeg', origin: 'UPLOAD' },
  });
  return result.assetId!;
}

beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
});

describe('the quarantine queue', () => {
  test('lists what is waiting for a teacher', async () => {
    await anUncertainPicture();
    const waiting = await quarantined(store);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.gateStatus).toBe('QUARANTINED');
  });

  test('does not list things that already got through', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0.01; } });
    await gate.ingest({ bytes: PICTURE, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    expect(await quarantined(store)).toHaveLength(0);
  });
});

describe('a teacher letting one through', () => {
  test('marks it approved so it can be used', async () => {
    const assetId = await anUncertainPicture();
    await releaseFromQuarantine(store, assetId, { actor: 'ms-boone', role: 'ADVISER' });
    expect((await store.assets.get(assetId))!.gateStatus).toBe('APPROVED');
  });

  test('keeps the bytes, obviously', async () => {
    const assetId = await anUncertainPicture();
    const asset = (await store.assets.get(assetId))!;
    await releaseFromQuarantine(store, assetId, { actor: 'ms-boone', role: 'ADVISER' });
    expect(await store.blobs.has(asset.sha256)).toBe(true);
  });

  test('writes who decided it to the audit log', async () => {
    const assetId = await anUncertainPicture();
    await releaseFromQuarantine(store, assetId, { actor: 'ms-boone', role: 'ADVISER' });
    const decision = (await store.events.all()).find((e) => e.action === 'quarantine.released');
    expect(decision!.actor).toBe('ms-boone');
  });

  test('a student cannot let one through', async () => {
    const assetId = await anUncertainPicture();
    await expect(
      releaseFromQuarantine(store, assetId, { actor: 'maya', role: 'STUDENT' }),
    ).rejects.toThrow(/teacher/i);
    expect((await store.assets.get(assetId))!.gateStatus).toBe('QUARANTINED');
  });
});

describe('a teacher throwing one out', () => {
  test('marks it rejected', async () => {
    const assetId = await anUncertainPicture();
    await rejectFromQuarantine(store, assetId, { actor: 'ms-boone', role: 'ADVISER' });
    expect((await store.assets.get(assetId))!.gateStatus).toBe('REJECTED');
  });

  test('DISCARDS THE BYTES, the way a Gate rejection does', async () => {
    const assetId = await anUncertainPicture();
    const asset = (await store.assets.get(assetId))!;
    await rejectFromQuarantine(store, assetId, { actor: 'ms-boone', role: 'ADVISER' });
    expect(await store.blobs.has(asset.sha256)).toBe(false);
  });

  test('keeps the record of the decision even though the bytes are gone', async () => {
    const assetId = await anUncertainPicture();
    await rejectFromQuarantine(store, assetId, { actor: 'ms-boone', role: 'ADVISER' });
    const decision = (await store.events.all()).find((e) => e.action === 'quarantine.rejected');
    expect(decision).toBeTruthy();
    expect((await store.assets.get(assetId))).toBeTruthy();
  });

  test('a student cannot throw one out either', async () => {
    const assetId = await anUncertainPicture();
    await expect(
      rejectFromQuarantine(store, assetId, { actor: 'maya', role: 'STUDENT' }),
    ).rejects.toThrow(/teacher/i);
  });

  test('deciding twice does not undo the first decision', async () => {
    const assetId = await anUncertainPicture();
    await rejectFromQuarantine(store, assetId, { actor: 'ms-boone', role: 'ADVISER' });
    await expect(
      releaseFromQuarantine(store, assetId, { actor: 'ms-boone', role: 'ADVISER' }),
    ).rejects.toThrow(/already/i);
  });
});
