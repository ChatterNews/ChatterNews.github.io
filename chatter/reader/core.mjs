export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_RELEASE_BYTES = 2 * 1024 * 1024 * 1024;
export const RELEASE_DB = 'orbit-reader-releases';
export const WORKSPACE_DB = 'orbit-reader';
export const APP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'microphone=(self), camera=(self)',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'",
};

export function validateReleaseId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(value)) throw new Error('This Orbit release has an invalid name. Ask your advisor for a fresh package.');
  return value;
}

export function validatePath(value) {
  if (typeof value !== 'string' || !value || value.length > 768 || /[\\%?#\x00-\x1f]/.test(value)) throw new Error('The Orbit package contains an invalid file path.');
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.length > 255)) throw new Error('The Orbit package contains an invalid file path.');
  return value;
}

export function validateTrust(value) {
  validateReleaseId(value?.releaseId);
  if (typeof value.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.manifestSha256)) throw new Error('The Orbit reader is missing its release reference. Ask your advisor to check the reader link.');
  return { releaseId: value.releaseId, manifestSha256: value.manifestSha256 };
}

export function validateManifest(value, expectedReleaseId) {
  if (!value || value.format !== 1 || value.releaseId !== validateReleaseId(expectedReleaseId) || !Array.isArray(value.files) || !value.files.length || value.files.length > 10000) throw new Error('This package does not match this Orbit reader. Use the reader link supplied with the package.');
  const seen = new Set();
  let total = 0;
  for (const file of value.files) {
    validatePath(file?.path);
    if (seen.has(file.path.toLowerCase())) throw new Error('The Orbit package lists a file more than once.');
    seen.add(file.path.toLowerCase());
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_FILE_BYTES) throw new Error('The Orbit package contains an unsupported file size.');
    if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('The Orbit package is missing a file check.');
    if (typeof file.mime !== 'string' || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;\s*charset=utf-8)?$/i.test(file.mime)) throw new Error('The Orbit package contains an invalid file type.');
    total += file.bytes;
    if (total > MAX_RELEASE_BYTES) throw new Error('This Orbit package is too large for the pilot reader.');
  }
  if (!Number.isSafeInteger(value.totalBytes) || total !== value.totalBytes || !value.files.some((file) => file.path === 'index.html' && file.bytes > 0)) throw new Error('The Orbit package is incomplete. Ask your advisor for a fresh copy.');
  return { format: 1, releaseId: value.releaseId, files: value.files.map(({ path, bytes, sha256, mime }) => ({ path, bytes, sha256, mime })), totalBytes: total };
}

export async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyManifest(bytes, trust) {
  validateTrust(trust);
  if (bytes.byteLength > 4 * 1024 * 1024 || await sha256(bytes) !== trust.manifestSha256) throw new Error('This Orbit package does not match the trusted reader. Use the link and package supplied together.');
  let manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('The Orbit package reference could not be read.'); }
  return validateManifest(manifest, trust.releaseId);
}

export function resourceURL(baseURL, releaseId, filePath) {
  validateReleaseId(releaseId);
  validatePath(filePath);
  return new URL(`r/${releaseId}/${filePath.split('/').map(encodeURIComponent).join('/')}`, baseURL).href;
}

function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Preparation cancelled. Your saved stories are unchanged.', 'AbortError');
}

export async function cacheIsComplete(cache, manifest, origin, onProgress = () => {}, signal, { metadataOnly = false } = {}) {
  let checked = 0;
  for (const file of manifest.files) {
    checkCancelled(signal);
    const response = await cache.match(resourceURL(origin, manifest.releaseId, file.path));
    if (!response || response.status !== 200 || response.headers.get('X-Orbit-SHA256') !== file.sha256 || response.headers.get('Content-Length') !== String(file.bytes)) return false;
    if (!metadataOnly && (await response.blob()).size !== file.bytes) return false;
    checked += file.bytes;
    onProgress({ phase: 'checking', path: file.path, bytes: checked, totalBytes: manifest.totalBytes });
  }
  return true;
}

