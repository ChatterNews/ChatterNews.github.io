import { expect, test } from 'vitest';
import { DEFAULT_GATE_CONFIG, Gate, MemoryStore, prosePlainText } from '@chatter/shared';
import type { SessionDirectory } from '../portable/finish-session.js';
import { encodeGroupArchive } from './group-archive.js';
import { saveGroupArchive } from './group-drive.js';
import { captureGroupRevision, groupEntries, joinGroup, makeGroupPiece, startGroup } from './group-work.js';
import { checkStoryFolder, linkedStoryFolder, openStoryFolder, saveLinkedMaster } from './linked-story-folder.js';

class Disk implements SessionDirectory {
  name = 'USB'; folders = new Map<string, Disk>(); files = new Map<string, File>(); clock = 0;
  async getDirectoryHandle(name: string, options: { create: boolean }): Promise<Disk> {
    const found = this.folders.get(name); if (found) return found;
    if (!options.create) throw new DOMException('Missing', 'NotFoundError');
    const folder = new Disk(); folder.name = name; this.folders.set(name, folder); return folder;
  }
  async getFileHandle(name: string, options: { create: boolean }) {
    if (!options.create && !this.files.has(name)) throw new DOMException('Missing', 'NotFoundError');
    return {
      getFile: async () => this.files.get(name)!,
      createWritable: async () => {
        let pending: Blob;
        return { write: async (blob: Blob) => { pending = blob; }, close: async () => { this.files.set(name, new File([pending!], name, { lastModified: ++this.clock })); } };
      },
    };
  }
  async *entries(): AsyncGenerator<[string, any]> {
    for (const [name, file] of this.files) yield [name, { kind: 'file', getFile: async () => file }];
    for (const [name, folder] of this.folders) yield [name, { kind: 'directory', entries: () => folder.entries() }];
  }
}
const gate = (store: MemoryStore) => new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0; } });
const body = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
async function desk(name: string) {
  const store = new MemoryStore(); await store.open();
  const user = await store.users.create({ name, penName: name, role: 'STUDENT', active: true });
  return { store, user };
}

test('the original master discovers new contributor files without being saved or repacked', async () => {
  const lead = await desk('Lead'); const usb = new Disk();
  const main = await startGroup(lead.store, await lead.store.stories.create({ title: 'Lunch story', ownerId: lead.user.id, body: body('The master draft') }), lead.user);
  const path = await saveLinkedMaster(lead.store, main, usb);
  const folder = [...usb.folders.values()][0]!;
  const filename = `MASTER--${main.group!.code}.chatter`;
  const original = folder.files.get(filename)!;
  const student = await desk('Maya');
  const joined = await joinGroup(student.store, main.group!.code, student.user, 'Lunch');
  const piece = await makeGroupPiece(student.store, joined, student.user, 'My interview');
  await student.store.stories.update(piece.id, { body: body('Maya’s contribution') });
  await captureGroupRevision(student.store, piece.id);
  await saveGroupArchive(usb, await encodeGroupArchive(await groupEntries(student.store, main.group!.code)), 'Different spelling', { code: main.group!.code, authorName: 'Maya', pieceTitle: piece.title });
  expect(await checkStoryFolder(lead.store, main.group!.code)).toBe(1);
  expect((await lead.store.groupRevisions.list()).some(row => prosePlainText(row.body) === 'Maya’s contribution')).toBe(true);
  expect(folder.files.get(filename)).toBe(original);
  expect(await checkStoryFolder(lead.store, main.group!.code)).toBe(0);

  const receiver = await desk('Receiver');
  const opened = await openStoryFolder(receiver.store, gate(receiver.store), folder);
  expect(prosePlainText(opened.story.body)).toBe('The master draft');
  expect((await receiver.store.groupRevisions.list()).some(row => row.title === 'My interview')).toBe(true);
  expect(linkedStoryFolder(receiver.store, main.group!.code)?.directory).toBe(folder);

  await lead.store.stories.update(main.id, { body: body('Edited master draft') });
  expect(await saveLinkedMaster(lead.store, (await lead.store.stories.get(main.id))!, usb)).toBe(path);
  expect([...folder.files.keys()]).toEqual([filename]);
  const backups = [...folder.folders.entries()].filter(([name]) => name.startsWith('Master-backup-'));
  expect(backups).toHaveLength(1);
  expect(await backups[0]![1].files.get(filename)!.arrayBuffer()).toEqual(await original.arrayBuffer());
});

test('an unreadable incoming file pauses discovery without altering the local master', async () => {
  const lead = await desk('Lead'); const usb = new Disk();
  const main = await startGroup(lead.store, await lead.store.stories.create({ title: 'Story', body: body('Keep this') }), lead.user);
  await saveLinkedMaster(lead.store, main, usb);
  const folder = [...usb.folders.values()][0]!;
  folder.files.set('broken.chatter', new File(['broken'], 'broken.chatter'));
  await expect(checkStoryFolder(lead.store, main.group!.code)).rejects.toThrow();
  expect(linkedStoryFolder(lead.store, main.group!.code)?.error).toMatch(/could not be checked/);
  expect(prosePlainText((await lead.store.stories.get(main.id))!.body)).toBe('Keep this');
  // A successful master save must not be reported as failed by a bad neighbour.
  await expect(saveLinkedMaster(lead.store, main, usb)).resolves.toContain('MASTER--');
  expect(linkedStoryFolder(lead.store, main.group!.code)?.error).toMatch(/could not be checked/);
  folder.files.delete('broken.chatter');
  expect(await checkStoryFolder(lead.store, main.group!.code, true)).toBeGreaterThanOrEqual(0);
  expect(linkedStoryFolder(lead.store, main.group!.code)?.error).toBeUndefined();
});
