'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { PortableFiles, safeDownloadName } = require('./files.cjs');

const ORIGIN = 'app://orbit';
const WEB_ROOT = path.join(__dirname, 'web');
const HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'microphone=(self), camera=(self)',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'",
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf' };

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

function isOrbit(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'app:' && parsed.hostname === 'orbit' && !parsed.port && !parsed.username && !parsed.password; } catch { return false; }
}

function portableRoot() {
  if (process.env.ORBIT_PORTABLE_ROOT) return path.resolve(process.env.ORBIT_PORTABLE_ROOT);
  if (process.platform === 'darwin') return path.resolve(process.resourcesPath, '../../../../..');
  return path.resolve(path.dirname(process.execPath), '../..');
}

function workspaceId(root) {
  const support = path.join(root, '_Orbit');
  fs.mkdirSync(support, { recursive: true });
  if (fs.lstatSync(support).isSymbolicLink()) throw new Error('The _Orbit support folder must not be a shortcut.');
  const file = path.join(support, 'workspace.json');
  try { fs.writeFileSync(file, JSON.stringify({ id: randomUUID() }), { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 256) throw new Error('The workspace identity file is invalid.');
  const id = JSON.parse(fs.readFileSync(file, 'utf8')).id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('The workspace identity file is invalid.');
  return id.toLowerCase();
}

let mainWindow;
let portableFiles;
let rendererCrashed = false;
let crashCleanupPending = false;
const activeDownloads = new Set();
const nativeGrants = new Set();

function isSaving() {
  return crashCleanupPending || (!rendererCrashed && (portableFiles?.writes.size || activeDownloads.size));
}

function assertSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !isOrbit(event.senderFrame.url)) throw new Error('This window cannot access Chatter News.');
}

