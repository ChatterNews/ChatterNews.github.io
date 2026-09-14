import { APP_HEADERS, cacheIsComplete, getRelease, validateActivation, validatePath, resourceURL, rangedResponse } from './core.mjs';

const SHELL_CACHE = 'orbit-reader-shell-__ORBIT_READER_BUILD__';
const BASE = new URL(self.registration.scope);
const extraShell = '__ORBIT_READER_EXTRA__';
const SHELL_PATHS = ['', 'index.html', 'reader.js', 'reader.css', 'core.mjs', 'control.mjs', 'trusted-release.json', 'manifest.webmanifest', 'icon.svg', ...JSON.parse(extraShell.startsWith('__') ? '[]' : extraShell)].map((name) => new URL(name, BASE).pathname);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    for (const pathname of SHELL_PATHS) {
      const response = await fetch(new Request(pathname, { cache: 'reload' }));
      if (!response.ok) throw new Error(`Reader setup could not fetch ${pathname}`);
      await cache.put(pathname, response);
    }
  })());
  // Default waiting behavior keeps an updated reader from interrupting a lesson.
});

self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

function preparationNeeded(isDocument) {
  const headers = { ...APP_HEADERS, 'Content-Type': isDocument ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
  const body = isDocument ? `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reconnect Orbit</title><body><h1>Let’s reopen Orbit.</h1><p>This browser is missing part of Orbit. Keep any story files you already exported.</p><p><a href="${BASE.pathname}">Open the Orbit reader</a> and choose your Orbit app file or Story Drive to prepare the app again.</p></body></html>` : 'Orbit needs preparation again. Return to the Orbit reader and choose your Orbit app file or Story Drive.';
  return new Response(body, { status: 503, headers });
}

async function appResponse(request, url) {
  const match = /^r\/([a-z0-9][a-z0-9._-]{0,95})(?:\/(.*))?$/i.exec(url.pathname.slice(BASE.pathname.length));
  const isDocument = request.mode === 'navigate' || request.destination === 'document';
  if (!match || !['GET', 'HEAD'].includes(request.method)) return new Response('Not available', { status: 404, headers: APP_HEADERS });
  const [, releaseId, encodedPath] = match;
  let requestedPath;
  try { requestedPath = encodedPath ? validatePath(decodeURIComponent(encodedPath)) : 'index.html'; } catch { return new Response('Invalid path', { status: 400, headers: APP_HEADERS }); }
  let record;
  try { record = validateActivation(await getRelease(releaseId), releaseId); } catch { return preparationNeeded(isDocument); }
  if (!await caches.has(record.cacheName)) return preparationNeeded(isDocument);
  const cache = await caches.open(record.cacheName);
  // Recover before boot when an evicted entry script would prevent Orbit's own
  // reconnect screen from running. Header checks avoid reading every model again.
  if (isDocument && !await cacheIsComplete(cache, record.manifest, BASE, undefined, undefined, { metadataOnly: true })) return preparationNeeded(true);
  const file = record.manifest.files.find((entry) => entry.path === requestedPath);
  const selected = file || (isDocument ? record.manifest.files.find((entry) => entry.path === 'index.html') : undefined);
  if (!selected) return new Response('Not found', { status: 404, headers: APP_HEADERS });
  const response = await cache.match(resourceURL(BASE, releaseId, selected.path));
  if (!response || response.headers.get('X-Orbit-SHA256') !== selected.sha256 || response.headers.get('Content-Length') !== String(selected.bytes)) return preparationNeeded(isDocument);
  return rangedResponse(response, request.headers.get('range'), request.method);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(`${BASE.pathname}r/`)) {
    event.respondWith(appResponse(event.request, url).catch(() => preparationNeeded(event.request.mode === 'navigate')));
    return;
  }
  if (event.request.method === 'GET' && SHELL_PATHS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      return await cache.match(url.pathname) || fetch(event.request);
    })());
  }
});