/** A failed staging cache never replaces or deletes a previous activation. */
export async function prepareRelease({ manifest, manifestSha256, origin, loadFile, cacheStorage = caches, publish, onProgress = () => {}, signal }) {
  validateManifest(manifest, manifest.releaseId);
  const cacheName = `orbit-release-${manifest.releaseId}-${crypto.randomUUID()}`;
  const cache = await cacheStorage.open(cacheName);
  let copied = 0;
  try {
    for (const file of manifest.files) {
      checkCancelled(signal);
      onProgress({ phase: 'copying', path: file.path, bytes: copied, totalBytes: manifest.totalBytes });
      const source = await loadFile(file.path);
      if (source.size !== file.bytes) throw new Error(`The drive copy of ${file.path} is incomplete. Copy the package again and retry.`);
      const bytes = await source.arrayBuffer();
      if (bytes.byteLength !== file.bytes || await sha256(bytes) !== file.sha256) throw new Error(`The drive copy of ${file.path} did not pass its check. Copy the package again and retry.`);
      checkCancelled(signal);
      await cache.put(resourceURL(origin, manifest.releaseId, file.path), new Response(bytes, { headers: { ...APP_HEADERS, 'Content-Type': file.mime, 'Content-Length': String(file.bytes), 'X-Orbit-SHA256': file.sha256, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' } }));
      copied += file.bytes;
      onProgress({ phase: 'copying', path: file.path, bytes: copied, totalBytes: manifest.totalBytes });
    }
    if (!await cacheIsComplete(cache, manifest, origin, onProgress, signal)) throw new Error('This browser could not keep a complete copy of Orbit. Free some device storage and retry.');
    checkCancelled(signal);
    const record = { releaseId: manifest.releaseId, manifestSha256, cacheName, manifest, completedAt: new Date().toISOString() };
    await publish(record);
    return record;
  } catch (error) {
    await cacheStorage.delete(cacheName).catch(() => {});
    throw error;
  }
}

function database(name, storeName, keyPath) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath }); };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Orbit reader tabs, then retry.'));
  });
}

async function databaseAction(name, storeName, keyPath, mode, run) {
  const db = await database(name, storeName, keyPath);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = run(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Chrome could not save the reader setup.'));
    });
  } finally { db.close(); }
}

export const getRelease = (releaseId) => databaseAction(RELEASE_DB, 'releases', 'releaseId', 'readonly', (store) => store.get(releaseId));
export const putRelease = (record) => databaseAction(RELEASE_DB, 'releases', 'releaseId', 'readwrite', (store) => store.put(record));
export const putWorkspace = (workspace) => databaseAction(WORKSPACE_DB, 'workspaces', 'id', 'readwrite', (store) => store.put(workspace));

export function validateActivation(record, releaseId) {
  if (!record || record.releaseId !== releaseId || typeof record.cacheName !== 'string' || !record.cacheName.startsWith(`orbit-release-${releaseId}-`) || !/^[a-f0-9]{64}$/.test(record.manifestSha256)) throw new Error('Orbit has not been prepared on this browser yet.');
  validateManifest(record.manifest, releaseId);
  return record;
}

/** Range responses let media and WASM readers use the same verified cache. */
export async function rangedResponse(response, range, method = 'GET') {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(APP_HEADERS)) headers.set(key, value);
  if (!range) return new Response(method === 'HEAD' ? null : response.body, { status: response.status, headers });
  const blob = await response.blob();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = 0;
  let end = blob.size - 1;
  if (match && (match[1] || match[2])) {
    if (!match[1]) start = Math.max(0, blob.size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
  }
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= blob.size) {
    headers.set('Content-Range', `bytes */${blob.size}`);
    headers.delete('Content-Length');
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${blob.size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(method === 'HEAD' ? null : blob.slice(start, end + 1), { status: 206, headers });
}
