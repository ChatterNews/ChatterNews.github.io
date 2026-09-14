import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { recordRole, currentCycle } from './roles.js';
import type { Store } from './store.js';

let store: Store;
beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
});

describe('recordRole', () => {
  test('writes down that somebody did a job on a story', async () => {
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'voice' });
    const assigns = await store.roleAssigns.list();
    expect(assigns).toHaveLength(1);
    expect(assigns[0]!.role).toBe('voice');
  });

  test('DOING THE SAME JOB AGAIN IS STILL ONE JOB', async () => {
    // The Desk calls this on every save. Fifty saves is one piece of writing,
    // not fifty, or the gradebook is nonsense.
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'write' });
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'write' });
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'write' });
    expect(await store.roleAssigns.list()).toHaveLength(1);
  });

  test('the same job on a different story is a different job', async () => {
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'write' });
    await recordRole(store, { userId: 'u1', storyId: 's2', role: 'write' });
    expect(await store.roleAssigns.list()).toHaveLength(2);
  });

  test('a different job on the same story counts separately', async () => {
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'write' });
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'voice' });
    expect(await store.roleAssigns.list()).toHaveLength(2);
  });

  test('two kids doing the same job on one story both count', async () => {
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'picture' });
    await recordRole(store, { userId: 'u2', storyId: 's1', role: 'picture' });
    expect(await store.roleAssigns.list()).toHaveLength(2);
  });

  test('stamps the cycle so rotation can be read week by week', async () => {
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'voice', cycle: 'week-3' });
    expect((await store.roleAssigns.list())[0]!.cycle).toBe('week-3');
  });

  test('the same job in a later cycle counts again', async () => {
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'voice', cycle: 'week-1' });
    await recordRole(store, { userId: 'u1', storyId: 's1', role: 'voice', cycle: 'week-2' });
    expect(await store.roleAssigns.list()).toHaveLength(2);
  });
});

describe('currentCycle', () => {
  test('is a stable label for the week', () => {
    const monday = Date.UTC(2026, 8, 7);
    const friday = Date.UTC(2026, 8, 11);
    expect(currentCycle(monday)).toBe(currentCycle(friday));
  });

  test('changes the following week', () => {
    const thisWeek = Date.UTC(2026, 8, 7);
    const nextWeek = Date.UTC(2026, 8, 14);
    expect(currentCycle(thisWeek)).not.toBe(currentCycle(nextWeek));
  });
});
