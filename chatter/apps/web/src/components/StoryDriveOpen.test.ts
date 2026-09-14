import { beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_GATE_CONFIG, Gate, MemoryStore, type Store } from '@chatter/shared';
import { openStoryDriveFile } from './StoryDriveOpen.js';

let store: Store;
let gate: Gate;

beforeEach(async () => {
  store = new MemoryStore('story-drive-entry');
  await store.open();
  gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0.01; } });
});

describe('opening a Story Drive from an entry screen', () => {
  test('cancelling leaves the newsroom unchanged', async () => {
    const outcome = await openStoryDriveFile(store, gate, undefined);
    expect(outcome).toEqual({ status: 'CANCELLED', message: 'No story was opened.' });
    expect(await store.stories.list()).toEqual([]);
  });

  test('turns a damaged file into a retryable entry-screen error', async () => {
    const file = new File([new TextEncoder().encode('not a zip')], 'book-fair.chatter');
    const outcome = await openStoryDriveFile(store, gate, file);

    expect(outcome).toEqual({
      status: 'ERROR',
      message: 'That story file did not open. Choose it again to retry.',
    });
    expect(await store.stories.list()).toEqual([]);
  });
});
