import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { JobQueue } from './jobs.js';
import { Gate } from './gate-ingest.js';
import { DEFAULT_GATE_CONFIG } from './gate.js';
import { saveTake } from './booth.js';
import { runNextTranscribeJob } from './transcribe.js';
import type { Store } from './store.js';
import type { Transcriber } from './transcribe.js';

const AUDIO = new TextEncoder().encode('a take');

const working: Transcriber = {
  backend: 'webgpu',
  async transcribe() {
    return { text: 'Starting Monday the cafeteria is adding a taco bar.', segments: [{ start: 0, end: 3, text: 'Starting Monday' }] };
  },
};

let store: Store;
let jobs: JobQueue;
let gate: Gate;

beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
  jobs = new JobQueue(store);
  gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, async classify() { return 1; } });
});

async function recordATake() {
  return saveTake({ store, gate, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 3 });
}

describe('runNextTranscribeJob', () => {
  test('does nothing when the queue is empty', async () => {
    expect(await runNextTranscribeJob(store, jobs, working)).toBe(false);
  });

  test('turns a waiting take into a Transcript', async () => {
    const take = await recordATake();
    expect(await runNextTranscribeJob(store, jobs, working)).toBe(true);
    const transcripts = await store.transcripts.list();
    expect(transcripts).toHaveLength(1);
    expect(transcripts[0]!.assetId).toBe(take.assetId);
    expect(transcripts[0]!.text).toContain('taco bar');
  });

  test('keeps the segments, because captions are built from them later', async () => {
    await recordATake();
    await runNextTranscribeJob(store, jobs, working);
    expect((await store.transcripts.list())[0]!.segments).toHaveLength(1);
  });

  test('takes the job out of the queue once it is done', async () => {
    await recordATake();
    await runNextTranscribeJob(store, jobs, working);
    expect(await jobs.waiting()).toHaveLength(0);
  });

  test('a transcript is written exactly once, even if the worker runs again', async () => {
    await recordATake();
    await runNextTranscribeJob(store, jobs, working);
    await runNextTranscribeJob(store, jobs, working);
    expect(await store.transcripts.list()).toHaveLength(1);
  });

  test('a model that will not load puts the job back for another go', async () => {
    await recordATake();
    const broken: Transcriber = {
      backend: 'wasm',
      async transcribe() { throw new Error('model would not load'); },
    };
    expect(await runNextTranscribeJob(store, jobs, broken)).toBe(false);
    const waiting = await jobs.waiting();
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.attempts).toBe(1);
  });

  test('records which backend did the work, so a slow device is visible', async () => {
    await recordATake();
    await runNextTranscribeJob(store, jobs, working);
    const done = (await store.events.all()).find((e) => e.action === 'transcript.done');
    expect((done!.payload as any).backend).toBe('webgpu');
  });

  test('a take whose audio has been evicted fails cleanly rather than hanging', async () => {
    const take = await recordATake();
    const asset = (await store.assets.get(take.assetId))!;
    await store.blobs.remove(asset.sha256);
    expect(await runNextTranscribeJob(store, jobs, working)).toBe(false);
    expect((await jobs.waiting())[0]!.error).toMatch(/audio/i);
  });
});
