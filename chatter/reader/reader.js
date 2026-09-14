import { cacheIsComplete, getRelease, prepareRelease, putRelease, putWorkspace, validateActivation, validateTrust, verifyManifest } from './core.mjs';
import { ensureReaderController } from './control.mjs';

const READER_BASE = new URL('./', import.meta.url);
const openButton = document.querySelector('#open-drive');
const cancelButton = document.querySelector('#cancel');
const status = document.querySelector('#status');
const detail = document.querySelector('#detail');
const progress = document.querySelector('#progress');
const progressLabel = document.querySelector('#progress-label');
const driveLabel = document.querySelector('#drive-name');
let preparation;

function setStatus(title, explanation = '', state = 'ready') {
  status.textContent = title;
  detail.textContent = explanation;
  document.body.dataset.state = state;
}

function showProgress(update) {
  progress.hidden = false;
  progress.max = Math.max(update.totalBytes, 1);
  progress.value = update.bytes;
  const percent = Math.min(100, Math.floor(update.bytes / Math.max(update.totalBytes, 1) * 100));
  progressLabel.textContent = `${update.phase === 'checking' ? 'Checking' : 'Preparing'} Orbit · ${percent}%`;
  setStatus(update.phase === 'checking' ? 'Checking your Orbit copy…' : 'Loading your creative toolkit…', `${Math.round(update.bytes / 1024 / 1024)} of ${Math.ceil(update.totalBytes / 1024 / 1024)} MB. Keep the drive connected.`, 'busy');
}

function checkCancelled(signal) {
  if (signal.aborted) throw new DOMException('Preparation cancelled.', 'AbortError');
}

async function readerReady() {
  if (!window.isSecureContext) throw new Error('Open the secure Orbit reader link supplied with your package.');
  if (!navigator.serviceWorker || !window.caches || !window.indexedDB || !navigator.locks || !window.showDirectoryPicker) throw new Error('Open this reader in current desktop Chrome on a Chromebook, Mac or Windows PC. This device does not offer the folder access Orbit needs.');
  await ensureReaderController(READER_BASE);
}

async function getWorkspace(root, support) {
  return navigator.locks.request('orbit-reader-assign-workspace', async () => {
    let handle;
    try { handle = await support.getFileHandle('workspace.json'); } catch (error) { if (error.name !== 'NotFoundError') throw error; }
    if (!handle) {
      handle = await support.getFileHandle('workspace.json', { create: true });
      const text = JSON.stringify({ id: crypto.randomUUID() });
      const writable = await handle.createWritable();
      try { await writable.write(text); await writable.close(); } catch (error) { await writable.abort().catch(() => {}); throw error; }
      if (await (await handle.getFile()).text() !== text) throw new Error('The drive could not keep its workspace setup. Leave it connected and retry.');
    }
    const file = await handle.getFile();
    if (file.size > 256) throw new Error('The drive workspace reference is damaged. Ask your advisor for help; your Chatter News folder is unchanged.');
    let record;
    try { record = JSON.parse(await file.text()); } catch { throw new Error('The drive workspace reference could not be read. Ask your advisor for help.'); }
    if (typeof record.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(record.id)) throw new Error('The drive workspace reference is invalid. Ask your advisor for help.');
    await root.getDirectoryHandle('Chatter News', { create: true });
    const workspace = { id: record.id.toLowerCase(), handle: root, name: root.name };
    await putWorkspace(workspace);
    return workspace;
  });
}

