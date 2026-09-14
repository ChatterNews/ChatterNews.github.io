import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { Gate } from './gate-ingest.js';
import { DEFAULT_GATE_CONFIG } from './gate.js';
import type { Store } from './store.js';
import type { Classifier } from './gate-ingest.js';

const BYTES = new TextEncoder().encode('some bytes');

/** The image model, not loaded. Everything image-shaped must fail closed on it. */
const notLoaded: Classifier = { ready: false, async classify() { return 1; } };

let store: Store;
beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
});

describe('the classifier screens pictures, and only pictures', () => {
  test('a recording is approved without being scored by an image model', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES, source: 'recording', ownDevice: true,
      meta: { kind: 'AUDIO', mime: 'audio/webm', origin: 'RECORDING' },
    });
    expect(result.status).toBe('APPROVED');
  });

  test('a recorded video is approved too - Roll is the same path as the Booth', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES, source: 'recording', ownDevice: true,
      meta: { kind: 'VIDEO', mime: 'video/webm', origin: 'RECORDING' },
    });
    expect(result.status).toBe('APPROVED');
  });

  test('a picture still fails closed when the checker has not loaded', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES, source: 'upload',
      meta: { kind: 'IMAGE', mime: 'image/jpeg', origin: 'UPLOAD' },
    });
    expect(result.status).toBe('QUARANTINED');
    expect(result.reason).toBe('classifier-unavailable');
  });

  test('a picture the checker dislikes is still rejected', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0.97; } });
    const result = await gate.ingest({
      bytes: BYTES, source: 'nasa',
      meta: { kind: 'IMAGE', mime: 'image/jpeg' },
    });
    expect(result.status).toBe('REJECTED');
  });

  test('audio that is NOT a recording still waits for a person, since nothing can screen it', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES, source: 'upload',
      meta: { kind: 'AUDIO', mime: 'audio/mp3', origin: 'UPLOAD' },
    });
    expect(result.status).toBe('QUARANTINED');
    expect(result.reason).toBe('unscreenable-upload');
  });

  test('a recording is still hashed, credited and audited like everything else', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES, source: 'recording', ownDevice: true,
      meta: { kind: 'AUDIO', mime: 'audio/webm', origin: 'RECORDING' },
    });
    const asset = (await store.assets.get(result.assetId!))!;
    expect(asset.sha256.startsWith('sha256:')).toBe(true);
    expect(await store.blobs.has(asset.sha256)).toBe(true);
    expect(await store.credits.list()).toHaveLength(1);
    expect((await store.events.all()).some((e) => e.action === 'gate.decision')).toBe(true);
  });

  test('the upstream and source rules still apply to a picture', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0.01; } });
    const result = await gate.ingest({
      bytes: BYTES, source: 'flickr',
      meta: { kind: 'IMAGE', mime: 'image/jpeg' },
    });
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('source-not-allowed');
  });
});

describe('work the club made itself', () => {
  test('a beat bounced in the Studio is approved, like a take from the Booth', async () => {
    // Same principle Nilben set for recordings: it is the kid's own work,
    // made on this device, and an image model cannot score a sound file.
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES, source: 'generated', ownDevice: true,
      meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'GENERATED' },
    });
    expect(result.status).toBe('APPROVED');
  });

  test('a bounced beat is still hashed, credited and audited', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES, source: 'generated', ownDevice: true,
      meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'GENERATED' },
    });
    const asset = (await store.assets.get(result.assetId!))!;
    expect(asset.sha256.startsWith('sha256:')).toBe(true);
    expect(await store.credits.list()).toHaveLength(1);
  });

  test('a GENERATED picture is still screened - it is an image', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES, source: 'generated',
      meta: { kind: 'IMAGE', mime: 'image/png', origin: 'GENERATED' },
    });
    expect(result.status).toBe('QUARANTINED');
    expect(result.reason).toBe('classifier-unavailable');
  });
});
