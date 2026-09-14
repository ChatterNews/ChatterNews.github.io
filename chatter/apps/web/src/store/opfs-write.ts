const WORKER_TIMEOUT_MS = 120_000;
const pendingWrites = new WeakMap<FileSystemDirectoryHandle, Map<string, Promise<void>>>();

async function matchesFile(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<boolean> {
  const file = await handle.getFile();
  if (file.size !== bytes.byteLength) return false;
  for (let offset = 0; offset < bytes.byteLength; offset += 1024 * 1024) {
    const saved = new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer());
    if (saved.byteLength !== Math.min(1024 * 1024, bytes.byteLength - offset)
      || saved.some((byte, index) => byte !== bytes[offset + index])) return false;
  }
  return true;
}

function writeWithWorker(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./opfs-write.worker.ts', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => finish(new Error('Saving media timed out. Keep Orbit open and retry.')), WORKER_TIMEOUT_MS);
    function finish(error?: Error) {
      clearTimeout(timeout);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      if (error) reject(error); else resolve();
    }
    worker.onmessage = (event: MessageEvent<{ ok?: boolean; error?: string }>) => {
      if (event.data?.ok === true) finish();
      else finish(new Error(event.data?.error || 'The browser could not save this media file.'));
    };
    worker.onerror = (event) => { event.preventDefault(); finish(new Error(event.message || 'The media writer stopped. Keep Orbit open and retry.')); };
    worker.onmessageerror = () => finish(new Error('The browser could not read the media writer response.'));
    try {
      // Transferring the caller's buffer would break its later hash/export use.
      const copied = new Uint8Array(bytes).buffer;
      worker.postMessage({ handle, bytes: copied }, [copied]);
    } catch (error) { finish(error instanceof Error ? error : new Error('The browser could not start the media writer.')); }
  });
}

async function writeNewFile(directory: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> {
  let existing: FileSystemFileHandle | undefined;
  try { existing = await directory.getFileHandle(name); }
  catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error; }
  if (existing) {
    if (!await matchesFile(existing, bytes)) throw new Error('An existing media file does not match its content reference. Keep Orbit open and restore the damaged media.');
    return;
  }
  const handle = await directory.getFileHandle(name, { create: true });
  try {
    if (typeof handle.createWritable === 'function') {
      const writable = await handle.createWritable();
      try { await writable.write(bytes as Uint8Array<ArrayBuffer>); await writable.close(); }
      catch (error) { await writable.abort().catch(() => {}); throw error; }
    } else {
      await writeWithWorker(handle, bytes);
    }
    if (!await matchesFile(handle, bytes)) throw new Error('The saved media file did not match. Keep Orbit open and retry.');
  } catch (error) {
    // A failed new hash must not later be mistaken for an available source file.
    await directory.removeEntry(name).catch(() => {});
    throw error;
  }
}

export async function writeOpfsFile(directory: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> {
  const pending = pendingWrites.get(directory) ?? new Map<string, Promise<void>>();
  pendingWrites.set(directory, pending);
  const write = () => writeNewFile(directory, name, bytes);
  const next = (pending.get(name) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request(`orbit-opfs:${directory.name}:${name}`, write);
    } else {
      await write();
    }
  });
  pending.set(name, next);
  try { await next; }
  finally { if (pending.get(name) === next) pending.delete(name); }
}
