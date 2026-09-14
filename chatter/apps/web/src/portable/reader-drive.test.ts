import { describe, expect, test } from 'vitest';
import { holdWorkspaceLock } from './reader-drive.js';

describe('reader workspace ownership', () => {
  test('holds the writer lock until the workspace is released', async () => {
    let requested = ''; let completed = false;
    const locks = { request: async (name: string, options: LockOptions, callback: LockGrantedCallback<void>) => {
      requested = name;
      expect(options).toEqual({ mode: 'exclusive', ifAvailable: true });
      await callback({ name, mode: 'exclusive' });
      completed = true;
    } } as LockManager;
    const release = await holdWorkspaceLock(locks, 'drive-a');
    expect(requested).toBe('orbit-workspace:drive-a');
    expect(completed).toBe(false);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completed).toBe(true);
  });

  test('rejects a second writer instead of opening the same store', async () => {
    const locks = { request: async (_name: string, _options: LockOptions, callback: LockGrantedCallback<void>) => callback(null) } as LockManager;
    await expect(holdWorkspaceLock(locks, 'drive-a')).rejects.toThrow('already open in another Orbit tab');
  });

  test('reports browser lock failures before mounting a workspace', async () => {
    const locks = { request: async () => { throw new Error('Storage policy rejected the lock'); } } as unknown as LockManager;
    await expect(holdWorkspaceLock(locks, 'drive-a')).rejects.toThrow('Storage policy rejected');
  });
});
