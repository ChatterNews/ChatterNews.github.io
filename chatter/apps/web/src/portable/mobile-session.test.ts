import { afterEach, describe, expect, test, vi } from 'vitest';
import JSZip from 'jszip';
import { MemoryStore } from '@chatter/shared';
import { offerMobileFile, prepareMobileSession, sessionDownloadDirectory } from './mobile-session.js';
import { writeVerifiedFile } from './finish-session.js';
import { registerSessionCheckpoint } from '../store/session-checkpoint.js';

afterEach(() => vi.unstubAllGlobals());

describe('mobile session handoff', () => {
  test('packs fresh story snapshots and a receipt into one downloadable ZIP', async () => {
    const store = new MemoryStore('mobile'); await store.open();
    const first = await store.stories.create({ title: 'Before the edit' });
    await store.stories.create({ title: 'Second story' });
    const unregister = registerSessionCheckpoint(store, async () => { await store.stories.update(first.id, { title: 'Final words' }); });
    try {
      const prepared = await prepareMobileSession(store);
      expect(prepared.stories).toBe(2);
      const zip = await JSZip.loadAsync(await prepared.file.arrayBuffer(), { checkCRC32: true });
      const receipt = Object.values(zip.files).find(file => file.name.endsWith('SESSION-COMPLETE.json'))!;
      const summary = JSON.parse(await receipt.async('string'));
      expect(summary.files.map((file: { title: string }) => file.title)).toEqual(['Final words', 'Second story']);
      for (const file of summary.files) {
        const folder = receipt.name.slice(0, receipt.name.lastIndexOf('/') + 1);
        const bytes = await zip.file(folder + file.file)!.async('uint8array');
        expect(bytes.byteLength).toBe(file.bytes);
        await JSZip.loadAsync(bytes, { checkCRC32: true });
      }
    } finally { unregister(); }
  });

  test('will not prepare a completed session while a recording blocks its checkpoint', async () => {
    const store = new MemoryStore('recording'); await store.open(); await store.stories.create({ title: 'A take' });
    const unregister = registerSessionCheckpoint(store, async () => { throw new Error('Stop the recording first'); });
    try { await expect(prepareMobileSession(store)).rejects.toThrow('Stop the recording'); } finally { unregister(); }
  });

  test('bounds the prepared download and rejects traversal without publishing failed bytes', async () => {
    const draft = sessionDownloadDirectory(3);
    await expect(draft.directory.getFileHandle('../outside', { create: true })).rejects.toThrow('invalid file name');
    const handle = await draft.directory.getFileHandle('large.chatter', { create: true });
    await expect(writeVerifiedFile(handle, new Blob(['four']))).rejects.toThrow('too large');
    expect(draft.entries.size).toBe(0);
  });

  test('keeps share cancellation distinct from a successful handoff', async () => {
    const cancelled = new DOMException('Cancelled', 'AbortError');
    const share = vi.fn().mockRejectedValue(cancelled);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const file = new File(['story'], 'story.chatter', { type: 'application/zip' });
    await expect(offerMobileFile(file)).rejects.toBe(cancelled);
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'story.chatter' });
  });
});
