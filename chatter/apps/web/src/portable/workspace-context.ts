export interface ReaderSelection {
  workspaceId: string;
  releaseId: string;
}

const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

/** A reader build must never fall back to the unscoped desktop newsroom. */
export function readReaderSelection(): ReaderSelection | undefined {
  if (import.meta.env.VITE_ORBIT_READER !== 'true') return undefined;
  try {
    const selection: unknown = JSON.parse(window.sessionStorage.getItem('orbit-reader-current') ?? 'null');
    if (!selection || typeof selection !== 'object') throw new Error('No USB workspace was selected.');
    const { workspaceId, releaseId } = selection as Partial<ReaderSelection>;
    if (typeof workspaceId !== 'string' || !WORKSPACE_ID.test(workspaceId)
      || typeof releaseId !== 'string' || !RELEASE_ID.test(releaseId)) {
      throw new Error('The USB workspace selection is invalid.');
    }
    const readerBase = import.meta.env.VITE_READER_BASE;
    if (typeof readerBase !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(readerBase)
      || import.meta.env.BASE_URL !== `${readerBase}r/${releaseId}/`
      || !window.location.pathname.startsWith(import.meta.env.BASE_URL)) {
      throw new Error('This app release does not match the selected USB workspace.');
    }
    return { workspaceId, releaseId };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The USB workspace selection could not be read.';
    throw new Error(`Orbit reader could not open this workspace. Return to the reader and choose your USB folder again. ${detail}`);
  }
}

/** Each wrapper keeps the workspace it was created for, even if the selection changes. */
export function workspaceStorage(storage: Storage): Storage {
  const selection = readReaderSelection();
  if (!selection) return storage;
  const prefix = `orbit:${selection.workspaceId}:`;
  function keys(): string[] {
    const found: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) found.push(key.slice(prefix.length));
    }
    return found;
  }
  return {
    get length() { return keys().length; },
    clear() { for (const key of keys()) storage.removeItem(`${prefix}${key}`); },
    getItem(key) { return storage.getItem(`${prefix}${key}`); },
    key(index) { return keys()[index] ?? null; },
    removeItem(key) { storage.removeItem(`${prefix}${key}`); },
    setItem(key, value) { storage.setItem(`${prefix}${key}`, value); },
  };
}

export function workspaceStoreName(base: string): string {
  const selection = readReaderSelection();
  return selection ? `orbit:${selection.workspaceId}:${base}` : base;
}
