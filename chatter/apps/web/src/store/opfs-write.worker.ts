import { writeSyncFile, type SyncFileHandle } from './opfs-write-sync.js';

self.onmessage = async (event: MessageEvent<{ handle: SyncFileHandle; bytes: ArrayBuffer }>) => {
  try {
    if (!(event.data.bytes instanceof ArrayBuffer) || typeof event.data.handle?.createSyncAccessHandle !== 'function') {
      throw new Error('This browser does not offer the file writer Orbit needs. Update Safari and try again.');
    }
    await writeSyncFile(event.data.handle, new Uint8Array(event.data.bytes));
    self.postMessage({ ok: true });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'The browser could not save this media file.' });
  }
};
