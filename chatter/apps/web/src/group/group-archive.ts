import JSZip from 'jszip';
import { validateGroupRevision, type GroupRevision } from '@chatter/shared';

export interface GroupArchiveEntry { record: GroupRevision; snapshot: Uint8Array }
export const GROUP_ARCHIVE_LIMITS = Object.freeze({ revisions: 256, archiveBytes: 512 * 1024 * 1024, expandedBytes: 512 * 1024 * 1024, entryBytes: 256 * 1024 * 1024, manifestBytes: 8 * 1024 * 1024, zipEntries: 10_000 });
const MANIFEST = 'group.chatter.json';
export interface BoundedZipLimits { archiveBytes: number; expandedBytes: number; entryBytes: number; zipEntries: number }

function safePath(name: string): boolean {
  return !!name && !/[\\\u0000-\u001f\u007f:]/.test(name) && !name.startsWith('/') && name.replace(/\/$/, '').split('/').every(part => !!part && part !== '.' && part !== '..');
}

/** Check raw directory names before JSZip's path sanitization and sizes before inflation. */
export async function loadBoundedZip(blob: Blob | Uint8Array, options: Partial<BoundedZipLimits> = {}): Promise<JSZip> {
  const limits = { ...GROUP_ARCHIVE_LIMITS, ...options };
  const size = blob instanceof Uint8Array ? blob.byteLength : blob.size;
  if (size > limits.archiveBytes) throw new Error('This archive is too large to open safely.');
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error('This archive has a damaged ZIP directory.');
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 65535 || directorySize === 0xffffffff || offset === 0xffffffff) throw new Error('Split and ZIP64 archives are not supported.');
  if (count > limits.zipEntries || offset + directorySize !== end) throw new Error('This archive exceeds the directory limit or is damaged.');
  const names = new Set<string>(); let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error('This archive has a damaged ZIP entry.');
    const flags = view.getUint16(offset + 8, true); const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true); const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true); const extraLength = view.getUint16(offset + 30, true); const commentLength = view.getUint16(offset + 32, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(method) || view.getUint16(offset + 34, true)) throw new Error('This archive contains an unsupported ZIP entry.');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!safePath(name) || names.has(name)) throw new Error('This archive contains an unsafe or duplicate file path.');
    names.add(name); expanded += uncompressed;
    if (compressed > limits.archiveBytes || uncompressed > limits.entryBytes || expanded > limits.expandedBytes) throw new Error('This archive expands beyond the safe size limit.');
    // Reject ZIP64 and alternate Unicode paths; neither is emitted by Orbit.
    for (let extra = offset + 46 + nameLength; extra < offset + 46 + nameLength + extraLength;) {
      const stop = offset + 46 + nameLength + extraLength;
      if (extra + 4 > stop) throw new Error('Damaged ZIP metadata.');
      const tag = view.getUint16(extra, true); const length = view.getUint16(extra + 2, true);
      if (tag === 1 || tag === 0x7075 || extra + 4 + length > stop) throw new Error('Unsupported ZIP path metadata.');
      extra += 4 + length;
    }
    offset = next;
  }
  if (offset !== end) throw new Error('This archive has a damaged ZIP directory.');
  const zip = await JSZip.loadAsync(bytes, { createFolders: false });
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!safePath(name) || (entry.unsafeOriginalName && entry.unsafeOriginalName !== name)) throw new Error('This archive contains an unsafe file path.');
  }
  return zip;
}

/** Bound actual output too: forged ZIP size claims must not allocate unbounded buffers. */
export function readBoundedZipEntry(entry: JSZip.JSZipObject, maxBytes = GROUP_ARCHIVE_LIMITS.entryBytes): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []; let length = 0; let stopped = false;
    // JSZip 3 exposes this browser API but omits it from JSZipObject's typings.
    type Stream = { on(event: 'data', callback: (chunk: Uint8Array) => void): void; on(event: 'error', callback: (error: unknown) => void): void; on(event: 'end', callback: () => void): void; pause(): void; resume(): void };
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: 'uint8array'): Stream }).internalStream('uint8array');
    stream.on('data', (chunk: Uint8Array) => {
      if (stopped) return;
      length += chunk.length;
      if (length > maxBytes) { stopped = true; stream.pause(); reject(new Error('An archive file expands beyond its safe size limit.')); return; }
      chunks.push(chunk);
    });
    stream.on('error', error => { if (!stopped) { stopped = true; reject(error); } });
    stream.on('end', () => {
      if (stopped) return;
      const result = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      resolve(result);
    });
    stream.resume();
  });
}

