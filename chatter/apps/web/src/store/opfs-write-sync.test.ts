import { describe, expect, test } from 'vitest';
import { writeSyncFile, type SyncFileHandle } from './opfs-write-sync.js';

describe('Safari OPFS worker writes', () => {
  test('finishes partial writes, truncates old bytes, flushes and closes before returning', async () => {
    const disk = new Uint8Array(9).fill(99);
    const calls: string[] = [];
    const handle: SyncFileHandle = { createSyncAccessHandle: async () => ({
      write(bytes, { at }) { const length = Math.min(2, bytes.byteLength); disk.set(bytes.subarray(0, length), at); calls.push(`write:${at}`); return length; },
      truncate(length) { calls.push(`truncate:${length}`); },
      flush() { calls.push('flush'); },
      close() { calls.push('close'); },
    }) };
    await writeSyncFile(handle, new Uint8Array([1, 2, 3, 4, 5]));
    expect([...disk.slice(0, 5)]).toEqual([1, 2, 3, 4, 5]);
    expect(calls).toEqual(['write:0', 'write:2', 'write:4', 'truncate:5', 'flush', 'close']);
  });

  test.each([0, -1, 10, 1.5, NaN])('rejects an invalid write count %s and closes the file', async (count) => {
    let closed = false; let flushed = false;
    const handle: SyncFileHandle = { createSyncAccessHandle: async () => ({
      write: () => count, truncate() {}, flush() { flushed = true; }, close() { closed = true; },
    }) };
    await expect(writeSyncFile(handle, new Uint8Array([1, 2, 3]))).rejects.toThrow();
    expect(flushed).toBe(false);
    expect(closed).toBe(true);
  });

  test('flush failure does not acknowledge success and still closes the access handle', async () => {
    let closed = false;
    const handle: SyncFileHandle = { createSyncAccessHandle: async () => ({
      write: (bytes) => bytes.length, truncate() {}, flush() { throw new Error('Disk full'); }, close() { closed = true; },
    }) };
    await expect(writeSyncFile(handle, new Uint8Array([1]))).rejects.toThrow('Disk full');
    expect(closed).toBe(true);
  });

  test('awaits older Safari asynchronous flush and close methods before acknowledging a write', async () => {
    let finishFlush!: () => void;
    let finishClose!: () => void;
    let closed = false; let finished = false;
    const flushing = new Promise<void>((resolve) => { finishFlush = resolve; });
    const closing = new Promise<void>((resolve) => { finishClose = resolve; });
    const handle: SyncFileHandle = { createSyncAccessHandle: async () => ({
      write: (bytes) => bytes.length,
      truncate() {},
      flush: () => flushing,
      close: async () => { closed = true; await closing; },
    }) };
    const pending = writeSyncFile(handle, new Uint8Array([1])).then(() => { finished = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toBe(false);
    expect(finished).toBe(false);
    finishFlush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toBe(true);
    expect(finished).toBe(false);
    finishClose();
    await pending;
    expect(finished).toBe(true);
  });
});