async function serveApp(request) {
  const url = new URL(request.url);
  if (!isOrbit(url.href) || !['GET', 'HEAD'].includes(request.method)) return new Response('Not available', { status: 403, headers: HEADERS });
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Invalid path', { status: 400, headers: HEADERS }); }
  if (pathname.includes('\\') || pathname.includes('\0')) return new Response('Invalid path', { status: 400, headers: HEADERS });
  let file = path.resolve(WEB_ROOT, `.${pathname}`);
  const relative = path.relative(WEB_ROOT, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not available', { status: 403, headers: HEADERS });
  if (pathname === '/') file = path.join(WEB_ROOT, 'index.html');
  let info = await fsp.stat(file).catch(() => undefined);
  if ((!info || !info.isFile()) && !path.extname(pathname) && request.headers.get('accept')?.includes('text/html')) {
    file = path.join(WEB_ROOT, 'index.html');
    info = await fsp.stat(file).catch(() => undefined);
  }
  if (!info?.isFile()) return new Response('Not found', { status: 404, headers: HEADERS });
  const realRoot = await fsp.realpath(WEB_ROOT);
  const realFile = await fsp.realpath(file);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) return new Response('Not available', { status: 403, headers: HEADERS });
  const headers = { ...HEADERS, 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    }
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${info.size}` } });
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = String(Math.max(0, end - start + 1));
  const body = request.method === 'HEAD' || info.size === 0 ? null : Readable.toWeb(fs.createReadStream(realFile, { start, end }));
  return new Response(body, { status, headers });
}

function installPermissions(ses) {
  const owner = (webContents, url) => mainWindow && webContents === mainWindow.webContents && isOrbit(url);
  ses.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (!owner(contents, origin) || (details.requestingUrl && !isOrbit(details.requestingUrl))) return false;
    if (permission === 'media') return nativeGrants.has(details.mediaType);
    return ['clipboard-sanitized-write', 'fullscreen', 'persistent-storage'].includes(permission);
  });
  ses.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (!owner(contents, details.requestingUrl || contents?.getURL()) || details.isMainFrame === false) return callback(false);
    if (['clipboard-sanitized-write', 'fullscreen', 'persistent-storage'].includes(permission)) return callback(true);
    if (permission !== 'media') return callback(false);
    const types = details.mediaTypes || [];
    if (!types.length || types.some((type) => !['audio', 'video'].includes(type))) return callback(false);
    if (types.every((type) => nativeGrants.has(type))) return callback(true);
    const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Orbit recording', message: `Allow Orbit to use your ${types.includes('video') ? types.includes('audio') ? 'camera and microphone' : 'camera' : 'microphone'}?`, detail: 'Orbit uses this only when you choose a recording tool.', buttons: ['Allow', 'Not now'], defaultId: 1, cancelId: 1 });
    if (response === 0) types.forEach((type) => nativeGrants.add(type));
    callback(response === 0);
  });
  ses.on('file-system-access-restricted', (_event, _details, callback) => callback('deny'));
}

function installDownloads(ses) {
  ses.on('will-download', (event, item, contents) => {
    if (!mainWindow || contents !== mainWindow.webContents || !isOrbit(contents.getURL())) { event.preventDefault(); return; }
    const name = safeDownloadName(item.getFilename());
    const extension = path.extname(name);
    const stem = name.slice(0, name.length - extension.length);
    let destination;
    try {
      const root = fs.lstatSync(portableFiles.root);
      if (root.isSymbolicLink() || !root.isDirectory() || root.dev !== portableFiles.identity.dev || root.ino !== portableFiles.identity.ino) throw new Error('The Chatter News folder is unavailable.');
      for (let suffix = 0; suffix < 10000; suffix++) {
        const candidate = path.join(portableFiles.root, `${stem}${suffix ? ` (${suffix + 1})` : ''}${extension}`);
        try { fs.closeSync(fs.openSync(candidate, 'wx', 0o600)); destination = candidate; break; } catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      if (!destination) throw new Error('Too many exports have the same name. Rename the export and retry.');
      item.setSavePath(destination);
      activeDownloads.add(item);
      item.once('done', (_event, state) => {
        activeDownloads.delete(item);
        if (state !== 'completed') {
          fsp.unlink(destination).catch(() => {});
          if (!rendererCrashed) dialog.showErrorBox('Export did not finish', 'Keep Orbit open and retry the export. The incomplete file was removed.');
        }
      });
    } catch (error) {
      event.preventDefault();
      activeDownloads.delete(item);
      if (destination) fsp.unlink(destination).catch(() => {});
      dialog.showErrorBox('Export did not save', error.message);
    }
  });
}

async function start() {
  app.setName('Orbit');
  const root = portableRoot();
  const id = workspaceId(root);
  // Machine-local storage preserves Gate's device identity and trust boundary.
  const profile = path.join(app.getPath('userData'), 'workspaces', id);
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  await app.whenReady();
  portableFiles = new PortableFiles(path.join(root, 'Chatter News'));
  await portableFiles.initialize();
  if (!fs.existsSync(path.join(WEB_ROOT, 'index.html'))) throw new Error('Orbit is missing its app files. Extract the entire ZIP before starting it.');
  protocol.handle('app', (request) => serveApp(request).catch(() => new Response('The app file could not be read. Reconnect the drive and reopen Orbit.', { status: 500, headers: HEADERS })));
  for (const [channel, operation] of Object.entries({
    'get-info': () => ({ saveFolderLabel: 'Chatter News', version: app.getVersion() }),
    'create-directory': (segments) => portableFiles.createDirectory(segments),
    'begin-write': (segments) => portableFiles.beginWrite(segments),
    'append-write': (token, bytes) => portableFiles.appendWrite(token, bytes),
    'commit-write': (token) => portableFiles.commitWrite(token),
    'abort-write': (token) => portableFiles.abortWrite(token),
    'stat-file': (segments) => portableFiles.statFile(segments),
    'read-file': (segments, begin, end) => portableFiles.readFile(segments, begin, end),
  })) ipcMain.handle(`orbit:${channel}`, (event, ...args) => { assertSender(event); return operation(...args); });
  mainWindow = new BrowserWindow({ title: 'Chatter News · Orbit', width: 1380, height: 900, minWidth: 1000, minHeight: 680, backgroundColor: '#151026', show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: true } });
  installPermissions(session.defaultSession);
  installDownloads(session.defaultSession);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!isOrbit(url)) event.preventDefault(); });
  mainWindow.webContents.on('render-process-gone', () => {
    rendererCrashed = true;
    crashCleanupPending = true;
    for (const item of activeDownloads) { try { item.cancel(); } catch { /* Download may already have ended. */ } }
    activeDownloads.clear();
    void portableFiles.abortAll().catch(() => {}).finally(() => {
      crashCleanupPending = false;
      dialog.showErrorBox('Orbit stopped unexpectedly', 'Close and reopen Orbit to recover the work stored on this computer. Your completed files in Chatter News are unchanged.');
    });
  });
  mainWindow.on('close', (event) => {
    if (isSaving()) {
      event.preventDefault();
      dialog.showErrorBox('Orbit is still saving', 'Wait for the save to finish before closing Orbit.');
    }
  });
  mainWindow.on('closed', () => { mainWindow = undefined; });
  mainWindow.once('ready-to-show', () => { mainWindow.show(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Orbit', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }, { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }]));
  await mainWindow.loadURL(`${ORIGIN}/`);
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (!isSaving()) return;
  event.preventDefault();
  dialog.showErrorBox('Orbit is still saving', 'Wait for the save to finish before closing Orbit.');
});
start().catch((error) => { dialog.showErrorBox('Orbit could not start', `${error.message}\n\nKeep Start Orbit and both folders together. Extract the whole ZIP into a folder you can save to, then try again.`); app.quit(); });
