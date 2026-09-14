import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { JobQueue } from './jobs.js';
import type { Store } from './store.js';

let store: Store;
let jobs: JobQueue;
beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
  jobs = new JobQueue(store);
});

describe('the job queue', () => {
  test('an enqueued job starts out waiting', async () => {
    const job = await jobs.enqueue('transcribe', { assetId: 'a1' });
    expect(job.state).toBe('WAITING');
    expect(job.kind).toBe('transcribe');
  });

  test('claiming returns the oldest waiting job and marks it running', async () => {
    await jobs.enqueue('transcribe', { assetId: 'first' });
    await jobs.enqueue('transcribe', { assetId: 'second' });
    const claimed = await jobs.claim();
    expect((claimed!.payload as any).assetId).toBe('first');
    expect((await jobs.get(claimed!.id))!.state).toBe('RUNNING');
  });

  test('a claimed job is not handed to a second worker', async () => {
    await jobs.enqueue('transcribe', { assetId: 'only' });
    await jobs.claim();
    expect(await jobs.claim()).toBeUndefined();
  });

  test('claiming an empty queue is undefined, not an error', async () => {
    expect(await jobs.claim()).toBeUndefined();
  });

  test('completing a job takes it out of the queue for good', async () => {
    const job = await jobs.enqueue('transcribe', { assetId: 'a1' });
    await jobs.complete(job.id);
    expect((await jobs.get(job.id))!.state).toBe('DONE');
    expect(await jobs.claim()).toBeUndefined();
  });

  test('a failed job goes back to waiting so it can be retried', async () => {
    const job = await jobs.enqueue('transcribe', { assetId: 'a1' });
    await jobs.claim();
    await jobs.fail(job.id, 'the model would not load');
    const retried = (await jobs.get(job.id))!;
    expect(retried.state).toBe('WAITING');
    expect(retried.attempts).toBe(1);
    expect(retried.error).toBe('the model would not load');
  });

  test('a job that keeps failing eventually stops retrying', async () => {
    const job = await jobs.enqueue('transcribe', { assetId: 'a1' });
    for (let i = 0; i < 3; i++) {
      await jobs.claim();
      await jobs.fail(job.id, 'nope');
    }
    expect((await jobs.get(job.id))!.state).toBe('FAILED');
    expect(await jobs.claim()).toBeUndefined();
  });

  test('waiting jobs survive being listed, so the UI can show a queue', async () => {
    await jobs.enqueue('transcribe', { assetId: 'a1' });
    await jobs.enqueue('transcribe', { assetId: 'a2' });
    expect((await jobs.waiting()).length).toBe(2);
  });
});

describe('a job stranded by a closed tab', () => {
  /** Six minutes from now: past the point a RUNNING job is treated as gone. */
  const later = () => Date.now() + 6 * 60 * 1000;

  test('a RUNNING job is reclaimed once it has been running too long', async () => {
    // A kid closes the tab mid-transcription. Without this the take sits
    // RUNNING forever and is never typed out.
    const job = await jobs.enqueue('transcribe', { assetId: 'a1' });
    await jobs.claim();

    const reclaimed = await jobs.claim(later());
    expect(reclaimed!.id).toBe(job.id);
  });

  test('a job that is still working is left alone', async () => {
    await jobs.enqueue('transcribe', { assetId: 'a1' });
    await jobs.claim();
    expect(await jobs.claim()).toBeUndefined();
  });

  test('reclaiming counts as an attempt, so a job that always strands gives up', async () => {
    const job = await jobs.enqueue('transcribe', { assetId: 'a1' });
    await jobs.claim();
    await jobs.claim(later());
    await jobs.claim(later());

    expect(await jobs.claim(later())).toBeUndefined();
    expect((await jobs.get(job.id))!.state).toBe('FAILED');
  });
});
