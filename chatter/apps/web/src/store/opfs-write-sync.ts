export interface SyncFileHandle {
  createSyncAccessHandle(): Promise<{
    write(bytes: Uint8Array, options: { at: number }): number;
    truncate(length: number): void | Promise<void>;
    flush(): void | Promise<void>;
    close(): void | Promise<void>;
  }>;
}
/** Runs only in a dedicated worker on Safari versions without createWritable. */
export async function writeSyncFile(handle: SyncFileHandle, bytes: Uint8Array): Promise<void> {
  const access = await handle.createSyncAccessHandle();
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const remaining = bytes.subarray(offset);
      const written = access.write(remaining, { at: offset });
      if (!Number.isSafeInteger(written) || written <= 0 || written > remaining.byteLength) {
        throw new Error('The browser could not write the complete media file. Keep Orbit open and retry.');
      }
      offset += written;
    }
    // Older Safari releases returned promises for these operations.
    await access.truncate(bytes.byteLength);
    await access.flush();
  } finally {
    await access.close();
  }
}
