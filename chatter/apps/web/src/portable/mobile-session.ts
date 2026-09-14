import JSZip from 'jszip';
import type { Store } from '@chatter/shared';
import { finishSession, type SessionDirectory, type StoryFileHandle } from './finish-session.js';

const MOBILE_SESSION_LIMIT = 256 * 1024 * 1024;

/** This prepares a download, not a verified write into the user's Files app. */
export function sessionDownloadDirectory(limit = MOBILE_SESSION_LIMIT) {
  const entries = new Map<string, Blob>();
  let committedBytes = 0;
  function segment(name: string) {
    if (!name || name === '.' || name === '..' || /[/\\\x00-\x1f]/.test(name)) throw new Error('The session contains an invalid file name.');
    return name;
  }
  function directory(parts: string[]): SessionDirectory {
    return {
      name: parts.at(-1) ?? 'Prepared session',
      async getDirectoryHandle(name) { return directory([...parts, segment(name)]); },
      async getFileHandle(name): Promise<StoryFileHandle> {
        const path = [...parts, segment(name)].join('/');
        return {
          async createWritable() {
            if (entries.has(path)) throw new Error('A prepared session file already has that name.');
            let chunks: Blob[] = []; let size = 0; let closed = false;
            return {
              async write(blob) {
                if (closed) throw new Error('This prepared file is already closed.');
                if (committedBytes + size + blob.size > limit) throw new Error('This session is too large to pack on a phone or tablet. Save individual stories, or finish the session on a computer.');
                chunks.push(blob); size += blob.size;
              },
              async close() {
                if (closed || entries.has(path)) throw new Error('This prepared file is already closed.');
                entries.set(path, new Blob(chunks)); committedBytes += size; chunks = []; closed = true;
              },
              async abort() { chunks = []; size = 0; closed = true; },
            };
          },
          async getFile() {
            const blob = entries.get(path);
            if (!blob) throw new Error('The prepared file did not finish.');
            return blob;
          },
        };
      },
    };
  }
  return { directory: directory([]), entries };
}

export async function prepareMobileSession(store: Store, onProgress: (message: string) => void = () => {}) {
  const draft = sessionDownloadDirectory();
  const result = await finishSession(store, draft.directory, onProgress);
  onProgress('Preparing the file for Files…');
  const zip = new JSZip();
  // Story archives are already compressed. STORE avoids another expensive pass.
  for (const [name, blob] of draft.entries) zip.file(name, blob.arrayBuffer());
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
  return { file: new File([blob], `${result.folderName}.zip`, { type: 'application/zip' }), stories: result.files.length };
}

/** Called by a second tap, preserving Safari's user gesture for the share sheet. */
export async function offerMobileFile(file: File): Promise<'shared' | 'download'> {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  }
  return downloadMobileFile(file);
}

export function downloadMobileFile(file: File): 'download' {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = file.name; anchor.style.display = 'none';
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'download';
}
