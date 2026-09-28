import type { Gate, Store, Story } from '@chatter/shared';
import { normalizeStoryCode } from '@chatter/shared';
import { exportPortableStory, isPortableStoryProject } from '../portable/portable-project.js';
import { writeVerifiedFile, type SessionDirectory } from '../portable/finish-session.js';
import { loadBoundedZip, readBoundedZipEntry } from './group-archive.js';
import { readGroupFiles, storyDirectory } from './group-drive.js';
import { dispatchStoryDriveFile, readGroupFileEntries } from './group-intake.js';
import { collectGroupEntries } from './group-work.js';

interface Connection {
  directory: SessionDirectory;
  signature?: string;
  error?: string;
  pending?: Promise<number>;
}
// Folder access is intentionally browser-session scoped. Reopening a folder is
// the permission gesture; neither filenames nor a code grant filesystem access.
const connections = new WeakMap<Store, Map<string, Connection>>();
const listeners = new WeakMap<Store, Set<() => void>>();
function announce(store: Store) { for (const listener of listeners.get(store) ?? []) listener(); }
export function subscribeStoryFolders(store: Store, listener: () => void) {
  const list = listeners.get(store) ?? new Set(); listeners.set(store, list); list.add(listener);
  return () => { list.delete(listener); };
}
export function linkedStoryFolder(store: Store, code: string) { return connections.get(store)?.get(code); }
function attach(store: Store, code: string, directory: SessionDirectory) {
  const map = connections.get(store) ?? new Map(); connections.set(store, map);
  const connection: Connection = { directory }; map.set(normalizeStoryCode(code), connection);
  announce(store); return connection;
}

export async function checkStoryFolder(store: Store, code: string, force = false): Promise<number> {
  const connection = linkedStoryFolder(store, code);
  if (!connection || (connection.error && !force)) return 0;
  if (connection.pending) return connection.pending;
  const scan = async () => {
    try {
      const files = await readGroupFiles(connection.directory);
      const signature = JSON.stringify(files.map(file => [file.name, file.size, file.lastModified]).sort());
      if (!force && signature === connection.signature) return 0;
      const entries = [];
      for (const file of files) {
        const received = await readGroupFileEntries(file);
        entries.push(...received.filter(entry => entry.record.groupCode === code));
      }
      const result = await collectGroupEntries(store, entries);
      connection.signature = signature; connection.error = undefined;
      announce(store); return result.added;
    } catch (error) {
      connection.error = `USB folder unavailable or a file could not be checked. ${error instanceof Error ? error.message : 'Reconnect the folder.'}`;
      announce(store); throw error;
    } finally { connection.pending = undefined; }
  };
  connection.pending = scan(); return connection.pending;
}

export async function connectStoryFolder(store: Store, code: string, directory: SessionDirectory) {
  attach(store, code, directory);
  await checkStoryFolder(store, code, true);
}

/** Open the one master in the selected folder and discover its neighbours. */
export async function openStoryFolder(store: Store, gate: Gate, directory: SessionDirectory) {
  const masters: File[] = [];
  for (const file of await readGroupFiles(directory, false)) {
    const zip = await loadBoundedZip(file); const manifest = zip.file('story.chatter.json');
    if (!manifest) continue;
    const project: unknown = JSON.parse(new TextDecoder().decode(await readBoundedZipEntry(manifest, 8 * 1024 * 1024)));
    if (isPortableStoryProject(project) && project.groupMaster) masters.push(file);
  }
  if (masters.length !== 1) throw new Error(masters.length ? 'Choose a story folder with one master file. Keep older masters in its backups folder.' : 'Choose the story folder that contains its master .chatter file.');
  const opened = await dispatchStoryDriveFile(store, gate, masters[0]!);
  // The master has already opened successfully; discovery errors are reported
  // separately by the connection, without pretending the open was rolled back.
  await connectStoryFolder(store, opened.result.story.group!.code, directory).catch(() => undefined);
  return opened.result;
}

/** The original master path stays fixed. Contributor discovery is separate from
 * saving the draft, so finding another student's file never requires a repack. */
export async function saveLinkedMaster(store: Store, story: Story, destination: SessionDirectory) {
  if (story.group?.kind !== 'main') throw new Error('Open the master story first.');
  const folder = await storyDirectory(destination, story.title, story.group.code);
  const filename = `MASTER--${story.group.code}.chatter`;
  const packed = await exportPortableStory(store, story, { omitGroupHistory: true });
  const zip = await loadBoundedZip(packed.blob);
  const project = packed.project; project.groupMaster = true;
  zip.file('story.chatter.json', JSON.stringify(project));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  let prior: Blob | undefined;
  try {
    const file = await (await folder.getFileHandle(filename, { create: false })).getFile();
    prior = new Blob([await file.slice(0, file.size).arrayBuffer()]);
    const previous = await loadBoundedZip(prior);
    const previousEntry = previous.file('story.chatter.json');
    if (!previousEntry) throw new Error('The existing master is not readable. Keep it and choose a different story folder.');
    const data = JSON.parse(new TextDecoder().decode(await readBoundedZipEntry(previousEntry, 8 * 1024 * 1024)));
    if (!isPortableStoryProject(data) || data.story.group?.code !== story.group.code || data.story.group.rootId !== story.group.rootId) throw new Error('That master belongs to another story. Keep it and choose a different folder.');
  } catch (error) { if (!(error instanceof Error) || error.name !== 'NotFoundError') throw error; }
  if (prior) {
    const backup = await folder.getDirectoryHandle(`Master-backup-${crypto.randomUUID()}`, { create: true });
    await writeVerifiedFile(await backup.getFileHandle(filename, { create: true }), prior);
  }
  await writeVerifiedFile(await folder.getFileHandle(filename, { create: true }), blob);
  attach(store, story.group.code, folder);
  // The verified save remains successful even if a contributor file is damaged.
  await checkStoryFolder(store, story.group.code, true).catch(() => undefined);
  return `${folder.name}/${filename}`;
}