async function openDrive() {
  if (preparation) return;
  const controller = new AbortController();
  preparation = controller;
  openButton.disabled = true;
  cancelButton.hidden = false;
  progress.hidden = true;
  progressLabel.textContent = '';
  try {
    // The chooser starts directly in this click, before any awaited preparation.
    const root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'orbit-story-drive' });
    driveLabel.textContent = root.name;
    setStatus('Checking your Story Drive…', 'Keep the drive connected while Orbit gets ready.', 'busy');
    await ready;
    checkCancelled(controller.signal);
    let support;
    try { support = await root.getDirectoryHandle('_Orbit'); } catch { throw new Error('Choose the whole Orbit folder containing Start Orbit, Chatter News and _Orbit.'); }
    const reference = await fetch(new URL('trusted-release.json', READER_BASE));
    if (!reference.ok) throw new Error('The reader reference could not be loaded. Reconnect to the internet and reload the reader.');
    const trust = validateTrust(await reference.json());
    const manifestFile = await (await support.getFileHandle('RELEASE.json')).getFile();
    if (manifestFile.size > 4 * 1024 * 1024) throw new Error('The package reference is too large. Ask your advisor for a fresh package.');
    const manifest = await verifyManifest(await manifestFile.arrayBuffer(), trust);
    const appFolder = await support.getDirectoryHandle('app');
    let existing;
    try { existing = validateActivation(await getRelease(manifest.releaseId), manifest.releaseId); } catch { /* First preparation has no activation yet. */ }
    let prepared = false;
    if (existing?.manifestSha256 === trust.manifestSha256 && await caches.has(existing.cacheName)) {
      prepared = await cacheIsComplete(await caches.open(existing.cacheName), manifest, READER_BASE, showProgress, controller.signal);
    }
    if (!prepared) {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota && estimate.quota - (estimate.usage || 0) < manifest.totalBytes + 8 * 1024 * 1024) throw new Error('This Chromebook needs more free browser storage to prepare Orbit. Ask your advisor to free space, then retry.');
      await navigator.storage?.persist?.().catch(() => false);
      const folders = new Map([['', appFolder]]);
      const loadFile = async (filePath) => {
        const parts = filePath.split('/');
        const filename = parts.pop();
        let folder = appFolder;
        let folderPath = '';
        for (const part of parts) {
          folderPath = folderPath ? `${folderPath}/${part}` : part;
          if (!folders.has(folderPath)) folders.set(folderPath, await folder.getDirectoryHandle(part));
          folder = folders.get(folderPath);
        }
        return (await folder.getFileHandle(filename)).getFile();
      };
      await prepareRelease({ manifest, manifestSha256: trust.manifestSha256, origin: READER_BASE, loadFile, publish: putRelease, onProgress: showProgress, signal: controller.signal });
    }
    checkCancelled(controller.signal);
    const workspace = await getWorkspace(root, support);
    checkCancelled(controller.signal);
    sessionStorage.setItem('orbit-reader-current', JSON.stringify({ workspaceId: workspace.id, releaseId: manifest.releaseId }));
    setStatus('All systems ready. Let’s make something.', 'Opening your Orbit desk…', 'ready');
    preparation = undefined;
    window.location.assign(new URL(`r/${manifest.releaseId}/`, READER_BASE));
  } catch (error) {
    if (error?.name === 'AbortError') setStatus('Your drive is safe. Ready when you are.', 'Choose Open Story Drive to try again.');
    else if (error?.name === 'QuotaExceededError') setStatus('Orbit needs more room.', 'Chrome ran out of storage. Free some device storage and choose your drive again.', 'error');
    else if (['NotAllowedError', 'SecurityError'].includes(error?.name)) setStatus('Orbit needs permission to open the drive.', 'Choose Open Story Drive and allow folder access. On a school device, your advisor may need IT to allow it.', 'error');
    else if (error?.name === 'NotFoundError' || error?.name === 'NotReadableError') setStatus('Let’s reconnect that drive.', 'A package file could not be read. Keep the drive connected, choose the complete Orbit folder, and retry.', 'error');
    else setStatus('We couldn’t open Orbit yet.', error?.message || 'Leave the drive connected and retry.', 'error');
  } finally {
    preparation = undefined;
    openButton.disabled = false;
    cancelButton.hidden = true;
  }
}

openButton.addEventListener('click', () => void openDrive());
cancelButton.addEventListener('click', () => { preparation?.abort(); cancelButton.hidden = true; setStatus('Finishing the current check…', 'Then preparation will stop. Your saved work is unchanged.', 'busy'); });
window.addEventListener('beforeunload', (event) => { if (preparation) { event.preventDefault(); event.returnValue = ''; } });
const ready = readerReady();
ready.then(() => { openButton.disabled = false; setStatus('Ready for your Story Drive.', 'Choose the whole Orbit folder. We’ll check the app and open your desk.'); }).catch((error) => { openButton.disabled = true; setStatus('A quick setup check…', error.message, 'error'); });
