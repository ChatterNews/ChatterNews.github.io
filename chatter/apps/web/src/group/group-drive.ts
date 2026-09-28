import { writeVerifiedFile, type SessionDirectory } from '../portable/finish-session.js';
import { GROUP_ARCHIVE_LIMITS } from './group-archive.js';
import { normalizeStoryCode } from '@chatter/shared';

function friendlyName(title: string): string {
  return title.normalize('NFKC').replace(/[^\p{L}\p{N} _-]+/gu, '-').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72).replace(/-+$/, '') || 'Group-story';
}

export interface GroupSaveInfo { code: string; authorName: string; pieceTitle: string; kind?: 'master' | 'contribution' | 'collection' }

export function storyFolderName(title: string, code: string): string {
  return `${friendlyName(title).replaceAll('-', ' ')} -- ${normalizeStoryCode(code)}`;
}

export function groupDownloadFileName(title: string, info: GroupSaveInfo): string {
  return `${(info.kind ?? 'contribution').toUpperCase()}--${friendlyName(title).slice(0, 40)}--${normalizeStoryCode(info.code)}--${friendlyName(info.authorName).slice(0, 24)}--${friendlyName(info.pieceTitle).slice(0, 36)}--${new Date().toISOString().replace(/[:.]/g, '-')}--${crypto.randomUUID()}.chatter`;
}

/** Names help people; the suffix is the key. A joined student may have typed a
 * different title, so reuse a folder with the code rather than splitting it. */
export async function storyDirectory(directory: SessionDirectory, title: string, input: string): Promise<SessionDirectory> {
  const code = normalizeStoryCode(input);
  const suffix = ` -- ${code}`;
  if (directory.name.endsWith(suffix)) return directory;
  if (/ -- (?:[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}|[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){2})$/.test(directory.name)) {
    throw new Error('That folder belongs to a different story code. Choose the USB drive or this story’s folder.');
  }
  const root = directory as SessionDirectory & Partial<ReadableDirectory>;
  const matches: string[] = [];
  if (root.entries) {
    let visited = 0;
    for await (const [name, handle] of root.entries()) {
      if (++visited > 2000) throw new Error('Choose a smaller folder on your USB drive.');
      if (handle.kind === 'directory' && name.endsWith(suffix) && !/[\\/\u0000-\u001f]/.test(name)) matches.push(name);
    }
  }
  if (matches.length > 1) throw new Error('There are two folders with this story code. Choose the folder your group is using.');
  return directory.getDirectoryHandle(matches[0] ?? storyFolderName(title, code), { create: true });
}

/** Returns the verified relative package path; incomplete attempts never receive a completion receipt. */
export async function saveGroupArchive(directory: SessionDirectory, blob: Blob, storyTitle: string, info?: GroupSaveInfo): Promise<string> {
  if (!blob.size || blob.size > GROUP_ARCHIVE_LIMITS.archiveBytes) throw new Error('This group archive is empty or too large to save.');
  const destination = info ? await storyDirectory(directory, storyTitle, info.code) : directory;
  let folder: SessionDirectory | undefined; let folderName = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    folderName = `${info ? friendlyName(info.authorName).slice(0, 24) : 'Orbit-group'}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
    try { await destination.getDirectoryHandle(folderName, { create: false }); }
    catch (error) {
      if (!(error instanceof Error) || error.name !== 'NotFoundError') throw error;
      folder = await destination.getDirectoryHandle(folderName, { create: true }); break;
    }
  }
  if (!folder) throw new Error('Could not create a unique new folder. Try saving again.');
  const file = info ? groupDownloadFileName(storyTitle, info) : `Orbit-group-${friendlyName(storyTitle)}.chatter`;
  await writeVerifiedFile(await folder.getFileHandle(file, { create: true }), blob);
  const receipt = new Blob([JSON.stringify({ format: 'orbit-group-receipt', version: 1, completedAt: new Date().toISOString(), file, bytes: blob.size }, null, 2)], { type: 'application/json' });
  await writeVerifiedFile(await folder.getFileHandle('GROUP-COMPLETE.json', { create: true }), receipt);
  return `${info ? `${destination.name}/` : ''}${folderName}/${file}`;
}

interface ReadableDirectory { entries(): AsyncIterableIterator<[string, ReadableHandle]> }
type ReadableHandle = { kind: 'file'; getFile(): Promise<File> } | ({ kind: 'directory' } & ReadableDirectory);

/** Traverses only a folder explicitly supplied by the user; desktop adapters can offer file selection instead. */
export async function readGroupFiles(directory: SessionDirectory, recursive = true): Promise<File[]> {
  const root = directory as SessionDirectory & Partial<ReadableDirectory>;
  if (typeof root.entries !== 'function') throw new Error('Choose the .chatter files directly; this drive does not support reading folders.');
  const files: File[] = []; let visited = 0; let total = 0;
  async function walk(folder: ReadableDirectory, depth: number): Promise<void> {
    if (depth > 4) throw new Error('This folder is too deep. Choose the group save folder directly.');
    for await (const [name, handle] of folder.entries()) {
      if (++visited > 2000) throw new Error('This folder contains too many items. Choose a smaller group save folder.');
      if (!name || /[\\/\u0000-\u001f]/.test(name) || name === '.' || name === '..') throw new Error('This folder contains an invalid file name.');
      if (handle.kind === 'directory') { if (recursive) await walk(handle, depth + 1); continue; }
      if (handle.kind !== 'file' || !/\.chatter$/i.test(name)) continue;
      const file = await handle.getFile(); total += file.size;
      if (files.length >= GROUP_ARCHIVE_LIMITS.revisions || file.size > GROUP_ARCHIVE_LIMITS.archiveBytes || total > GROUP_ARCHIVE_LIMITS.archiveBytes) throw new Error('This folder exceeds the group collection size limit. Choose fewer files.');
      files.push(file);
    }
  }
  await walk(root as ReadableDirectory, 0); return files;
}
