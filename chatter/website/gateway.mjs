/** All app traffic is cache-only. Only the setup page can download named public assets. */
export function createWebsiteGateway({ base, manifest, shellPaths, shellResponse, appResponse, network = fetch }) {
  const appRoot = new URL(`r/${manifest.releaseId}/`, base);
  const downloads = new Map(manifest.files.map((file) => [new URL(`downloads/${manifest.releaseId}/${file.path.split('/').map(encodeURIComponent).join('/')}`, base).href, file]));
  const appFiles = new Map(manifest.files.map((file) => [new URL(file.path.split('/').map(encodeURIComponent).join('/'), appRoot).href, file.path]));
  appFiles.set(appRoot.href, 'index.html');
  const shell = new Set(shellPaths);
  return async (request, clientURL = '') => {
    const url = new URL(request.url);
    const fragment = url.hash;
    // Chrome retains fragments on navigation Requests even though HTTP never
    // sends them. They select a local screen, not a different cached app file.
    url.hash = '';
    if (url.origin !== base.origin || url.search || !['GET', 'HEAD'].includes(request.method)) return new Response('Orbit blocked a network request.', { status: 403 });
    if (appFiles.has(url.href)) return await appResponse(appFiles.get(url.href), request) || new Response('Orbit needs preparation again. Reopen its home page; keep your saved stories.', { status: 503 });
    if (shell.has(url.pathname)) return await shellResponse(request) || new Response('Orbit setup is unavailable. Reopen its home page online.', { status: 503 });
    let setupClient = false;
    try {
      const client = new URL(clientURL);
      setupClient = client.origin === base.origin && !client.search && [base.pathname, new URL('index.html', base).pathname].includes(client.pathname);
    } catch { /* Unidentified callers cannot download. */ }
    if (setupClient && !fragment && request.method === 'GET' && downloads.has(url.href)) {
      // Never forward caller-controlled headers, cookies, query strings or referrers.
      return network(new Request(url, { method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' }));
    }
    return new Response('Orbit blocked a network request.', { status: 403 });
  };
}
