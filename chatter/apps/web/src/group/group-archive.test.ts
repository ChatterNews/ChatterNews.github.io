import { describe, expect, test } from 'vitest';
import JSZip from 'jszip';
import { createStoryCode, type GroupRevision } from '@chatter/shared';
import { decodeGroupArchive, encodeGroupArchive, GROUP_ARCHIVE_LIMITS, loadBoundedZip, readBoundedZipEntry, type GroupArchiveEntry } from './group-archive.js';

async function entry(id = 'revision-one'): Promise<GroupArchiveEntry> {
  const snapshot = new TextEncoder().encode('opaque complete .chatter bytes');
  const hash = 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', snapshot))].map(b => b.toString(16).padStart(2, '0')).join('');
  const record: GroupRevision = { id, createdAt: 1, updatedAt: 1, groupCode: createStoryCode(), contributionId: 'piece-one', kind: 'piece', authorId: 'public-badge-id', authorName: 'Maya', title: 'Interview', storyTitle: 'Lunch line', snapshotHash: hash, contentHash: hash, body: { type: 'doc', content: [] } };
  return { record, snapshot };
}
async function rewrite(blob: Blob, change: (zip: JSZip, manifest: any) => void): Promise<Blob> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('group.chatter.json')!.async('string'));
  change(zip, manifest);
  zip.file('group.chatter.json', JSON.stringify(manifest));
  return new Blob([await zip.generateAsync({ type: 'uint8array' }) as BlobPart]);
}

describe('group collection archive', () => {
  test('round trips complete opaque snapshots and public revision metadata', async () => {
    const first = await entry(); const second = await entry('revision-two');
    expect(await decodeGroupArchive(await encodeGroupArchive([first, second]))).toEqual([first, second]);
  });
  test('checks snapshot bytes both while encoding and decoding', async () => {
    const first = await entry();
    await expect(encodeGroupArchive([{ ...first, snapshot: new Uint8Array([3]) }])).rejects.toThrow(/hash|match/i);
    const blob = await rewrite(await encodeGroupArchive([first]), (zip, manifest) => zip.file(manifest.entries[0].file, 'corrupt bytes'));
    await expect(decodeGroupArchive(blob)).rejects.toThrow(/hash|match/i);
  });
  test('rejects missing snapshot payloads before returning entries', async () => {
    const blob = await rewrite(await encodeGroupArchive([await entry(), await entry('two')]), (zip, manifest) => zip.remove(manifest.entries[1].file));
    await expect(decodeGroupArchive(blob)).rejects.toThrow(/missing/i);
  });
  test.each(['../escape.chatter', '/absolute.chatter', 'snapshots/../escape.chatter', 'snapshots\\escape.chatter'])('rejects unsafe raw ZIP path %s', async (path) => {
    const blob = await rewrite(await encodeGroupArchive([await entry()]), zip => zip.file(path, 'untrusted'));
    await expect(decodeGroupArchive(blob)).rejects.toThrow(/path|unexpected/i);
  });
  test('rejects conflicting metadata under a repeated revision ID', async () => {
    const first = await entry();
    await expect(encodeGroupArchive([first, { ...first, record: { ...first.record, title: 'Different' } }])).rejects.toThrow(/revision|conflict/i);
    const blob = await rewrite(await encodeGroupArchive([first]), (_zip, manifest) => manifest.entries.push({ ...manifest.entries[0], record: { ...first.record, title: 'Different' } }));
    await expect(decodeGroupArchive(blob)).rejects.toThrow(/revision|conflict/i);
  });
  test('collapses byte-identical repeat revisions', async () => {
    const first = await entry();
    expect(await decodeGroupArchive(await encodeGroupArchive([first, first]))).toEqual([first]);
  });
  test.each(['format', 'record', 'file', 'count'])('rejects malformed %s', async (kind) => {
    const blob = await rewrite(await encodeGroupArchive([await entry()]), (_zip, manifest) => {
      if (kind === 'format') manifest.version = 42;
      if (kind === 'record') manifest.entries[0].record.authorName = '';
      if (kind === 'file') manifest.entries[0].file = '../escape';
      if (kind === 'count') manifest.entries = Array(GROUP_ARCHIVE_LIMITS.revisions + 1).fill(manifest.entries[0]);
    });
    await expect(decodeGroupArchive(blob)).rejects.toThrow();
  });
  test('rejects oversized inputs before reading bytes', async () => {
    const blob = { size: GROUP_ARCHIVE_LIMITS.archiveBytes + 1, arrayBuffer: () => { throw new Error('should not read'); } } as unknown as Blob;
    await expect(decodeGroupArchive(blob)).rejects.toThrow(/large|limit/i);
  });
  test('checks expanded size from the ZIP directory before decompressing', async () => {
    const data = new Uint8Array(await (await encodeGroupArchive([await entry()])).arrayBuffer());
    const view = new DataView(data.buffer);
    for (let i = 0; i < data.length - 4; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, GROUP_ARCHIVE_LIMITS.expandedBytes + 1, true); break; }
    await expect(decodeGroupArchive(new Blob([data]))).rejects.toThrow(/large|limit|expand/i);
  });
  test('also enforces an actual streaming decompression limit', async () => {
    const original = new JSZip(); original.file('large.txt', 'x'.repeat(100_000));
    const zip = await JSZip.loadAsync(await original.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
    await expect(readBoundedZipEntry(zip.file('large.txt')!, 32)).rejects.toThrow(/expand|limit/i);
  });
  test('allows callers to retain legacy size bounds without weakening group decoding', async () => {
    const data = new Uint8Array(await (await encodeGroupArchive([await entry()])).arrayBuffer());
    const view = new DataView(data.buffer);
    for (let i = 0; i < data.length - 4; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 300 * 1024 * 1024, true); break; }
    await expect(loadBoundedZip(data, { entryBytes: 2_000_000_000, expandedBytes: 2_000_000_000 })).resolves.toBeInstanceOf(JSZip);
    await expect(decodeGroupArchive(new Blob([data]))).rejects.toThrow(/expand|limit/i);
  });
});
