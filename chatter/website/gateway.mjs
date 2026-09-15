import { APP_HEADERS, rangedResponse, sha256 } from './core.mjs';

/** Only manifest-listed public assets can reach the network, never caller data. */
export function publicFileRequest(url) {
  return new Request(url, { method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' });
}

export function websiteCacheName(trust) {
  return `orbit-release-${trust.releaseId}-web-${trust.manifestSha256}`;
}
export function createWebsiteGateway({ base, manifest, shellPaths, shellResponse, appResponse, cacheApp, network = fetch, downloadURL }) {
  const appRoot = new URL(`r/${manifest.releaseId}/`, base);
  const downloads = new Map(manifest.files.map((file) => [new URL(`downloads/${manifest.releaseId}/${file.path.split('/').map(encodeURIComponent).join('/')}`, base).href, file]));
  const appFiles = new Map(manifest.files.map((file) => [new URL(file.path.split('/').map(encodeURIComponent).join('/'), appRoot).href, file.path]));
  appFiles.set(appRoot.href, 'index.html');
  const shell = new Set(shellPaths);
  const entries = new Map(manifest.files.map(file => [file.path, file]));
  const pending = new Map();
  async function loadApp(path) {
    const cached = await appResponse(path);
    if (cached) return cached;
    if (!cacheApp) return;
    if (!pending.has(path)) {
      const download = (async () => {
        const file = entries.get(path);
        const url = downloadURL ? downloadURL(file) : new URL(`downloads/${manifest.releaseId}/${file.path.split('/').map(encodeURIComponent).join('/')}`, base);
        const response = await network(publicFileRequest(url));
        if (!response.ok) throw new Error('An Orbit tool could not load.');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== file.bytes || await sha256(bytes) !== file.sha256) throw new Error('An Orbit tool did not pass its file check.');
        const verified = new Response(bytes, { headers: { ...APP_HEADERS, 'Content-Type': file.mime, 'Content-Length': String(file.bytes), 'X-Orbit-SHA256': file.sha256, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' } });
        // A full cache must not prevent online use. Offline preparation separately
        // checks that every file was actually retained before declaring readiness.
        await cacheApp(path, verified.clone()).catch(() => {});
        return verified;
      })();
      pending.set(path, download);
      void download.finally(() => pending.delete(path)).catch(() => {});
    }
    return (await pending.get(path)).clone();
  }
  return async (request, clientURL = '') => {
    const url = new URL(request.url);
    const fragment = url.hash;
    // Chrome retains fragments on navigation Requests even though HTTP never
    // sends them. They select a local screen, not a different cached app file.
    url.hash = '';
    if (url.origin !== base.origin || url.search || !['GET', 'HEAD'].includes(request.method)) return new Response('Orbit blocked a network request.', { status: 403 });
    if (appFiles.has(url.href)) {
      try {
        const response = await loadApp(appFiles.get(url.href));
        if (response) return rangedResponse(response, request.headers.get('range'), request.method);
      } catch { /* A missing or invalid public asset never gets another source. */ }
      return new Response('This Orbit tool needs a connection. Reconnect and try again; your saved stories stay on this device.', { status: 503 });
    }
    if (shell.has(url.pathname)) return await shellResponse(request) || new Response('Orbit setup is unavailable. Reopen its home page online.', { status: 503 });
    let setupClient = false;
    try {
      const client = new URL(clientURL);
      setupClient = client.origin === base.origin && !client.search && [base.pathname, new URL('index.html', base).pathname].includes(client.pathname);
    } catch { /* Unidentified callers cannot download. */ }
    if (setupClient && !fragment && request.method === 'GET' && downloads.has(url.href)) {
      // Never forward caller-controlled headers, cookies, query strings or referrers.
      return network(publicFileRequest(url));
    }
    return new Response('Orbit blocked a network request.', { status: 403 });
  };
}
