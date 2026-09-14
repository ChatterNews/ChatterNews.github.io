import { workspaceStoreName } from '../portable/workspace-context.js';

export const SAMPLE_LIBRARY_MAX_FILES = 5_000;

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'wav', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'webm',
]);
const CAPABILITY_DB = 'chatter-browser-capabilities';
const CAPABILITY_STORE = 'handles';
const SAMPLE_FOLDER_KEY = 'studio-sample-folder';

export interface SampleLibraryEntry {
  id: string;
  name: string;
  relativePath: string;
  category: string;
  size: number;
  lastModified: number;
  mime: string;
  extension: string;
  getFile(): Promise<File>;
}

export interface SampleLibraryScan {
  folderName: string;
  entries: SampleLibraryEntry[];
  categories: string[];
  linked: boolean;
}

export class SampleLibraryLimitError extends Error {
  constructor(maxFiles: number) {
    super(`This folder has more than ${maxFiles.toLocaleString()} sounds. Choose a smaller sample folder.`);
    this.name = 'SampleLibraryLimitError';
  }
}

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
};

export async function scanSampleDirectory(
  root: FileSystemDirectoryHandle,
  options: { maxFiles?: number } = {},
): Promise<SampleLibraryScan> {
  const maxFiles = options.maxFiles ?? SAMPLE_LIBRARY_MAX_FILES;
  const entries: SampleLibraryEntry[] = [];

  async function visit(directory: FileSystemDirectoryHandle, parents: string[]): Promise<void> {
    for await (const [name, handle] of (directory as DirectoryHandleWithEntries).entries()) {
      if (handle.kind === 'directory') {
        await visit(handle, [...parents, name]);
        continue;
      }
      if (!isSupportedAudioName(name)) continue;
      if (entries.length >= maxFiles) throw new SampleLibraryLimitError(maxFiles);
      const file = await handle.getFile();
      entries.push(makeEntry(file, [...parents, name].join('/'), () => handle.getFile()));
    }
  }

  await visit(root, []);
  return finishScan(root.name, entries, true);
}

export function sampleEntriesFromFiles(files: Iterable<File>): SampleLibraryScan {
  const selected = [...files].filter((file) => isSupportedAudioName(file.name));
  const firstParts = selected[0]?.webkitRelativePath.split('/').filter(Boolean) ?? [];
  const folderName = firstParts.length > 1 ? firstParts[0]! : 'Chosen sounds';
  const entries = selected.slice(0, SAMPLE_LIBRARY_MAX_FILES).map((file) => {
    const parts = file.webkitRelativePath.split('/').filter(Boolean);
    const relativePath = parts.length > 1 ? parts.slice(1).join('/') : file.name;
    return makeEntry(file, relativePath, async () => file);
  });
  if (selected.length > SAMPLE_LIBRARY_MAX_FILES) throw new SampleLibraryLimitError(SAMPLE_LIBRARY_MAX_FILES);
  return finishScan(folderName, entries, false);
}

export function searchSampleEntries(
  entries: readonly SampleLibraryEntry[],
  query: string,
  category: string,
): SampleLibraryEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    const categoryMatches = category === 'ALL' || entry.category === category;
    const textMatches = !needle || `${entry.name} ${entry.relativePath}`.toLocaleLowerCase().includes(needle);
    return categoryMatches && textMatches;
  });
}

export async function loadSavedSampleFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  const db = await openCapabilityDb();
  try {
    return await idbRequest<FileSystemDirectoryHandle | undefined>(
      db.transaction(CAPABILITY_STORE, 'readonly').objectStore(CAPABILITY_STORE).get(SAMPLE_FOLDER_KEY),
    );
  } finally {
    db.close();
  }
}

export async function saveSampleFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openCapabilityDb();
  try {
    await idbRequest(db.transaction(CAPABILITY_STORE, 'readwrite').objectStore(CAPABILITY_STORE).put(handle, SAMPLE_FOLDER_KEY));
  } finally {
    db.close();
  }
}

export async function clearSavedSampleFolder(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openCapabilityDb();
  try {
    await idbRequest(db.transaction(CAPABILITY_STORE, 'readwrite').objectStore(CAPABILITY_STORE).delete(SAMPLE_FOLDER_KEY));
  } finally {
    db.close();
  }
}

export async function sampleFolderPermission(
  handle: FileSystemDirectoryHandle,
  request = false,
): Promise<PermissionState> {
  const capability = handle as FileSystemDirectoryHandle & {
    queryPermission?(options: { mode: 'read' }): Promise<PermissionState>;
    requestPermission?(options: { mode: 'read' }): Promise<PermissionState>;
  };
  if (request && capability.requestPermission) return capability.requestPermission({ mode: 'read' });
  if (capability.queryPermission) return capability.queryPermission({ mode: 'read' });
  return 'granted';
}

function isSupportedAudioName(name: string): boolean {
  const extension = name.split('.').pop()?.toLocaleLowerCase() ?? '';
  return SUPPORTED_AUDIO_EXTENSIONS.has(extension);
}

function makeEntry(file: File, relativePath: string, getFile: () => Promise<File>): SampleLibraryEntry {
  const extension = file.name.split('.').pop()?.toLocaleUpperCase() ?? 'AUDIO';
  const category = relativePath.includes('/') ? relativePath.split('/')[0]! : 'Loose sounds';
  return {
    id: `${relativePath}\u0000${file.size}\u0000${file.lastModified}`,
    name: file.name,
    relativePath,
    category,
    size: file.size,
    lastModified: file.lastModified,
    mime: file.type || `audio/${extension.toLocaleLowerCase()}`,
    extension,
    getFile,
  };
}

function finishScan(folderName: string, entries: SampleLibraryEntry[], linked: boolean): SampleLibraryScan {
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));
  const categories = [...new Set(entries.map((entry) => entry.category))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return { folderName, entries, categories, linked };
}

function openCapabilityDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(workspaceStoreName(CAPABILITY_DB), 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CAPABILITY_STORE)) request.result.createObjectStore(CAPABILITY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Studio could not open its folder connection store.'));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Studio could not save the sample folder connection.'));
  });
}
