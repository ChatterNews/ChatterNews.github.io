import { describe, expect, test } from 'vitest';
import { desktopDirectory, desktopStoryFileName, type DesktopDriveBridge } from './desktop-drive.js';
import { writeVerifiedFile } from './finish-session.js';

function nativeDisk() {
  const files = new Map<string, Uint8Array>();
  const pending = new Map<string, { path: string; chunks: Uint8Array[] }>();
  const folders: string[] = [];
  const calls: { chunks: number[]; reads: number[]; aborted: number; commits: number } = { chunks: [], reads: [], aborted: 0, commits: 0 };
  let failChunk = false; let corrupt = false; let count = 0;
  const bridge: DesktopDriveBridge = {
    getInfo: async () => ({ saveFolderLabel: 'Chatter News', version: 'test' }),
    createDirectory: async (segments) => { folders.push(segments.join('/')); },
    beginWrite: async (segments) => { const token = String(++count); pending.set(token, { path: segments.join('/'), chunks: [] }); return token; },
    appendWrite: async (token, bytes) => {
      if (failChunk) throw new Error('Drive disconnected');
      calls.chunks.push(bytes.byteLength); pending.get(token)!.chunks.push(bytes.slice());
    },
    commitWrite: async (token) => {
      const entry = pending.get(token)!;
      if (files.has(entry.path)) throw new Error('File already exists');
      const bytes = new Uint8Array(entry.chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      let offset = 0; for (const chunk of entry.chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (corrupt && bytes.length) bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
      files.set(entry.path, bytes); pending.delete(token); calls.commits++;
    },
    abortWrite: async (token) => { if (pending.delete(token)) calls.aborted++; },
    statFile: async (segments) => ({ size: files.get(segments.join('/'))!.byteLength }),
    readFile: async (segments, start, end) => { calls.reads.push(end - start); return files.get(segments.join('/'))!.slice(start, end); },
  };
  return { bridge, files, folders, pending, calls, disconnect: () => { failChunk = true; }, corrupt: () => { corrupt = true; } };
}

describe('desktop Story Drive adapter', () => {
  test('writes and verifies a multi-chunk archive in its session directory', async () => {
    const disk = nativeDisk();
    const directory = await desktopDirectory(disk.bridge).getDirectoryHandle('session-one', { create: true });
    const data = new Uint8Array(2 * 1024 * 1024 + 17).fill(42);
    const file = await directory.getFileHandle('one.chatter', { create: true });
    await writeVerifiedFile(file, new Blob([data]));
    const saved = disk.files.get('session-one/one.chatter')!;
    expect(saved.byteLength).toBe(data.byteLength);
    expect(saved.every((byte, index) => byte === data[index])).toBe(true);
    expect(disk.folders).toEqual(['session-one']);
    expect(disk.calls.chunks).toEqual([1024 * 1024, 1024 * 1024, 17]);
    expect(disk.calls.reads).toEqual([1024 * 1024, 1024 * 1024, 17]);
    expect(disk.calls.commits).toBe(1);
  });

  test('aborts an interrupted save without committing a file', async () => {
    const disk = nativeDisk(); disk.disconnect();
    const file = await desktopDirectory(disk.bridge).getFileHandle('draft.chatter', { create: true });
    await expect(writeVerifiedFile(file, new Blob(['draft']))).rejects.toThrow('Drive disconnected');
    expect(disk.calls.commits).toBe(0); expect(disk.calls.aborted).toBe(1);
    expect(disk.pending.size).toBe(0); expect(disk.files.size).toBe(0);
  });

  test('detects same-length corruption beyond the first chunk', async () => {
    const disk = nativeDisk(); disk.corrupt();
    const file = await desktopDirectory(disk.bridge).getFileHandle('bad.chatter', { create: true });
    await expect(writeVerifiedFile(file, new Blob([new Uint8Array(1024 * 1024 + 5)]))).rejects.toThrow('did not match');
  });

  test('preserves an existing handoff when a filename collides', async () => {
    const disk = nativeDisk(); disk.files.set('old.chatter', new Uint8Array([7, 8]));
    const file = await desktopDirectory(disk.bridge).getFileHandle('old.chatter', { create: true });
    await expect(writeVerifiedFile(file, new Blob(['new']))).rejects.toThrow('already exists');
    expect(disk.files.get('old.chatter')).toEqual(new Uint8Array([7, 8]));
    expect(disk.pending.size).toBe(0);
  });

  test('creates Windows-safe unique handoff names', () => {
    const first = desktopStoryFileName('CON: my/next "story".');
    expect(first).toMatch(/^Story-CON- my-next -story-.*\.chatter$/);
    expect(first).not.toMatch(/[<>:"/\\|?*\x00-\x1f]/);
    expect(desktopStoryFileName('story')).not.toBe(desktopStoryFileName('story'));
  });
});
