import { APP_HEADERS, resourceURL } from './core.mjs';
import { createWebsiteGateway, publicFileRequest, websiteCacheName } from './gateway.mjs';
import { manifest, trust } from './release.mjs';

const BASE = new URL(self.registration.scope);
const SHELL_CACHE = `orbit-website-shell-${manifest.releaseId}`;
const SHELL_PATHS = ['', 'index.html', 'offline.html', 'start.js', 'reader.css', 'core.mjs', 'control.mjs', 'gateway.mjs', 'launch.mjs', 'offline.mjs', 'release.mjs', 'manifest.webmanifest', 'icon.svg', 'privacy.html'].map((name) => new URL(name, BASE).pathname);
// Source and license archives stay available, but are not startup downloads.
const DOCUMENT_PATHS = ['Orbit-app-source.zip', 'Orbit-licenses.zip', 'THIRD_PARTY_NOTICES.md', 'REBUILD.txt'].map(name => new URL(name, BASE).pathname);
const APP_CACHE = websiteCacheName(trust);
const entries = new Map(manifest.files.map(file => [file.path, file]));
const appRoot = new URL(`r/${manifest.releaseId}/`, BASE).href;

function headersFor(response, app = false) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(APP_HEADERS)) headers.set(key, value);
  headers.set('Referrer-Policy', 'no-referrer');
  // An explicit HTTP(S) path excludes WebSocket connections. The gateway also
  // rejects unknown files, queries, writes and direct downloads made by the app.
  headers.set('Content-Security-Policy', APP_HEADERS['Content-Security-Policy'].replace("connect-src 'self' blob:", `connect-src ${app ? appRoot : BASE.href} blob:`));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      for (const pathname of SHELL_PATHS) {
        const request = new Request(new URL(pathname, BASE), { cache: 'reload', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
        const response = await fetch(request);
        if (!response.ok) throw new Error('Orbit setup is unavailable.');
        await cache.put(pathname, response);
      }
    } catch (error) { await caches.delete(SHELL_CACHE); throw error; }
    // No skipWaiting: an update must not replace the running lesson's worker.
  })());
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const gateway = createWebsiteGateway({
  base: BASE, manifest, shellPaths: [...SHELL_PATHS, ...DOCUMENT_PATHS],
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
    const cache = await caches.open(APP_CACHE);
    const entry = entries.get(path);
    const response = await cache.match(resourceURL(BASE, manifest.releaseId, path));
    if (!entry || !response || response.status !== 200 || response.headers.get('X-Orbit-SHA256') !== entry.sha256 || response.headers.get('Content-Length') !== String(entry.bytes)) return;
    return response;
  },
  async cacheApp(path, response) {
    await (await caches.open(APP_CACHE)).put(resourceURL(BASE, manifest.releaseId, path), response);
  },
});

self.addEventListener('fetch', (event) => {
  // Cross-origin requests are deliberately handled, never passed through.
  event.respondWith((async () => {
    const client = event.clientId ? await self.clients.get(event.clientId) : undefined;
    let response;
    try { response = await gateway(event.request, client?.url); }
    catch { response = new Response('This tool could not load. Reconnect and try again; keep your saved stories.', { status: 503 }); }
    if (response.status === 503 && event.request.mode === 'navigate') {
      response = new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reopen Orbit</title><h1>Let’s reopen Orbit.</h1><p>This page is not available on this device yet. Reconnect to load it. Your saved stories are unchanged.</p><p><a href="${BASE.pathname}">Reopen Orbit</a>. For a future offline session, choose Files → Prepare for offline use while connected.</p></html>`, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return headersFor(response, event.request.url.startsWith(appRoot));
  })());
});
