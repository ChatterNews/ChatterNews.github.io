import { describe, expect, test } from 'vitest';
import { MemoryStore, createShowtimeProject, makeShowtimeClip, type Store } from '@chatter/shared';
import JSZip from 'jszip';
import { finishSession, writeVerifiedFile, type SessionDirectory, type StoryFileHandle } from './finish-session.js';
import { registerSessionCheckpoint } from '../store/session-checkpoint.js';
import { exportPortableStory } from './portable-project.js';

class Disk implements SessionDirectory {
  name = 'USB';
  folders = new Map<string, Disk>();
  files = new Map<string, Blob>();
  corrupt = false;
  fail = false;
  async getDirectoryHandle(name: string) {
    const folder = new Disk(); folder.name = name; folder.fail = this.fail; folder.corrupt = this.corrupt;
    this.folders.set(name, folder); return folder;
  }
  async getFileHandle(name: string): Promise<StoryFileHandle> {
    return {
      createWritable: async () => {
        let data: Blob;
        return { write: async (blob) => { if (this.fail) throw new Error('Drive full'); data = blob; }, close: async () => { this.files.set(name, data!); } };
      },
      getFile: async () => this.corrupt ? new Blob(['bad']) : this.files.get(name)!,
    };
  }
}
async function story(store: Store, title = 'Field notes') {
  return store.stories.create({ title, status: 'WORK', ownerId: 'crew', bylineIds: [], channels: ['web'], body: { type: 'doc', content: [] } });
}
async function manifest(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const file = Object.values(zip.files).find((entry) => entry.name.endsWith('.json'))!;
  return JSON.parse(await file.async('string'));
}

describe('Finish session handoff', () => {
  test('flushes drafts, reads fresh stories, verifies every archive, and writes a receipt last', async () => {
    const store = new MemoryStore('finish'); await store.open();
    const first = await story(store); await story(store); // Duplicate titles must not collide.
    const unregister = registerSessionCheckpoint(store, async () => { await store.stories.update(first.id, { title: 'Fresh edit' }); });
    const disk = new Disk();
    const result = await finishSession(store, disk);
    expect(result.files).toHaveLength(2);
    const folder = disk.folders.get(result.folderName)!;
    expect([...folder.files.keys()].at(-1)).toBe('SESSION-COMPLETE.json');
    expect((await manifest(folder.files.get(result.files[0]!.file)!)).story.title).toBe('Fresh edit');
    expect(JSON.parse(await folder.files.get('SESSION-COMPLETE.json')!.text()).files).toEqual(result.files);
    unregister();
    await store.stories.update(first.id, { title: 'After unregister' });
    const next = await finishSession(store, disk);
    expect(next.folderName).not.toBe(result.folderName);
    expect(next.files[0]!.title).toBe('After unregister');
    expect(disk.folders.size).toBe(2);
  });

  test.each(['full', 'corrupt'])('does not finish or create a receipt on a %s drive', async (failure) => {
    const store = new MemoryStore(failure); await store.open(); await story(store);
    const disk = new Disk(); disk.fail = failure === 'full'; disk.corrupt = failure === 'corrupt';
    await expect(finishSession(store, disk)).rejects.toThrow();
    expect([...disk.folders.values()][0]!.files.has('SESSION-COMPLETE.json')).toBe(false);
  });

  test('blocks a recording or failed checkpoint before creating any folder', async () => {
    const store = new MemoryStore('busy'); await store.open(); await story(store);
    registerSessionCheckpoint(store, async () => { throw new Error('Stop and save the take'); });
    const disk = new Disk();
    await expect(finishSession(store, disk)).rejects.toThrow('Stop and save');
    expect(disk.folders.size).toBe(0);
  });

  test('blocks standalone projects that would not travel in a story archive', async () => {
    const store = new MemoryStore('unlinked'); await store.open(); await story(store);
    const { id: _id, createdAt: _created, updatedAt: _updated, ...draft } = createShowtimeProject({ title: 'Unlinked footage' });
    await store.showtimeProjects.create(draft);
    const disk = new Disk();
    await expect(finishSession(store, disk)).rejects.toThrow('Unlinked footage');
    expect(disk.folders.size).toBe(0);
  });

  test('does not certify a project whose source asset record is missing', async () => {
    const store = new MemoryStore('missing-source'); await store.open(); const linked = await story(store);
    const { id: _id, createdAt: _created, updatedAt: _updated, ...draft } = createShowtimeProject({ title: 'Footage', storyId: linked.id });
    draft.clips = [makeShowtimeClip({ assetId: 'missing-source', name: 'Lost clip', durationSec: 3 })];
    await store.showtimeProjects.create(draft);
    const disk = new Disk();
    await expect(finishSession(store, disk)).rejects.toThrow('source');
    expect([...disk.folders.values()][0]!.files.has('SESSION-COMPLETE.json')).toBe(false);
  });

  test('single-story saves also flush editors and never reuse stale portable story props', async () => {
    const store = new MemoryStore('single'); await store.open();
    const original = await story(store);
    const stale = await store.stories.update(original.id, { portableId: 'stable-id' });
    registerSessionCheckpoint(store, async () => { await store.stories.update(original.id, { title: 'Latest words' }); });
    expect((await exportPortableStory(store, stale)).project.story.title).toBe('Latest words');
  });

  test('detects equal-length corruption beyond the first comparison chunk', async () => {
    const bytes = new Uint8Array(1024 * 1024 + 4); bytes[bytes.length - 1] = 7;
    const handle: StoryFileHandle = { createWritable: async () => ({ write: async () => {}, close: async () => {} }), getFile: async () => new Blob([new Uint8Array(bytes.length)]) };
    await expect(writeVerifiedFile(handle, new Blob([bytes]))).rejects.toThrow('did not match');
  });

  test('a failed close is a failure and aborts the write', async () => {
    let aborted = false;
    const handle: StoryFileHandle = { createWritable: async () => ({ write: async () => {}, close: async () => { throw new Error('Disconnected'); }, abort: async () => { aborted = true; } }), getFile: async () => new Blob() };
    await expect(writeVerifiedFile(handle, new Blob(['work']))).rejects.toThrow('Disconnected');
    expect(aborted).toBe(true);
  });
});

test('Finish session preserves standalone Foley work even when there is no story', async () => {
  const { makeSoundProject } = await import('@chatter/shared');
  const store = new MemoryStore(); await store.soundProjects.create(makeSoundProject('Club signal'));
  const disk = new Disk(); const result = await finishSession(store, disk); const folder = disk.folders.get(result.folderName)!;
  expect(result.files.map(file => file.file)).toEqual(['club-sounds.soundpack']);
  expect(folder.files.has('SESSION-COMPLETE.json')).toBe(true);
  const zip = await JSZip.loadAsync(await folder.files.get('club-sounds.soundpack')!.arrayBuffer());
  expect(JSON.parse(await zip.file('soundpack.json')!.async('string')).projects[0].name).toBe('Club signal');
});
