import { describe, expect, test, vi } from 'vitest';
import type { SessionDirectory, StoryFileHandle } from '../portable/finish-session.js';
import { readGroupFiles, saveGroupArchive } from './group-drive.js';
import { createStoryCode } from '@chatter/shared';

class Disk implements SessionDirectory {
  name = 'USB'; folders = new Map<string, Disk>(); files = new Map<string, Blob>(); fail = false; corrupt = false;
  async getDirectoryHandle(name: string, options: { create: boolean }) {
    const existing = this.folders.get(name); if (existing) return existing;
    if (!options.create) throw new DOMException('Missing', 'NotFoundError');
    const next = new Disk(); next.name = name; next.fail = this.fail; next.corrupt = this.corrupt; this.folders.set(name, next); return next;
  }
  async getFileHandle(name: string): Promise<StoryFileHandle> {
    return { createWritable: async () => { let pending: Blob; return { write: async blob => { if (this.fail) throw new Error('Drive full'); pending = blob; }, close: async () => { this.files.set(name, pending!); } }; }, getFile: async () => this.corrupt ? new Blob(['changed']) : this.files.get(name)! };
  }
  async *entries(): AsyncGenerator<[string, any]> {
    for (const [name, data] of this.files) yield [name, { kind: 'file', getFile: async () => new File([data], name) }];
    for (const [name, folder] of this.folders) yield [name, { kind: 'directory', entries: () => folder.entries() }];
  }
}
describe('additive group drive saves', () => {
  test('groups independently named contributions by code and keeps every saved file', async () => {
    const disk = new Disk(); const code = createStoryCode();
    const first = await saveGroupArchive(disk, new Blob(['Maya']), 'Lunch line', { code, authorName: 'Maya', pieceTitle: 'My view' });
    const second = await saveGroupArchive(disk, new Blob(['Leo']), 'Lunch report', { code, authorName: 'Leo', pieceTitle: 'My view' });
    expect(disk.folders.size).toBe(1);
    expect(first.split('/')[0]).toBe(`Lunch line -- ${code}`);
    expect(second.split('/')[0]).toBe(first.split('/')[0]);
    const folder = [...disk.folders.values()][0]!;
    const third = await saveGroupArchive(folder, new Blob(['Maya edit']), 'Different title', { code, authorName: 'Maya', pieceTitle: 'My view' });
    expect(third.split('/')[0]).toBe(first.split('/')[0]);
    const files = await readGroupFiles(folder);
    expect(await Promise.all(files.map(file => file.text()))).toEqual(['Maya', 'Leo', 'Maya edit']);
    expect(files.every(file => file.name.startsWith('CONTRIBUTION--') && file.name.includes(code))).toBe(true);
  });
  test('separates same-title stories and refuses the wrong code folder', async () => {
    const disk = new Disk(); const one = createStoryCode(); const two = createStoryCode();
    await saveGroupArchive(disk, new Blob(['master']), 'Lunch', { code: one, authorName: 'Master', pieceTitle: 'Lunch', kind: 'master' });
    await saveGroupArchive(disk, new Blob(['other']), 'Lunch', { code: two, authorName: 'Sam', pieceTitle: 'Lunch' });
    expect(disk.folders.size).toBe(2);
    const first = disk.folders.get(`Lunch -- ${one}`)!;
    expect((await readGroupFiles(first))[0]!.name).toMatch(/^MASTER--/);
    await expect(saveGroupArchive(first, new Blob(['wrong']), 'Lunch', { code: two, authorName: 'Sam', pieceTitle: 'Lunch' })).rejects.toThrow(/different story code/i);
    expect(await readGroupFiles(first)).toHaveLength(1);
  });
  test('rejects bad codes before making folders', async () => {
    const disk = new Disk();
    await expect(saveGroupArchive(disk, new Blob(['work']), 'Lunch', { code: 'bad', authorName: 'Sam', pieceTitle: 'Lunch' })).rejects.toThrow(/code/i);
    expect(disk.folders.size).toBe(0);
  });
  test('same-title saves use independent safe paths and write completion receipt last', async () => {
    const disk = new Disk(); const blob = new Blob(['complete archive']);
    const first = await saveGroupArchive(disk, blob, '../../Lunch: line?');
    const second = await saveGroupArchive(disk, new Blob(['new version']), '../../Lunch: line?');
    expect(first).not.toBe(second); expect(disk.folders.size).toBe(2);
    for (const path of [first, second]) {
      const [folderName, fileName] = path.split('/'); const folder = disk.folders.get(folderName!)!;
      expect(fileName).toMatch(/Lunch-line.*\.chatter$/); expect(path).not.toContain('..');
      expect([...folder.files.keys()].at(-1)).toBe('GROUP-COMPLETE.json');
      const receipt = JSON.parse(await folder.files.get('GROUP-COMPLETE.json')!.text());
      expect(receipt.file).toBe(fileName); expect(receipt.bytes).toBe(folder.files.get(fileName!)!.size);
    }
    expect(await disk.folders.get(first.split('/')[0]!)!.files.get(first.split('/')[1]!)!.text()).toBe('complete archive');
  });
  test.each(['full', 'corrupt'])('does not certify a %s write', async failure => {
    const disk = new Disk(); disk.fail = failure === 'full'; disk.corrupt = failure === 'corrupt';
    await expect(saveGroupArchive(disk, new Blob(['archive']), 'Story')).rejects.toThrow();
    expect([...disk.folders.values()][0]!.files.has('GROUP-COMPLETE.json')).toBe(false);
  });
  test('never reuses a pre-existing batch even if random IDs collide', async () => {
    const disk = new Disk(); const random = vi.spyOn(crypto, 'randomUUID').mockReturnValue('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    vi.useFakeTimers(); vi.setSystemTime(1000);
    try {
      const first = await saveGroupArchive(disk, new Blob(['old']), 'Story');
      await expect(saveGroupArchive(disk, new Blob(['new']), 'Story')).rejects.toThrow(/unique|new folder/i);
      expect(await disk.folders.get(first.split('/')[0]!)!.files.get(first.split('/')[1]!)!.text()).toBe('old');
    } finally { random.mockRestore(); vi.useRealTimers(); }
  });
  test('collects only .chatter files from the explicitly selected folder and its bounded children', async () => {
    const disk = new Disk(); disk.files.set('ignore.txt', new Blob(['private'])); disk.files.set('first.chatter', new Blob(['one']));
    const batch = await disk.getDirectoryHandle('Orbit-group-batch', { create: true }); batch.files.set('second.CHATTER', new Blob(['two']));
    const files = await readGroupFiles(disk);
    expect(files.map(file => file.name)).toEqual(['first.chatter', 'second.CHATTER']);
  });
  test('fails clearly when a desktop adapter does not expose folder enumeration', async () => {
    const disk = new Disk(); Object.defineProperty(disk, 'entries', { value: undefined });
    await expect(readGroupFiles(disk)).rejects.toThrow(/choose|folder|files/i);
  });
  test('rejects excessive folder depth without silently skipping potential work', async () => {
    const disk = new Disk(); let next = disk;
    for (let i = 0; i < 6; i++) next = await next.getDirectoryHandle(`nested${i}`, { create: true });
    await expect(readGroupFiles(disk)).rejects.toThrow(/deep|folder/i);
  });
});
