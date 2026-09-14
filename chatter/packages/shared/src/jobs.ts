/**
 * The job queue. SPEC S1: a DB-backed job table with an in-process worker -
 * no Redis, no broker. At Tier 0 the "table" is IndexedDB and the worker is a
 * loop in the tab.
 */
import type { Store } from './store.js';
import type { Base } from './types.js';
import { newId } from './ids.js';

export type JobState = 'WAITING' | 'RUNNING' | 'DONE' | 'FAILED';

export interface Job extends Base {
  kind: string;
  payload: unknown;
  state: JobState;
  attempts: number;
  error?: string;
}

/** Give up after this many tries rather than retrying a broken job forever. */
const MAX_ATTEMPTS = 3;

/**
 * How long a job may sit RUNNING before another worker may take it.
 * A tab closed mid-transcription leaves a job claimed and nobody to finish
 * it; without this the take is never typed out.
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

export class JobQueue {
  constructor(private store: Store) {}

  private get table() {
    return (this.store as unknown as { jobs: any }).jobs;
  }

  async enqueue(kind: string, payload: unknown): Promise<Job> {
    return this.table.create({ kind, payload, state: 'WAITING', attempts: 0 });
  }

  async get(id: string): Promise<Job | undefined> {
    return this.table.get(id);
  }

  async waiting(): Promise<Job[]> {
    const rows: Job[] = await this.table.list();
    return rows
      .filter((j) => j.state === 'WAITING')
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Take the oldest waiting job, or reclaim one that has been RUNNING so long
   * that whoever claimed it is plainly gone. Undefined when there is nothing
   * to do.
   */
  async claim(now = Date.now()): Promise<Job | undefined> {
    const [waiting] = await this.waiting();
    if (waiting) {
      await this.table.update(waiting.id, { state: 'RUNNING' });
      return waiting;
    }

    const rows: Job[] = await this.table.list();
    const stranded = rows
      .filter((j) => j.state === 'RUNNING' && now - j.updatedAt > STALE_AFTER_MS)
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!stranded) return undefined;

    // Reclaiming counts as an attempt, so a job that strands every time
    // eventually stops rather than looping forever.
    const attempts = stranded.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.table.update(stranded.id, {
        state: 'FAILED', attempts, error: 'gave up after being left unfinished',
      });
      return undefined;
    }

    await this.table.update(stranded.id, { state: 'RUNNING', attempts });
    return { ...stranded, attempts };
  }

  async complete(id: string): Promise<void> {
    await this.table.update(id, { state: 'DONE' });
  }

  /**
   * Put a failed job back in the queue, unless it has already had its three
   * goes - then leave it FAILED so a person can look at it.
   */
  async fail(id: string, error: string): Promise<void> {
    const job: Job | undefined = await this.table.get(id);
    if (!job) return;
    const attempts = job.attempts + 1;
    await this.table.update(id, {
      attempts,
      error,
      state: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'WAITING',
    });
  }
}

export { newId };
