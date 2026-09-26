import { describe, expect, test } from 'vitest';
import { DEFAULT_GATE_CONFIG, Gate, MemoryStore, prosePlainText } from '@chatter/shared';
import JSZip from 'jszip';
import { captureGroupRevision, groupEntries, startGroup } from './group-work.js';
import { encodeGroupArchive } from './group-archive.js';
import { dispatchStoryDriveFile, readGroupFileEntries } from './group-intake.js';
import { exportPortableStory } from '../portable/portable-project.js';
import { openStoryDriveFile } from '../components/StoryDriveOpen.js';

const gate = (store: MemoryStore) => new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0; } });
async function source(title = 'Lunch line') {
  const store = new MemoryStore(); await store.open();
  const user = await store.users.create({ name: 'Private Name', penName: 'Reporter', role: 'ADVISER', active: true });
  const story = await startGroup(store, await store.stories.create({ title, ownerId: user.id, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Collected writing' }] }] } }), user);
  await captureGroupRevision(store, story.id);
  return { store, story, entries: await groupEntries(store, story.group!.code) };
}
describe('group-aware Story Drive intake', () => {
  test('collects an outer archive into a neutral inbox and repeat opens create no copies or badges', async () => {
    const from = await source(); const target = new MemoryStore();
    const file = new File([await encodeGroupArchive(from.entries)], 'group.chatter');
    const first = await dispatchStoryDriveFile(target, gate(target), file);
    const second = await dispatchStoryDriveFile(target, gate(target), file);
    expect(first.collection).toEqual({ added: 1, already: 0 });
    expect(second.collection).toEqual({ added: 0, already: 1 });
    expect(second.result.story.id).toBe(first.result.story.id);
    expect(first.result.story.ownerId).toBeUndefined();
    expect(first.result.story.group).toMatchObject({ code: from.story.group!.code, kind: 'joined', authorId: 'group-inbox', authorName: 'Group' });
    expect(prosePlainText(first.result.story.body)).toBe('');
    expect(await target.stories.list()).toHaveLength(1); expect(await target.users.list()).toHaveLength(0);
  });
  test('grouped portable history collects without importing original story, users or roles', async () => {
    const from = await source(); const packed = await exportPortableStory(from.store, from.story);
    const file = new File([packed.blob], packed.fileName); const target = new MemoryStore();
    expect(await readGroupFileEntries(file)).toHaveLength(1);
    const opened = await dispatchStoryDriveFile(target, gate(target), file);
    expect(opened.collection?.added).toBe(1); expect(opened.result.story.id).not.toBe(from.story.id);
    expect(await target.users.list()).toEqual([]); expect(await target.groupRevisions.list()).toHaveLength(1);
    expect((await dispatchStoryDriveFile(target, gate(target), file)).collection?.already).toBe(1);
  });
  test('reopens a joined inbox portable save with its collected history', async () => {
    const from = await source(); const inboxStore = new MemoryStore();
    const inbox = await dispatchStoryDriveFile(inboxStore, gate(inboxStore), new File([await encodeGroupArchive(from.entries)], 'pieces.chatter'));
    expect(inbox.result.story.group?.kind).toBe('joined');
    const packed = await exportPortableStory(inboxStore, inbox.result.story);
    const target = new MemoryStore(); const opened = await dispatchStoryDriveFile(target, gate(target), new File([packed.blob], packed.fileName));
    expect(opened.collection).toEqual({ added: 1, already: 0 });
    expect(opened.result.story.group?.kind).toBe('joined'); expect(await target.users.list()).toEqual([]);
  });
  test('group snapshots without history receive a stable revision identity', async () => {
    const from = await source(); const packed = await exportPortableStory(from.store, from.story, { omitGroupHistory: true });
    const file = new File([packed.blob], packed.fileName);
    expect(await readGroupFileEntries(file)).toEqual(await readGroupFileEntries(file));
    const target = new MemoryStore(); await dispatchStoryDriveFile(target, gate(target), file);
    expect((await dispatchStoryDriveFile(target, gate(target), file)).collection).toEqual({ added: 0, already: 1 });
  });
  test('retains a changed current snapshot alongside its older history with stable repeat identity', async () => {
    const from = await source(); const packed = await exportPortableStory(from.store, from.story);
    const zip = await JSZip.loadAsync(await packed.blob.arrayBuffer());
    const project = JSON.parse(await zip.file('story.chatter.json')!.async('string'));
    project.story.title = 'A newer title'; zip.file('story.chatter.json', JSON.stringify(project));
    const file = new File([await zip.generateAsync({ type: 'uint8array' }) as BlobPart], 'newer.chatter');
    const target = new MemoryStore(); const first = await dispatchStoryDriveFile(target, gate(target), file);
    expect(first.collection?.added).toBe(2);
    expect((await dispatchStoryDriveFile(target, gate(target), file)).collection).toEqual({ added: 0, already: 2 });
    expect((await target.groupRevisions.list()).map(revision => revision.title)).toContain('A newer title');
  });
  test('creates separate inboxes for same-title group codes in one collection', async () => {
    const a = await source('Same title'); const b = await source('Same title'); const target = new MemoryStore();
    await dispatchStoryDriveFile(target, gate(target), new File([await encodeGroupArchive([...a.entries, ...b.entries])], 'both.chatter'));
    const stories = await target.stories.list(); expect(stories).toHaveLength(2); expect(new Set(stories.map(s => s.group!.code)).size).toBe(2);
  });
  test('returns the existing lead draft without changing its writing or ownership', async () => {
    const from = await source(); const target = new MemoryStore();
    const local = await target.stories.create({ title: 'Local lead draft', ownerId: 'local-author', group: from.story.group, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep my current writing' }] }] } });
    const opened = await dispatchStoryDriveFile(target, gate(target), new File([await encodeGroupArchive(from.entries)], 'group.chatter'));
    expect(opened.result.story).toEqual(local); expect(await target.stories.get(local.id)).toEqual(local);
    expect(await target.stories.list()).toHaveLength(1); expect(await target.groupRevisions.list()).toHaveLength(1);
  });
  test('rejects a root conflict with an existing local draft before collecting any history', async () => {
    const from = await source(); const target = new MemoryStore();
    await target.stories.create({ title: 'Other root', group: { ...from.story.group!, rootId: 'different-root' } });
    await expect(dispatchStoryDriveFile(target, gate(target), new File([await encodeGroupArchive(from.entries)], 'conflict.chatter'))).rejects.toThrow(/code/i);
    expect(await target.groupRevisions.list()).toEqual([]); expect(await target.stories.list()).toHaveLength(1);
  });
  test('leaves the entire store unchanged when a later snapshot fails validation', async () => {
    const a = await source(); const b = await source(); const target = new MemoryStore();
    const broken = { ...b.entries[0]!, record: { ...b.entries[0]!.record, body: { type: 'doc', content: [] } } };
    await expect(dispatchStoryDriveFile(target, gate(target), new File([await encodeGroupArchive([...a.entries, broken])], 'mixed.chatter'))).rejects.toThrow();
    expect(await target.stories.list()).toEqual([]); expect(await target.groupRevisions.list()).toEqual([]); expect(await target.users.list()).toEqual([]);
  });
  test('checks grouped portable source bytes even when its nested collection is valid', async () => {
    const from = await source(); const packed = await exportPortableStory(from.store, from.story); const zip = await JSZip.loadAsync(await packed.blob.arrayBuffer());
    zip.remove('sounds.soundpack'); const file = new File([await zip.generateAsync({ type: 'uint8array' }) as BlobPart], 'broken.chatter');
    const target = new MemoryStore(); await expect(dispatchStoryDriveFile(target, gate(target), file)).rejects.toThrow(/missing/i);
    expect(await target.stories.list()).toEqual([]); expect(await target.groupRevisions.list()).toEqual([]);
  });
  test('keeps ordinary portable imports working while group collection asks to assign a code', async () => {
    const from = new MemoryStore(); const story = await from.stories.create({ title: 'Solo story' }); const packed = await exportPortableStory(from, story);
    const file = new File([packed.blob], packed.fileName); const target = new MemoryStore();
    await expect(readGroupFileEntries(file)).rejects.toThrow(/group|code/i);
    const result = await dispatchStoryDriveFile(target, gate(target), file);
    expect(result.collection).toBeUndefined(); expect(result.result.story.title).toBe('Solo story');
  });
  test('retains the ordinary 2 GB archive allowance while group archives keep their stricter limit', async () => {
    const from = new MemoryStore(); const packed = await exportPortableStory(from, await from.stories.create({ title: 'Large legacy video' }));
    const file = new File([packed.blob], packed.fileName);
    // Exercise the pre-read size boundary without allocating a half-gigabyte fixture.
    Object.defineProperty(file, 'size', { value: 600 * 1024 * 1024 });
    const target = new MemoryStore();
    expect((await dispatchStoryDriveFile(target, gate(target), file)).result.story.title).toBe('Large legacy video');
    const group = await source(); const groupFile = new File([await encodeGroupArchive(group.entries)], 'large-group.chatter');
    Object.defineProperty(groupFile, 'size', { value: 600 * 1024 * 1024 });
    await expect(dispatchStoryDriveFile(target, gate(target), groupFile)).rejects.toThrow(/large|limit/i);
  });
  test('entry screen reports collection instead of claiming to overwrite a working story', async () => {
    const from = await source(); const target = new MemoryStore();
    const outcome = await openStoryDriveFile(target, gate(target), new File([await encodeGroupArchive(from.entries)], 'group.chatter'));
    expect(outcome.status).toBe('OPENED'); expect(outcome.message).toMatch(/Collected/);
  });
});
