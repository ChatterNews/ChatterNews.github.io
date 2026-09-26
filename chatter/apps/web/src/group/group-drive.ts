import { writeVerifiedFile, type SessionDirectory } from '../portable/finish-session.js';
import { GROUP_ARCHIVE_LIMITS } from './group-archive.js';

function friendlyName(title: string): string {
  return title.normalize('NFKC').replace(/[^\p{L}\p{N} _-]+/gu, '-').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72).replace(/-+$/, '') || 'Group-story';
}

/** Returns the verified relative package path; incomplete attempts never receive a completion receipt. */
export async function saveGroupArchive(directory: SessionDirectory, blob: Blob, storyTitle: string): Promise<string> {
  if (!blob.size || blob.size > GROUP_ARCHIVE_LIMITS.archiveBytes) throw new Error('This group archive is empty or too large to save.');
  let folder: SessionDirectory | undefined; let folderName = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    folderName = `Orbit-group-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
    try { await directory.getDirectoryHandle(folderName, { create: false }); }
    catch (error) {
      if (!(error instanceof Error) || error.name !== 'NotFoundError') throw error;
      folder = await directory.getDirectoryHandle(folderName, { create: true }); break;
    }
  }
  if (!folder) throw new Error('Could not create a unique new folder. Try saving again.');
  const file = `Orbit-group-${friendlyName(storyTitle)}.chatter`;
  await writeVerifiedFile(await folder.getFileHandle(file, { create: true }), blob);
  const receipt = new Blob([JSON.stringify({ format: 'orbit-group-receipt', version: 1, completedAt: new Date().toISOString(), file, bytes: blob.size }, null, 2)], { type: 'application/json' });
  await writeVerifiedFile(await folder.getFileHandle('GROUP-COMPLETE.json', { create: true }), receipt);
  return `${folderName}/${file}`;
}

interface ReadableDirectory { entries(): AsyncIterableIterator<[string, ReadableHandle]> }
type ReadableHandle = { kind: 'file'; getFile(): Promise<File> } | ({ kind: 'directory' } & ReadableDirectory);

/** Traverses only a folder explicitly supplied by the user; desktop adapters can offer file selection instead. */
export async function readGroupFiles(directory: SessionDirectory): Promise<File[]> {
  const root = directory as SessionDirectory & Partial<ReadableDirectory>;
  if (typeof root.entries !== 'function') throw new Error('Choose the .chatter files directly; this drive does not support reading folders.');
  const files: File[] = []; let visited = 0; let total = 0;
  async function walk(folder: ReadableDirectory, depth: number): Promise<void> {
    if (depth > 4) throw new Error('This folder is too deep. Choose the group save folder directly.');
    for await (const [name, handle] of folder.entries()) {
      if (++visited > 2000) throw new Error('This folder contains too many items. Choose a smaller group save folder.');
      if (!name || /[\\/\u0000-\u001f]/.test(name) || name === '.' || name === '..') throw new Error('This folder contains an invalid file name.');
      if (handle.kind === 'directory') { await walk(handle, depth + 1); continue; }
      if (handle.kind !== 'file' || !/\.chatter$/i.test(name)) continue;
      const file = await handle.getFile(); total += file.size;
      if (files.length >= GROUP_ARCHIVE_LIMITS.revisions || file.size > GROUP_ARCHIVE_LIMITS.archiveBytes || total > GROUP_ARCHIVE_LIMITS.archiveBytes) throw new Error('This folder exceeds the group collection size limit. Choose fewer files.');
      files.push(file);
    }
  }
  await walk(root as ReadableDirectory, 0); return files;
}
