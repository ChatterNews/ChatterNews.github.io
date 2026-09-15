import { APP_HEADERS, resourceURL } from './core.mjs';
import { createWebsiteGateway, publicFileRequest, websiteCacheName } from './gateway.mjs';
import { manifest, trust } from './release.mjs';
import { recoveryPage } from './recovery.mjs';
import { startup } from './startup.mjs';
import { compatibility } from './compatibility.mjs';
import { parsePublishedRelease, validateHistory } from './history.mjs';

const BASE = new URL(self.registration.scope);
const SHELL_CACHE = `orbit-website-shell-${manifest.releaseId}`;
const SHELL_PATHS = ['', 'index.html', 'offline.html', 'start.js', 'reader.css', 'core.mjs', 'control.mjs', 'gateway.mjs', 'launch.mjs', 'offline.mjs', 'release.mjs', 'manifest.webmanifest', 'icon.svg', 'privacy.html', 'update.mjs', 'history.mjs', 'compatibility.mjs', 'compatibility.json', 'startup.mjs', 'recovery.js', 'recovery.mjs'].map((name) => new URL(name, BASE).pathname);
// Source and license archives stay available, but are not startup downloads.
const DOCUMENT_PATHS = ['Orbit-app-source.zip', 'Orbit-licenses.zip', 'THIRD_PARTY_NOTICES.md', 'REBUILD.txt'].map(name => new URL(name, BASE).pathname);
const currentFiles = new Map(manifest.files.map(file => [file.sha256, file]));
const appRoot = new URL(`r/${manifest.releaseId}/`, BASE).href;

function headersFor(response, requestedAppRoot) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(APP_HEADERS)) headers.set(key, value);
  headers.set('Referrer-Policy', 'no-referrer');
  // An explicit HTTP(S) path excludes WebSocket connections. The gateway also
  // rejects unknown files, queries, writes and direct downloads made by the app.
  headers.set('Content-Security-Policy', APP_HEADERS['Content-Security-Policy'].replace("connect-src 'self' blob:", `connect-src ${requestedAppRoot || BASE.href} blob:`));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      await validateHistory(compatibility);
      for (const pathname of SHELL_PATHS) {
        const request = new Request(new URL(pathname, BASE), { cache: 'reload', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
        const response = await fetch(request);
        if (!response.ok) throw new Error('Orbit setup is unavailable.');
        await cache.put(pathname, response);
      }
      // Activate only after the small startup dependency set is verified/cached.
      // Models and room tools remain on demand.
      for (const path of startup) {
        const response = await gateways.get(manifest.releaseId)(new Request(resourceURL(BASE, manifest.releaseId, path)));
        if (!response.ok) throw new Error('Orbit startup tools did not finish loading.');
        const stored = await (await caches.open(websiteCacheName(trust))).match(resourceURL(BASE, manifest.releaseId, path));
        if (!stored) throw new Error('Orbit could not retain the new startup tools.');
      }
    } catch (error) { await caches.delete(SHELL_CACHE); throw error; }
    // This worker serves each open tab its own verified release, so activation
    // does not replace its document or mix old code with new tools.
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function releaseGateway(record, legacy = false) {
  const release = record.manifest;
  const entries = new Map(release.files.map(file => [file.path, file]));
  const cacheName = websiteCacheName(record.trust);
  return createWebsiteGateway({
    base: BASE, manifest: release, shellPaths: [...SHELL_PATHS, ...DOCUMENT_PATHS],
    async shellResponse(request) {
      const cache = await caches.open(SHELL_CACHE);
      const path = new URL(request.url).pathname;
      let response = await cache.match(path);
      if (!response && DOCUMENT_PATHS.includes(path)) {
        response = await fetch(publicFileRequest(new URL(path, BASE)));
        if (!response.ok) return;
        await cache.put(path, response.clone()).catch(() => {});
      }
      return response && (request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response);
    },
    async appResponse(path) {
      const cache = await caches.open(cacheName);
      const entry = entries.get(path);
      const response = await cache.match(resourceURL(BASE, release.releaseId, path));
      if (!entry || !response || response.status !== 200 || response.headers.get('X-Orbit-SHA256') !== entry.sha256 || response.headers.get('Content-Length') !== String(entry.bytes)) return;
      return response;
    },
    downloadURL(file) {
      const current = currentFiles.get(file.sha256);
      if (current) return new URL(`downloads/${manifest.releaseId}/${current.path.split('/').map(encodeURIComponent).join('/')}`, BASE);
      // Pre-updater tabs can use their cached tools, but unlisted legacy bytes
      // never open a new network destination.
      if (legacy) throw new Error('This older tool is unavailable. Refresh Orbit when your work is saved.');
      return new URL(`compat/${file.sha256}`, BASE);
    },
    async cacheApp(path, response) {
      await (await caches.open(cacheName)).put(resourceURL(BASE, release.releaseId, path), response);
    },
  });
}

const gateways = new Map([ { manifest, trust }, ...compatibility ].map(record => [record.manifest.releaseId, releaseGateway(record)]));
let legacyReady;
async function loadLegacyCaches() {
  // Older installs predate the published compatibility catalog. Preserve their
  // cached files; metadata is parsed as JSON and never evaluated as JavaScript.
  for (const name of await caches.keys()) {
    if (!name.startsWith('orbit-website-shell-')) continue;
    try {
      const cached = await (await caches.open(name)).match(new URL('release.mjs', BASE).pathname);
      if (!cached) continue;
      const record = await parsePublishedRelease(await cached.text());
      if (!gateways.has(record.manifest.releaseId)) gateways.set(record.manifest.releaseId, releaseGateway(record, true));
    } catch { /* Corrupt historical metadata is not a release. */ }
  }
}
self.addEventListener('message', event => {
  if (event.data?.type === 'ORBIT_RELEASE') event.ports[0]?.postMessage({ type: 'ORBIT_RELEASE', releaseId: manifest.releaseId });
});

self.addEventListener('fetch', (event) => {
  // Cross-origin requests are deliberately handled, never passed through.
  event.respondWith((async () => {
    const client = event.clientId ? await self.clients.get(event.clientId) : undefined;
    let response;
    let recovering = false;
    try {
      await (legacyReady ??= loadLegacyCaches());
      const url = new URL(event.request.url);
      const relative = url.pathname.startsWith(BASE.pathname) ? url.pathname.slice(BASE.pathname.length) : '';
      const match = /^r\/([a-z0-9][a-z0-9._-]{0,95})\/(.*)$/i.exec(relative);
      const releaseId = match?.[1];
      const selected = gateways.get(releaseId) || gateways.get(manifest.releaseId);
      // A refresh of an old bookmark enters the current app. Subresource requests
      // from an already running old document continue using its original files.
      if (url.origin === BASE.origin && !url.search && event.request.method === 'GET' && event.request.mode === 'navigate'
        && self.navigator.onLine !== false && releaseId && ['', 'index.html'].includes(match[2]) && releaseId !== manifest.releaseId) {
        return Response.redirect(appRoot, 302);
      }
      response = await selected(event.request, client?.url);
    }
    catch { response = new Response('This tool could not load. Reconnect and try again; keep your saved stories.', { status: 503 }); }
    if (response.status === 503 && event.request.mode === 'navigate') {
      recovering = true;
      response = new Response(recoveryPage(BASE.pathname), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const requested = new URL(event.request.url).pathname.match(/^(.*\/r\/[a-z0-9][a-z0-9._-]{0,95}\/)/i);
    return headersFor(response, requested && !recovering ? new URL(requested[1], BASE).href : undefined);
  })());
});
