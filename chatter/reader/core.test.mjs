import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_HEADERS, MAX_FILE_BYTES, cacheIsComplete, prepareRelease, rangedResponse, resourceURL, sha256, validateManifest, validatePath, validateTrust, verifyManifest } from './core.mjs';

const BASE = 'https://example.github.io/orbit-reader/';

class MemoryCache {
  entries = new Map();
  async match(url) { return this.entries.get(String(url))?.clone(); }
  async put(url, response) { this.entries.set(String(url), response.clone()); }
}

class MemoryCaches {
  entries = new Map();
  async open(name) { if (!this.entries.has(name)) this.entries.set(name, new MemoryCache()); return this.entries.get(name); }
  async delete(name) { return this.entries.delete(name); }
  async has(name) { return this.entries.has(name); }
}

async function fixture() {
  const source = new Map([
    ['index.html', new Blob(['<!doctype html><title>Orbit</title>'], { type: 'text/html' })],
    ['assets/audio.js', new Blob(['export const ready = true;'], { type: 'text/javascript' })],
    ['models/settings.json', new Blob(['{}'], { type: 'application/json' })],
  ]);
  const files = [];
  for (const [path, blob] of source) files.push({ path, bytes: blob.size, sha256: await sha256(await blob.arrayBuffer()), mime: blob.type });
  const manifest = { format: 1, releaseId: 'pilot-2026-09-12', files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) };
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const trust = { releaseId: manifest.releaseId, manifestSha256: await sha256(bytes) };
  return { manifest, source, bytes, trust };
}

test('only the exact host-pinned release reference is accepted', async () => {
  const { manifest, bytes, trust } = await fixture();
  assert.deepEqual(await verifyManifest(bytes, trust), manifest);
  const edited = new TextEncoder().encode(JSON.stringify({ ...manifest, totalBytes: manifest.totalBytes + 1 }));
  await assert.rejects(verifyManifest(edited, trust), /does not match the trusted reader/);
  await assert.rejects(verifyManifest(bytes, { ...trust, releaseId: 'another-release' }), /does not match this Orbit reader/);
  assert.throws(() => validateTrust({ releaseId: manifest.releaseId, manifestSha256: 'missing' }), /release reference/);
});

test('manifest paths reject traversal and ambiguous encoded paths', () => {
  for (const input of ['../secret', '/outside', 'a/../b', './index.html', 'a//b', 'a\\b', 'a/%2e%2e/b', 'a%2Fb', 'a?b', 'a#b', 'a\0b', '']) assert.throws(() => validatePath(input), /invalid file path/);
  assert.equal(validatePath('models/onnx-community/nsfw/model_q4.onnx'), 'models/onnx-community/nsfw/model_q4.onnx');
});

test('manifest size, duplicate, and entry checks fail before copying files', async () => {
  const { manifest } = await fixture();
  assert.throws(() => validateManifest({ ...manifest, files: [...manifest.files, { ...manifest.files[0], path: 'INDEX.HTML' }] }, manifest.releaseId), /more than once/);
  assert.throws(() => validateManifest({ ...manifest, totalBytes: 1 }, manifest.releaseId), /incomplete/);
  assert.throws(() => validateManifest({ ...manifest, files: [{ ...manifest.files[0], bytes: MAX_FILE_BYTES + 1 }] }, manifest.releaseId), /unsupported file size/);
  assert.throws(() => validateManifest({ ...manifest, files: [{ ...manifest.files[0], mime: 'text/html\r\nX-Header: evil' }] }, manifest.releaseId), /invalid file type/);
});

test('resource URLs retain both the hosted subpath and immutable release', () => {
  assert.equal(resourceURL(BASE, 'pilot-1', 'assets/audio.js'), 'https://example.github.io/orbit-reader/r/pilot-1/assets/audio.js');
  assert.equal(resourceURL(BASE, 'pilot-2', 'my kit/pad.wav'), 'https://example.github.io/orbit-reader/r/pilot-2/my%20kit/pad.wav');
  assert.throws(() => resourceURL(BASE, '../reader', 'index.html'), /invalid name/);
});

test('a complete verified release is published only after every file is cached', async () => {
  const { manifest, source, trust } = await fixture();
  const cacheStorage = new MemoryCaches();
  let published;
  const record = await prepareRelease({ manifest, manifestSha256: trust.manifestSha256, origin: BASE, cacheStorage, loadFile: async (name) => source.get(name), publish: async (value) => { assert.equal(await cacheIsComplete(await cacheStorage.open(value.cacheName), manifest, BASE), true); published = value; } });
  assert.equal(record, published);
  const cache = await cacheStorage.open(record.cacheName);
  const document = await cache.match(resourceURL(BASE, manifest.releaseId, 'index.html'));
  assert.equal(await document.text(), await source.get('index.html').text());
  for (const [name, value] of Object.entries(APP_HEADERS)) assert.equal(document.headers.get(name), value);
  assert.equal(await cacheIsComplete(cache, manifest, BASE), true);
});

test('a nested release caches its app under its own reader without changing the parent cache', async () => {
  const { manifest, source, trust } = await fixture();
  const cacheStorage = new MemoryCaches();
  const old = await cacheStorage.open('previous-reader-cache');
  await old.put(resourceURL(BASE, 'previous-release', 'index.html'), new Response('old app'));
  const nestedBase = new URL('releases/monday-2026-09-14/', BASE);
  const record = await prepareRelease({ manifest, manifestSha256: trust.manifestSha256, origin: nestedBase, cacheStorage, loadFile: async (name) => source.get(name), publish: async () => {} });
  const cache = await cacheStorage.open(record.cacheName);
  assert.equal(await cacheIsComplete(cache, manifest, nestedBase), true);
  assert.equal(await cacheIsComplete(cache, manifest, BASE), false);
  assert.equal(await (await old.match(resourceURL(BASE, 'previous-release', 'index.html'))).text(), 'old app');
});

