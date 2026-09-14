import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARTRIDGE_HEADER_BYTES, CARTRIDGE_MAGIC, MAX_MANIFEST_BYTES, openCartridge } from './cartridge.mjs';
import { prepareRelease, sha256 } from './core.mjs';

async function fixture(changeManifest = (value) => value) {
  const payloads = [new Blob(['<!doctype html><title>Orbit</title>']), new Blob([new Uint8Array([0, 255, 1, 2, 128])]), new Blob([])];
  const paths = ['index.html', 'assets/instrument.bin', 'assets/empty.bin'];
  const files = await Promise.all(payloads.map(async (blob, index) => ({ path: paths[index], bytes: blob.size, sha256: await sha256(await blob.arrayBuffer()), mime: index === 0 ? 'text/html; charset=utf-8' : 'application/octet-stream' })));
  const manifest = changeManifest({ format: 1, releaseId: 'mobile-pilot-1', files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) });
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const header = new Uint8Array(CARTRIDGE_HEADER_BYTES);
  header.set(new TextEncoder().encode(CARTRIDGE_MAGIC));
  new DataView(header.buffer).setUint32(8, bytes.byteLength, true);
  return { file: new File([header, bytes, ...payloads], 'Orbit.orbit'), header, bytes, manifest, payloads, trust: { releaseId: manifest.releaseId, manifestSha256: await sha256(bytes) } };
}

test('opening reads only the header and pinned manifest; files are lazy exact slices', async () => {
  const { file, trust, manifest, payloads, bytes } = await fixture();
  const slices = [];
  const source = { size: file.size, slice(start, end, type) { slices.push([start, end]); return file.slice(start, end, type); }, arrayBuffer() { throw new Error('The full cartridge must never be read.'); } };
  const cartridge = await openCartridge(source, trust);
  assert.deepEqual(slices, [[0, 12], [12, 12 + bytes.byteLength]]);
  assert.deepEqual(cartridge.manifest, manifest);
  assert.equal(cartridge.manifestSha256, trust.manifestSha256);
  let offset = 12 + bytes.byteLength;
  for (let index = 0; index < manifest.files.length; index++) {
    const entry = manifest.files[index];
    const part = cartridge.loadFile(entry.path);
    assert.equal(part.size, entry.bytes);
    assert.equal(part.type, entry.mime);
    assert.deepEqual(await part.arrayBuffer(), await payloads[index].arrayBuffer());
    assert.deepEqual(slices.at(-1), [offset, offset + entry.bytes]);
    offset += entry.bytes;
  }
  assert.throws(() => cartridge.loadFile('../private'), /not part/);
  assert.throws(() => cartridge.loadFile('INDEX.HTML'), /not part/);
});

test('wrong magic, short headers, and unsafe source sizes fail before manifest reads', async () => {
  const { file, trust } = await fixture();
  await assert.rejects(openCartridge(file.slice(0, 11), trust), /complete .orbit file/);
  await assert.rejects(openCartridge(new Blob(['NOTORBIT', file.slice(8)]), trust), /not an Orbit cartridge/);
  for (const size of [NaN, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(openCartridge({ size, slice() { throw new Error('Must not read'); } }, trust), /complete .orbit file/);
  }
  await assert.rejects(openCartridge({ size: file.size, slice() { return new Blob(['short']); } }, trust), /not an Orbit cartridge/);
});

test('manifest lengths are bounded before reading and cannot run past the selected file', async () => {
  const { file, header, trust } = await fixture();
  for (const length of [0, MAX_MANIFEST_BYTES + 1, 0xffffffff, file.size]) {
    const edited = header.slice();
    new DataView(edited.buffer).setUint32(8, length, true);
    let reads = 0;
    const source = { size: file.size, slice() { reads++; return new Blob([edited]); } };
    await assert.rejects(openCartridge(source, trust), /reference is incomplete or too large/);
    assert.equal(reads, 1);
  }
});

test('a mismatched or invalid trusted manifest never grants access to payloads', async () => {
  const { file, trust } = await fixture();
  await assert.rejects(openCartridge(file, { ...trust, manifestSha256: '0'.repeat(64) }), /does not match the trusted reader/);
  const invalid = await fixture((manifest) => ({ ...manifest, files: [{ ...manifest.files[0], path: '../outside' }, ...manifest.files.slice(1)] }));
  await assert.rejects(openCartridge(invalid.file, invalid.trust), /invalid file path/);
  const incorrectTotal = await fixture((manifest) => ({ ...manifest, totalBytes: manifest.totalBytes + 1 }));
  await assert.rejects(openCartridge(incorrectTotal.file, incorrectTotal.trust), /incomplete/);
});

test('truncated and trailing payload bytes are rejected even with a valid pinned manifest', async () => {
  const { file, trust } = await fixture();
  await assert.rejects(openCartridge(file.slice(0, file.size - 1), trust), /missing or extra data/);
  await assert.rejects(openCartridge(new Blob([file, 'extra']), trust), /missing or extra data/);
});

test('cancellation stops opening and subsequent file slices', async () => {
  const { file, trust } = await fixture();
  const controller = new AbortController();
  const cartridge = await openCartridge(file, trust, { signal: controller.signal });
  controller.abort();
  assert.throws(() => cartridge.loadFile('index.html'), { name: 'AbortError' });
  await assert.rejects(openCartridge(file, trust, { signal: controller.signal }), { name: 'AbortError' });
});

test('corrupted cartridge payloads cannot activate a release or replace a previous cache', async () => {
  const { file, trust } = await fixture();
  const corrupt = new Blob([file.slice(0, file.size - 1), new Uint8Array([129])]);
  const cartridge = await openCartridge(corrupt, trust);
  const entries = new Map([['previous-complete-cache', new Map()]]);
  const cacheStorage = {
    async open(name) { const cache = new Map(); entries.set(name, cache); return { async put(url, response) { cache.set(url, response); }, async match(url) { return cache.get(url)?.clone(); } }; },
    async delete(name) { entries.delete(name); },
  };
  let published = false;
  await assert.rejects(prepareRelease({ ...cartridge, origin: 'https://example.com/orbit-mobile/', cacheStorage, publish: async () => { published = true; } }), /did not pass its check/);
  assert.equal(published, false);
  assert.deepEqual([...entries.keys()], ['previous-complete-cache']);
});
