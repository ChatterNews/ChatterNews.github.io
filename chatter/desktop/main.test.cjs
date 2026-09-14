'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const fileModule = require('./files.cjs');

const SOURCE = fs.readFile(path.join(__dirname, 'main.cjs'), 'utf8');

function cancellableEvent() {
  return { prevented: false, preventDefault() { this.prevented = true; } };
}

async function eventually(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Mocked Electron did not reach the expected state.');
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function startMockApp(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-desktop-main-'));
  const root = path.join(temporary, 'Portable Orbit');
  const appDirectory = path.join(root, '_Orbit', 'runtime', 'resources', 'app');
  await fs.mkdir(path.join(appDirectory, 'web'), { recursive: true });
  await fs.writeFile(path.join(appDirectory, 'web', 'index.html'), '<!doctype html><title>Fixture</title>');
  const paths = { userData: path.join(temporary, 'Local profile') };
  const dialogs = [];
  const handlers = new Map();
  const fileInstances = [];
  let window;
  let loaded = false;
  let startupError;
  let cleanupPause;
  let releaseCleanup;
  class ObservedFiles extends fileModule.PortableFiles {
    constructor(directory) { super(directory); fileInstances.push(this); }
    async abortAll() { await cleanupPause; await super.abortAll(); }
  }
  class MockWindow extends EventEmitter {
    constructor() {
      super();
      window = this;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: 'app://orbit/' };
      this.webContents.getURL = () => this.webContents.mainFrame.url;
      this.webContents.setWindowOpenHandler = () => {};
    }
    async loadURL(url) { this.webContents.mainFrame.url = url; loaded = true; }
    show() {}
    focus() {}
    restore() {}
    isMinimized() { return false; }
  }
  const app = Object.assign(new EventEmitter(), {
    setName() {},
    getPath: (key) => paths[key],
    setPath: (key, value) => { paths[key] = value; },
    getVersion: () => '0.1.0',
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    quit() {},
  });
  const ses = Object.assign(new EventEmitter(), { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} });
  const electron = {
    app,
    BrowserWindow: MockWindow,
    dialog: {
      showErrorBox: (title, message) => { dialogs.push({ title, message }); if (title === 'Orbit could not start') startupError = message; },
      showMessageBox: async () => ({ response: 1 }),
    },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    Menu: { buildFromTemplate: (template) => template, setApplicationMenu() {} },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    session: { defaultSession: ses },
  };
  const context = {
    require: (name) => name === 'electron' ? electron : name === './files.cjs' ? { ...fileModule, PortableFiles: ObservedFiles } : require(name),
    __dirname: appDirectory,
    process: { env: { ORBIT_PORTABLE_ROOT: root }, platform: 'win32', execPath: path.join(root, '_Orbit', 'runtime', 'Orbit.exe') },
    URL,
    Response,
    Uint8Array,
    console,
  };
  vm.runInNewContext(await SOURCE, context, { filename: 'main.cjs' });
  t.after(async () => { releaseCleanup?.(); for (const files of fileInstances) await files.abortAll(); await fs.rm(temporary, { recursive: true, force: true }); });
  await eventually(() => loaded || startupError);
  assert.equal(startupError, undefined);
  const eventFor = () => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
  return {
    app, window, ses, dialogs, files: fileInstances[0], root,
    invoke: (name, ...args) => handlers.get(`orbit:${name}`)(eventFor(), ...args),
    pauseCleanup() { cleanupPause = new Promise((resolve) => { releaseCleanup = resolve; }); return () => releaseCleanup(); },
    attemptClose() { const event = cancellableEvent(); window.emit('close', event); return event.prevented; },
    attemptQuit() { const event = cancellableEvent(); app.emit('before-quit', event); return event.prevented; },
  };
}

function beginDownload(state, name = 'news-show.webm') {
  const item = Object.assign(new EventEmitter(), {
    cancelled: false,
    getFilename: () => name,
    setSavePath(destination) { this.destination = destination; },
    cancel() { this.cancelled = true; this.emit('done', {}, 'cancelled'); },
  });
  const event = cancellableEvent();
  state.ses.emit('will-download', event, item, state.window.webContents);
  assert.equal(event.prevented, false);
  assert.ok(item.destination.startsWith(path.join(state.root, 'Chatter News') + path.sep));
  return item;
}

test('window close and application quit wait for an active export', async (t) => {
  const state = await startMockApp(t);
  assert.equal(state.attemptClose(), false);
  assert.equal(state.attemptQuit(), false);
  const item = beginDownload(state);
  assert.equal(state.attemptClose(), true);
  assert.equal(state.attemptQuit(), true);
  assert.equal(state.dialogs.at(-1).title, 'Orbit is still saving');
  await fs.writeFile(item.destination, 'completed export');
  item.emit('done', {}, 'completed');
  assert.equal(state.attemptClose(), false);
  assert.equal(state.attemptQuit(), false);
  assert.equal(await fs.readFile(item.destination, 'utf8'), 'completed export');
});

test('completing one export keeps the guard until the final export ends', async (t) => {
  const state = await startMockApp(t);
  const first = beginDownload(state);
  const second = beginDownload(state);
  assert.notEqual(first.destination, second.destination);
  first.emit('done', {}, 'completed');
  assert.equal(state.attemptQuit(), true);
  second.emit('done', {}, 'completed');
  assert.equal(state.attemptClose(), false);
  assert.equal(state.attemptQuit(), false);
});

test('renderer failure cancels exports and abandons native writes so Orbit can reopen', async (t) => {
  const state = await startMockApp(t);
  const token = await state.invoke('begin-write', ['story.chatter']);
  await state.invoke('append-write', token, new Uint8Array([1, 2, 3]));
  const download = beginDownload(state);
  assert.equal(state.files.writes.size, 1);
  assert.equal(state.attemptQuit(), true);
  const release = state.pauseCleanup();
  state.window.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  assert.equal(state.attemptClose(), true, 'close waits for abandoned file handles to clean up');
  assert.equal(state.attemptQuit(), true, 'quit waits for cleanup instead of interrupting it');
  assert.equal(state.files.writes.size, 1);
  release();
  await eventually(() => state.dialogs.some((entry) => entry.title === 'Orbit stopped unexpectedly'));
  await eventually(() => state.files.writes.size === 0);
  assert.equal(download.cancelled, true);
  assert.equal(state.attemptClose(), false);
  assert.equal(state.attemptQuit(), false);
  await eventually(() => !require('node:fs').existsSync(download.destination));
  assert.deepEqual(await fs.readdir(path.join(state.root, 'Chatter News')), []);
  await assert.rejects(state.invoke('commit-write', token), /no longer open/);
  assert.equal(state.dialogs.some((entry) => entry.title === 'Export did not finish'), false);
});