async function snapshotHash(bytes: Uint8Array): Promise<string> {
  return `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function uniqueRevision(records: Map<string, string>, record: GroupRevision): boolean {
  const encoded = canonical(record); const existing = records.get(record.id);
  if (existing !== undefined && existing !== encoded) throw new Error('Conflicting data uses the same group revision ID.');
  records.set(record.id, encoded); return existing === undefined;
}

export async function encodeGroupArchive(entries: GroupArchiveEntry[]): Promise<Blob> {
  if (!Array.isArray(entries) || !entries.length || entries.length > GROUP_ARCHIVE_LIMITS.revisions) throw new Error('The group collection is empty or exceeds the revision limit.');
  const zip = new JSZip(); const records = new Map<string, string>();
  const manifest: { format: string; version: number; entries: { record: GroupRevision; file: string }[] } = { format: 'orbit-group', version: 1, entries: [] };
  let total = 0;
  for (const { record, snapshot } of entries) {
    validateGroupRevision(record);
    if (!(snapshot instanceof Uint8Array) || !snapshot.length) throw new Error('The group revision is missing its snapshot bytes.');
    total += snapshot.byteLength;
    if (snapshot.byteLength > GROUP_ARCHIVE_LIMITS.entryBytes || total > GROUP_ARCHIVE_LIMITS.expandedBytes) throw new Error('The group collection exceeds the safe size limit.');
    if (await snapshotHash(snapshot) !== record.snapshotHash) throw new Error('The group snapshot hash does not match its bytes.');
    if (!uniqueRevision(records, record)) continue;
    const file = `snapshots/${manifest.entries.length}.chatter`;
    manifest.entries.push({ record, file }); zip.file(file, snapshot, { createFolders: false });
  }
  const json = JSON.stringify(manifest); const manifestSize = new TextEncoder().encode(json).length;
  if (manifestSize > GROUP_ARCHIVE_LIMITS.manifestBytes || total + manifestSize > GROUP_ARCHIVE_LIMITS.expandedBytes) throw new Error('The group manifest exceeds the safe size limit.');
  zip.file(MANIFEST, json);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  if (bytes.byteLength > GROUP_ARCHIVE_LIMITS.archiveBytes) throw new Error('The group archive exceeds the safe size limit.');
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}

export async function decodeGroupArchive(blob: Blob): Promise<GroupArchiveEntry[]> {
  const zip = await loadBoundedZip(blob); const file = zip.file(MANIFEST);
  if (!file) throw new Error('The group collection manifest is missing.');
  const manifest = JSON.parse(new TextDecoder().decode(await readBoundedZipEntry(file, GROUP_ARCHIVE_LIMITS.manifestBytes))) as { format?: unknown; version?: unknown; entries?: unknown };
  if (!manifest || Object.keys(manifest).some(key => !['format', 'version', 'entries'].includes(key)) || manifest.format !== 'orbit-group' || manifest.version !== 1 || !Array.isArray(manifest.entries) || !manifest.entries.length || manifest.entries.length > GROUP_ARCHIVE_LIMITS.revisions) throw new Error('This group collection is damaged or uses an unsupported format or revision limit.');
  const result: GroupArchiveEntry[] = []; const records = new Map<string, string>(); const referenced = new Set([MANIFEST]); let total = 0;
  for (const item of manifest.entries) {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['record', 'file'].includes(key)) || typeof item.file !== 'string' || !/^snapshots\/[0-9]+\.chatter$/.test(item.file)) throw new Error('The group collection has an invalid snapshot path.');
    validateGroupRevision(item.record);
    const snapshotFile = zip.file(item.file); if (!snapshotFile) throw new Error('A group revision is missing its snapshot bytes.');
    referenced.add(item.file);
    const snapshot = await readBoundedZipEntry(snapshotFile); total += snapshot.length;
    if (!snapshot.length || total > GROUP_ARCHIVE_LIMITS.expandedBytes) throw new Error('A group snapshot is empty or exceeds the size limit.');
    if (await snapshotHash(snapshot) !== item.record.snapshotHash) throw new Error('A group snapshot hash does not match its bytes.');
    if (uniqueRevision(records, item.record)) result.push({ record: item.record, snapshot });
  }
  for (const entry of Object.values(zip.files)) if (!referenced.has(entry.name) && !(entry.dir && entry.name === 'snapshots/')) throw new Error('The group collection contains an unexpected file path.');
  return result;
}
