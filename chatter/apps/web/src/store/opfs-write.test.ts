import { afterEach, describe, expect, test, vi } from 'vitest';
import { writeOpfsFile } from './opfs-write.js';
import { writeSyncFile, type SyncFileHandle } from './opfs-write-sync.js';

function disk(options: { native?: boolean; flushFails?: boolean; closeFails?: boolean; corruptOnClose?: boolean } = {}) {
  const files = new Map<string, Uint8Array>();
  let writes = 0; let aborted = false;
  const directory = {
    name: 'workspace-blobs',
    async getFileHandle(name: string, config?: { create?: boolean }) {
      if (!files.has(name)) {
        if (!config?.create) throw new DOMException('Missing file', 'NotFoundError');
        files.set(name, new Uint8Array());
      }
      return {
        kind: 'file', name,
        getFile: async () => new Blob([files.get(name)! as Uint8Array<ArrayBuffer>]),
        ...(options.native ? { createWritable: async () => ({
          write: async (bytes: Uint8Array) => { writes++; files.set(name, bytes.slice()); },
          close: async () => {
            if (options.closeFails) throw new Error('Write could not close');
            if (options.corruptOnClose) files.set(name, new Uint8Array(files.get(name)!.byteLength));
          },
          abort: async () => { aborted = true; },
        }) } : {}),
        createSyncAccessHandle: async () => ({
          write(bytes: Uint8Array, { at }: { at: number }) {
            writes++;
            const length = Math.min(bytes.length, 2);
            const next = new Uint8Array(at + length);
            next.set(files.get(name)!); next.set(bytes.subarray(0, length), at); files.set(name, next);
            return length;
          },
          truncate(length: number) { files.set(name, files.get(name)!.slice(0, length)); },
          flush() { if (options.flushFails) throw new Error('Disk flush failed'); },
          close() { if (options.closeFails) throw new Error('Write could not close'); },
        }),
      };
    },
    async removeEntry(name: string) { files.delete(name); },
  } as unknown as FileSystemDirectoryHandle;
  return { directory, files, get writes() { return writes; }, get aborted() { return aborted; } };
}

function workerRuntime(options: { hang?: boolean } = {}) {
  let terminated = 0;
  class WorkerRuntime {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: (event: { message: string; preventDefault(): void }) => void;
    onmessageerror?: () => void;
    postMessage(message: { handle: SyncFileHandle; bytes: ArrayBuffer }, transfer: Transferable[]) {
      const bytes = structuredClone(message.bytes, { transfer });
      if (options.hang) return;
      void writeSyncFile(message.handle, new Uint8Array(bytes)).then(
        () => this.onmessage?.({ data: { ok: true } }),
        (error: Error) => this.onmessage?.({ data: { ok: false, error: error.message } }),
      );
    }
    terminate() { terminated++; }
  }
  vi.stubGlobal('Worker', WorkerRuntime);
  return { get terminated() { return terminated; } };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('OPFS write compatibility', () => {
  test('keeps the native write path and reuses an identical existing hash without rewriting it', async () => {
    const store = disk({ native: true });
    const bytes = new Uint8Array([1, 2, 3]);
    await writeOpfsFile(store.directory, 'hash', bytes);
    await writeOpfsFile(store.directory, 'hash', bytes);
    expect(store.files.get('hash')).toEqual(new Uint8Array([1, 2, 3]));
    expect(store.writes).toBe(1);
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  test('uses the worker fallback without detaching the caller’s bytes', async () => {
    const runtime = workerRuntime();
    const store = disk(); const bytes = new Uint8Array([4, 5, 6]);
    await writeOpfsFile(store.directory, 'hash', bytes);
    expect(store.files.get('hash')).toEqual(new Uint8Array([4, 5, 6]));
    expect([...bytes]).toEqual([4, 5, 6]);
    expect(runtime.terminated).toBe(1);
  });

  test('serializes simultaneous writes for the same hash', async () => {
    const store = disk({ native: true }); const bytes = new Uint8Array([1, 2, 3]);
    await Promise.all([
      writeOpfsFile(store.directory, 'hash', bytes),
      writeOpfsFile(store.directory, 'hash', bytes),
    ]);
    expect(store.writes).toBe(1);
    expect(store.files.get('hash')).toEqual(bytes);
  });

  test('rejects and removes a new file when successful writes do not survive readback', async () => {
    const store = disk({ native: true, corruptOnClose: true });
    await expect(writeOpfsFile(store.directory, 'hash', new Uint8Array([1, 2, 3]))).rejects.toThrow(/saved media file did not match/i);
    expect(store.files.has('hash')).toBe(false);
  });

  test('removes a new incomplete file after a worker flush failure', async () => {
    const runtime = workerRuntime(); const store = disk({ flushFails: true });
    await expect(writeOpfsFile(store.directory, 'hash', new Uint8Array([1, 2, 3]))).rejects.toThrow('Disk flush failed');
    expect(store.files.has('hash')).toBe(false);
    expect(runtime.terminated).toBe(1);
  });

  test('aborts a failed native close and removes only the new file', async () => {
    const store = disk({ native: true, closeFails: true });
    store.files.set('older-hash', new Uint8Array([9]));
    await expect(writeOpfsFile(store.directory, 'new-hash', new Uint8Array([1]))).rejects.toThrow('Write could not close');
    expect(store.files.has('new-hash')).toBe(false);
    expect([...store.files.get('older-hash')!]).toEqual([9]);
    expect(store.aborted).toBe(true);
  });

  test('does not overwrite or delete an existing hash whose contents do not match', async () => {
    const store = disk({ native: true }); store.files.set('hash', new Uint8Array([9]));
    await expect(writeOpfsFile(store.directory, 'hash', new Uint8Array([1]))).rejects.toThrow(/match|damaged/i);
    expect([...store.files.get('hash')!]).toEqual([9]);
    expect(store.writes).toBe(0);
  });

  test('worker timeout rejects and cleans up instead of claiming the media was saved', async () => {
    vi.useFakeTimers();
    const runtime = workerRuntime({ hang: true }); const store = disk();
    const pending = expect(writeOpfsFile(store.directory, 'hash', new Uint8Array([1]))).rejects.toThrow(/timed out/i);
    await Promise.all([vi.runAllTimersAsync(), pending]);
    expect(runtime.terminated).toBe(1);
    expect(store.files.has('hash')).toBe(false);
  });
});
