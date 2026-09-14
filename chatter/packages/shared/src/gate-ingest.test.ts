import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { Gate } from './gate-ingest.js';
import { DEFAULT_GATE_CONFIG } from './gate.js';
import type { Store } from './store.js';
import type { Classifier } from './gate-ingest.js';

const CLEAN = new TextEncoder().encode('a perfectly ordinary picture of a taco');
const FILTHY = new TextEncoder().encode('the fixture that must always be rejected');

/** Stands in for the on-device ViT. Scores by fixture so tests are deterministic. */
const scorer = (score: number): Classifier => ({
  ready: true,
  async classify() { return score; },
});

let store: Store;
let gate: Gate;
beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
  gate = new Gate(store, DEFAULT_GATE_CONFIG, scorer(0.02));
});

describe('gate.ingest', () => {
  test('approves a clean picture from an allowed source', async () => {
    const result = await gate.ingest({ bytes: CLEAN, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    expect(result.status).toBe('APPROVED');
    expect(result.assetId).toBeTruthy();
  });

  test('the approved Asset is content-addressed and its bytes are frozen locally', async () => {
    const result = await gate.ingest({ bytes: CLEAN, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    const asset = (await store.assets.get(result.assetId!))!;
    expect(asset.sha256.startsWith('sha256:')).toBe(true);
    expect(await store.blobs.has(asset.sha256)).toBe(true);
  });

  test('THE FIXTURE THAT MUST BE REJECTED: bytes are discarded, no Asset exists', async () => {
    const strict = new Gate(store, DEFAULT_GATE_CONFIG, scorer(0.97));
    const result = await strict.ingest({ bytes: FILTHY, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    expect(result.status).toBe('REJECTED');
    expect(result.assetId).toBeUndefined();
    expect(await store.assets.list()).toHaveLength(0);
    expect(await store.blobs.list()).toHaveLength(0);
  });

  test('a rejected image is never written to the blob store', async () => {
    const strict = new Gate(store, DEFAULT_GATE_CONFIG, scorer(0.97));
    await strict.ingest({ bytes: FILTHY, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    const { sha256 } = await import('./ids.js');
    expect(await store.blobs.has(await sha256(FILTHY))).toBe(false);
  });

  test('refuses a source that is not on the allowlist, before classifying', async () => {
    const result = await gate.ingest({ bytes: CLEAN, source: 'flickr', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('source-not-allowed');
  });

  test('honours an upstream mature flag without needing the classifier', async () => {
    const result = await gate.ingest({
      bytes: CLEAN, source: 'nasa',
      meta: { kind: 'IMAGE', mime: 'image/jpeg', mature: true },
    });
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('upstream-mature');
  });

  test('quarantines a middling score into the adviser queue', async () => {
    const middling = new Gate(store, DEFAULT_GATE_CONFIG, scorer(0.4));
    const result = await middling.ingest({ bytes: CLEAN, source: 'met', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    expect(result.status).toBe('QUARANTINED');
    const asset = (await store.assets.get(result.assetId!))!;
    expect(asset.gateStatus).toBe('QUARANTINED');
  });

  test('FAIL CLOSED: an unloaded classifier quarantines, it never approves', async () => {
    const notReady = new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, async classify() { return 0; } });
    const result = await notReady.ingest({ bytes: CLEAN, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    expect(result.status).toBe('QUARANTINED');
    expect(result.reason).toBe('classifier-unavailable');
  });

  test('prepares a lazy classifier only when an image reaches screening', async () => {
    let ready = false;
    let prepares = 0;
    let classifications = 0;
    const lazy = new Gate(store, DEFAULT_GATE_CONFIG, {
      get ready() { return ready; },
      async prepare() { prepares += 1; ready = true; return true; },
      async classify() { classifications += 1; return 0.02; },
    });

    const result = await lazy.ingest({
      bytes: CLEAN,
      source: 'nasa',
      meta: { kind: 'IMAGE', mime: 'image/jpeg' },
    });

    expect(result.status).toBe('APPROVED');
    expect(prepares).toBe(1);
    expect(classifications).toBe(1);
  });

  test('FAIL CLOSED: a classifier that cannot prepare still quarantines', async () => {
    let classifications = 0;
    const unavailable = new Gate(store, DEFAULT_GATE_CONFIG, {
      ready: false,
      async prepare() { return false; },
      async classify() { classifications += 1; return 0; },
    });

    const result = await unavailable.ingest({
      bytes: CLEAN,
      source: 'nasa',
      meta: { kind: 'IMAGE', mime: 'image/jpeg' },
    });

    expect(result.status).toBe('QUARANTINED');
    expect(result.reason).toBe('classifier-unavailable');
    expect(classifications).toBe(0);
  });

  test('writes a Credit row from the licence metadata', async () => {
    const result = await gate.ingest({
      bytes: CLEAN, source: 'nasa',
      meta: { kind: 'IMAGE', mime: 'image/jpeg', license: 'CC0', creator: 'NASA', sourceUrl: 'https://example.org/x' },
    });
    const credits = await store.credits.list();
    expect(credits).toHaveLength(1);
    expect(credits[0]!.assetId).toBe(result.assetId);
  });

  test('a recording made in the Booth goes through the Gate like everything else', async () => {
    const result = await gate.ingest({
      bytes: CLEAN, source: 'recording', ownDevice: true,
      meta: { kind: 'AUDIO', mime: 'audio/webm', origin: 'RECORDING' },
    });
    expect(result.status).toBe('APPROVED');
    expect((await store.assets.get(result.assetId!))!.origin).toBe('RECORDING');
  });

  test('the same bytes ingested twice reuse one Asset - the hash is the name', async () => {
    const a = await gate.ingest({ bytes: CLEAN, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    const b = await gate.ingest({ bytes: CLEAN, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    expect(b.assetId).toBe(a.assetId);
    expect(await store.assets.list()).toHaveLength(1);
  });
});

describe('gate.ingest - the audit log', () => {
  test('logs every decision, including approvals', async () => {
    await gate.ingest({ bytes: CLEAN, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    const events = await store.events.all();
    expect(events.some((e) => e.action === 'gate.decision')).toBe(true);
  });

  test('logs a rejection even though no Asset survives it', async () => {
    const strict = new Gate(store, DEFAULT_GATE_CONFIG, scorer(0.97));
    await strict.ingest({ bytes: FILTHY, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    const decisions = (await store.events.all()).filter((e) => e.action === 'gate.decision');
    expect(decisions).toHaveLength(1);
    expect((decisions[0]!.payload as any).status).toBe('REJECTED');
  });

  test('logs the score so thresholds can be tuned against real usage', async () => {
    await gate.ingest({ bytes: CLEAN, source: 'nasa', meta: { kind: 'IMAGE', mime: 'image/jpeg' } });
    const decision = (await store.events.all()).find((e) => e.action === 'gate.decision')!;
    expect((decision.payload as any).score).toBe(0.02);
  });
});
