import { beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_GATE_CONFIG } from './gate.js';
import { Gate, type Classifier } from './gate-ingest.js';
import { MemoryStore } from './store-memory.js';
import type { Store } from './store.js';

const BYTES = new TextEncoder().encode('some bytes');
const notLoaded: Classifier = { ready: false, async classify() { return 1; } };

let store: Store;
beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
});

describe('own work has to be vouched for by this device', () => {
  test('a file claiming RECORDING is quarantined without a device voucher', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES,
      source: 'recording',
      meta: { kind: 'AUDIO', mime: 'audio/webm', origin: 'RECORDING' },
    });

    expect(result).toMatchObject({ status: 'QUARANTINED', reason: 'unscreenable-upload' });
  });

  test('a file claiming GENERATED is quarantined without a device voucher', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES,
      source: 'generated',
      meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'GENERATED' },
    });

    expect(result.status).toBe('QUARANTINED');
  });

  test('a fresh local recording is approved', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES,
      source: 'recording',
      ownDevice: true,
      meta: { kind: 'AUDIO', mime: 'audio/webm', origin: 'RECORDING' },
    });

    expect(result.status).toBe('APPROVED');
  });

  test('a voucher cannot turn an upload into local work', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES,
      source: 'upload',
      ownDevice: true,
      meta: { kind: 'AUDIO', mime: 'audio/webm', origin: 'UPLOAD' },
    });

    expect(result.status).toBe('QUARANTINED');
  });

  test('a picture still needs classification even when made locally', async () => {
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, notLoaded);
    const result = await gate.ingest({
      bytes: BYTES,
      source: 'recording',
      ownDevice: true,
      meta: { kind: 'IMAGE', mime: 'image/png', origin: 'RECORDING' },
    });

    expect(result).toMatchObject({ status: 'QUARANTINED', reason: 'classifier-unavailable' });
  });
});