test('corrupt USB bytes cannot activate a partial release or remove the previous copy', async () => {
  const { manifest, source, trust } = await fixture();
  const cacheStorage = new MemoryCaches();
  const old = await cacheStorage.open('prior-complete-cache');
  await old.put('prior-file', new Response('earlier release'));
  let published = false;
  await assert.rejects(prepareRelease({ manifest, manifestSha256: trust.manifestSha256, origin: BASE, cacheStorage, loadFile: async (name) => name === 'assets/audio.js' ? new Blob(['x'.repeat(source.get(name).size)]) : source.get(name), publish: async () => { published = true; } }), /did not pass its check/);
  assert.equal(published, false);
  assert.deepEqual([...cacheStorage.entries.keys()], ['prior-complete-cache']);
  assert.equal(await (await old.match('prior-file')).text(), 'earlier release');
});

test('storage failure removes only its staging cache and does not publish', async () => {
  const { manifest, source, trust } = await fixture();
  const cacheStorage = new MemoryCaches();
  await cacheStorage.open('prior-complete-cache');
  const open = cacheStorage.open.bind(cacheStorage);
  cacheStorage.open = async (name) => { const cache = await open(name); cache.put = async () => { throw new DOMException('Full', 'QuotaExceededError'); }; return cache; };
  let published = false;
  await assert.rejects(prepareRelease({ manifest, manifestSha256: trust.manifestSha256, origin: BASE, cacheStorage, loadFile: async (name) => source.get(name), publish: async () => { published = true; } }), { name: 'QuotaExceededError' });
  assert.equal(published, false);
  assert.deepEqual([...cacheStorage.entries.keys()], ['prior-complete-cache']);
});

test('cancelled preparation leaves no activation or staging cache', async () => {
  const { manifest, source, trust } = await fixture();
  const cacheStorage = new MemoryCaches();
  const controller = new AbortController();
  let published = false;
  await assert.rejects(prepareRelease({ manifest, manifestSha256: trust.manifestSha256, origin: BASE, cacheStorage, signal: controller.signal, loadFile: async (name) => { controller.abort(); return source.get(name); }, publish: async () => { published = true; } }), { name: 'AbortError' });
  assert.equal(published, false);
  assert.equal(cacheStorage.entries.size, 0);
});

test('launch completeness detects missing entries and truncated cached bodies', async () => {
  const { manifest, source, trust } = await fixture();
  const cacheStorage = new MemoryCaches();
  const record = await prepareRelease({ manifest, manifestSha256: trust.manifestSha256, origin: BASE, cacheStorage, loadFile: async (name) => source.get(name), publish: async () => {} });
  const cache = await cacheStorage.open(record.cacheName);
  const url = resourceURL(BASE, manifest.releaseId, 'assets/audio.js');
  const saved = await cache.match(url);
  cache.entries.delete(url);
  assert.equal(await cacheIsComplete(cache, manifest, BASE), false);
  await cache.put(url, new Response('short', { headers: saved.headers }));
  assert.equal(await cacheIsComplete(cache, manifest, BASE), false);
});

test('document preflight detects a missing startup script without reading model bodies', async () => {
  const { manifest, source, trust } = await fixture();
  const cacheStorage = new MemoryCaches();
  const record = await prepareRelease({ manifest, manifestSha256: trust.manifestSha256, origin: BASE, cacheStorage, loadFile: async (name) => source.get(name), publish: async () => {} });
  const cache = await cacheStorage.open(record.cacheName);
  const match = cache.match.bind(cache);
  cache.match = async (url) => {
    const response = await match(url);
    if (response) response.blob = async () => { throw new Error('Document preflight must not read large model bodies.'); };
    return response;
  };
  const preflight = () => cacheIsComplete(cache, manifest, BASE, undefined, undefined, { metadataOnly: true });
  assert.equal(await preflight(), true);
  cache.entries.delete(resourceURL(BASE, manifest.releaseId, 'assets/audio.js'));
  assert.equal(await preflight(), false);
  assert.ok(await cache.match(resourceURL(BASE, manifest.releaseId, 'index.html')), 'index remains present in the eviction scenario');
});

test('cached ranges support media seeking, suffix requests and HEAD', async () => {
  const make = () => new Response('0123456789', { headers: { 'Content-Type': 'video/webm', 'Content-Length': '10' } });
  const slice = await rangedResponse(make(), 'bytes=3-5');
  assert.equal(slice.status, 206);
  assert.equal(slice.headers.get('Content-Range'), 'bytes 3-5/10');
  assert.equal(await slice.text(), '345');
  assert.equal(await (await rangedResponse(make(), 'bytes=-2')).text(), '89');
  assert.equal(await (await rangedResponse(make(), 'bytes=8-99')).text(), '89');
  const head = await rangedResponse(make(), 'bytes=1-2', 'HEAD');
  assert.equal(head.headers.get('Content-Length'), '2');
  assert.equal(await head.text(), '');
  for (const value of ['bytes=-', 'bytes=10-', 'bytes=3-2', 'bytes=0-1,3-4']) assert.equal((await rangedResponse(make(), value)).status, 416);
});
