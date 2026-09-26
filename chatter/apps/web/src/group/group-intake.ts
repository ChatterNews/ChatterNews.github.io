import { newId, sha256, validateGroupRevision, validateStoryGroupFields, type Gate, type GroupRevision, type Store } from '@chatter/shared';
import type JSZip from 'jszip';
import { importPortableStory, isPortableStoryProject, type PortableStoryProject } from '../portable/portable-project.js';
import { decodeGroupArchive, loadBoundedZip, readBoundedZipEntry, GROUP_ARCHIVE_LIMITS, type GroupArchiveEntry } from './group-archive.js';
import { collectGroupEntries, inspectGroupSnapshot } from './group-work.js';

type PortableResult = Awaited<ReturnType<typeof importPortableStory>>;
export interface GroupIntakeResult { result: PortableResult; collection?: { added: number; already: number } }
type Classified = { kind: 'collection'; zip: JSZip } | { kind: 'portable'; zip: JSZip; project: PortableStoryProject };

async function classify(file: File): Promise<Classified> {
  // Detect group metadata without reducing the existing 2 GB ordinary Story Drive allowance.
  // Group payloads are subsequently decoded/inspected again with the stricter group limits.
  const zip = await loadBoundedZip(file, { archiveBytes: 2_000_000_000, entryBytes: 2_000_000_000, expandedBytes: 2_000_000_000 });
  if (zip.file('group.chatter.json')) return { kind: 'collection', zip };
  const manifest = zip.file('story.chatter.json');
  if (!manifest) throw new Error('That is not a Chatter story file: story.chatter.json is missing.');
  const project: unknown = JSON.parse(new TextDecoder().decode(await readBoundedZipEntry(manifest, GROUP_ARCHIVE_LIMITS.manifestBytes)));
  if (!isPortableStoryProject(project)) throw new Error('This Chatter story file uses an unsupported or damaged format.');
  return { kind: 'portable', zip, project };
}

async function entriesFrom(file: File, input: Classified): Promise<GroupArchiveEntry[]> {
  if (input.kind === 'collection') return decodeGroupArchive(file);
  const { project, zip } = input;
  if (!project.story.group) throw new Error('This story has no group code. Open it as a normal Story Drive, then assign it to a group from the local story.');
  validateStoryGroupFields(project.story);
  const group = project.story.group;
  let entries: GroupArchiveEntry[] = [];
  let snapshot: Uint8Array;
  if (project.groupArchive !== undefined) {
    if (project.groupArchive !== 'group.collection' || !zip.file(project.groupArchive)) throw new Error('This story is missing its group contributions.');
    entries = await decodeGroupArchive(new Blob([await readBoundedZipEntry(zip.file(project.groupArchive)!) as BlobPart]));
    if (entries.some(entry => entry.record.groupCode !== group.code)) throw new Error('This story contains contributions for a different group code.');
    zip.remove(project.groupArchive); delete project.groupArchive;
    zip.file('story.chatter.json', JSON.stringify(project), { date: zip.file('story.chatter.json')!.date });
    snapshot = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  } else snapshot = new Uint8Array(await file.arrayBuffer());

  // Inspect the wrapper too: a valid history must not hide a broken current source.
  const checked = await inspectGroupSnapshot(snapshot, { allowJoined: true });
  if (group.kind !== 'joined' && !entries.some(entry => entry.record.contributionId === group.contributionId && entry.record.contentHash === checked.hash)) {
    const hash = await sha256(snapshot);
    const record: GroupRevision = {
      id: `group-snapshot-${hash.slice('sha256:'.length)}`, createdAt: project.story.createdAt, updatedAt: project.story.updatedAt,
      groupCode: group.code, rootId: group.rootId, contributionId: group.contributionId,
      parentRevisionId: group.lastRevisionId ?? group.baseRevisionId, kind: group.kind,
      authorId: group.authorId, authorName: group.authorName, title: project.story.title,
      storyTitle: entries[0]?.record.storyTitle ?? project.story.title,
      snapshotHash: hash, contentHash: checked.hash, body: structuredClone(project.story.body),
    };
    validateGroupRevision(record); entries.push({ record, snapshot });
  }
  if (!entries.length) throw new Error('This group story has no saved pieces yet. Save a piece or a main draft before sharing it.');
  return entries;
}

/** Reads group receipts or grouped portable files without changing stories or importing identities. */
export async function readGroupFileEntries(file: File): Promise<GroupArchiveEntry[]> {
  return entriesFrom(file, await classify(file));
}

/** Every grouped file goes to immutable collection; ordinary Story Drives retain their existing behavior. */
export async function dispatchStoryDriveFile(store: Store, gate: Gate, file: File): Promise<GroupIntakeResult> {
  const input = await classify(file);
  if (input.kind === 'portable' && !input.project.story.group && input.project.groupArchive === undefined) return { result: await importPortableStory(store, gate, file) };
  const entries = await entriesFrom(file, input);
  const stories = await store.stories.list();
  for (const { record } of entries) {
    if (stories.some(story => story.group?.code === record.groupCode && story.group.rootId && record.rootId && story.group.rootId !== record.rootId)) throw new Error('Two group stories use this code. Keep these files separate and ask the lead to give one story a new code.');
  }
  // collectGroupEntries validates the whole batch and existing identities before its first write.
  const collection = await collectGroupEntries(store, entries);
  const codes = new Map<string, GroupRevision>();
  for (const { record } of entries) if (!codes.has(record.groupCode)) codes.set(record.groupCode, record);
  let first: PortableResult | undefined;
  for (const [code, record] of codes) {
    const existing = stories.find(story => story.group?.code === code && story.group.kind === 'main')
      ?? stories.find(story => story.group?.code === code && story.group.kind === 'joined');
    const story = existing ?? await store.stories.create({
      title: record.storyTitle, channels: ['web'], creationRecipeId: 'article', status: 'WORK', bylineIds: [],
      body: { type: 'doc', content: [] },
      group: { code, rootId: record.rootId, kind: 'joined', contributionId: newId(), authorId: 'group-inbox', authorName: 'Group' },
    });
    first ??= { story, mediaCount: 0, updated: !!existing };
  }
  if (!first) throw new Error('This group collection is empty.');
  return { result: first, collection };
}
