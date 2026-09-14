import { cacheIsComplete, resourceURL } from './core.mjs';

/** Fill the same verified cache used by normal browsing, without a second copy. */
export async function prepareOffline({ base, manifest, cache, fetchResource = fetch, signal, onProgress = () => {} }) {
  let bytes = 0;
  for (const file of manifest.files) {
    signal?.throwIfAborted();
    const url = resourceURL(base, manifest.releaseId, file.path);
    const saved = await cache.match(url);
    if (!saved || saved.status !== 200 || saved.headers.get('X-Orbit-SHA256') !== file.sha256 || saved.headers.get('Content-Length') !== String(file.bytes)) {
      onProgress({ bytes, totalBytes: manifest.totalBytes });
      const response = await fetchResource(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
      if (!response.ok) throw new Error('A tool could not load. Reconnect and retry offline preparation.');
      // The controlling worker verifies and caches this complete response.
      await response.arrayBuffer();
    }
    bytes += file.bytes;
    onProgress({ bytes, totalBytes: manifest.totalBytes });
  }
  signal?.throwIfAborted();
  if (!await cacheIsComplete(cache, manifest, base, undefined, signal)) throw new Error('The browser could not keep every tool. Free some device storage and try again. You can still use Orbit online.');
}
