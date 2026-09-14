import { cacheIsComplete, verifyManifest } from './core.mjs';
import { ensureReaderController } from './control.mjs';
import { websiteCacheName } from './gateway.mjs';
import { launchWebsite } from './launch.mjs';
import { prepareOffline } from './offline.mjs';
import { manifest, trust } from './release.mjs';

const BASE = new URL('./', import.meta.url);
const offline = document.body.dataset.offline === 'true';
const prepareButton = document.querySelector('#prepare');
const openButton = document.querySelector('#resume');
const cancel = document.querySelector('#cancel');
const progress = document.querySelector('#progress');
let active;
let ready;
function say(title, detail = '', state = 'ready') {
  document.querySelector('#status').textContent = title;
  document.querySelector('#detail').textContent = detail;
  document.body.dataset.state = state;
}
function report(update) {
  progress.hidden = false; progress.max = Math.max(1, update.totalBytes); progress.value = update.bytes;
  document.querySelector('#progress-label').textContent = `${Math.floor(update.bytes / Math.max(1, update.totalBytes) * 100)}% prepared`;
  say('Packing your offline toolkit…', `${Math.round(update.bytes / 1024 / 1024)} of ${Math.ceil(update.totalBytes / 1024 / 1024)} MB. Tools already here are reused. Keep this tab open.`, 'busy');
}
async function connect() {
  if (!window.isSecureContext || !navigator.serviceWorker || !navigator.storage?.getDirectory || !navigator.locks || !window.caches) throw new Error('This browser is missing the local storage Orbit needs. Try an up-to-date Chrome or Safari, with school permission to use local website storage.');
  await verifyManifest(new TextEncoder().encode(JSON.stringify(manifest)), trust);
  const registration = await ensureReaderController(BASE);
  registration.addEventListener('updatefound', () => {
    registration.installing?.addEventListener('statechange', () => {
      if (registration.waiting) document.querySelector('#update-note').hidden = false;
    });
  });
  document.querySelector('#update-note').hidden = !registration.waiting;
}
function enter() {
  return launchWebsite({ base: BASE, releaseId: trust.releaseId, connect: () => ready });
}
async function setup() {
  ready = connect();
  await ready;
  if (!offline) { await enter(); return; }
  const complete = await cacheIsComplete(await caches.open(websiteCacheName(trust)), manifest, BASE, undefined, undefined, { metadataOnly: true });
  openButton.hidden = false;
  prepareButton.disabled = false;
  prepareButton.hidden = complete;
  if (complete) say('Ready to work offline.', 'This release’s full toolkit is stored here. Keep saving your stories before leaving.');
  else say('Optional: pack every tool.', `Orbit works online now. Prepare the full ${Math.ceil(manifest.totalBytes / 1024 / 1024)} MB toolkit only if you need every room without Wi-Fi. This does not back up your stories.`);
}
async function prepare() {
  if (active) return;
  active = new AbortController();
  prepareButton.disabled = true; openButton.hidden = true; cancel.hidden = false;
  try {
    await navigator.storage.persist?.().catch(() => false);
    await prepareOffline({ base: BASE, manifest, cache: await caches.open(websiteCacheName(trust)), signal: active.signal, onProgress: report });
    say('Ready to work offline.', 'Every tool is stored on this device. Finish session still saves your stories separately.');
    prepareButton.hidden = true;
  } catch (error) {
    say(error?.name === 'AbortError' ? 'Offline preparation paused.' : 'Not fully ready for offline use.', error?.message || 'Reconnect or free storage, then retry. You can still open Orbit online.', 'error');
  } finally { active = undefined; prepareButton.disabled = false; openButton.hidden = false; cancel.hidden = true; }
}
prepareButton?.addEventListener('click', () => void prepare());
openButton.addEventListener('click', () => {
  if (offline) window.location.assign(BASE);
  else void setup().catch(showError);
});
cancel.addEventListener('click', () => active?.abort());
window.addEventListener('beforeunload', (event) => { if (active) { event.preventDefault(); event.returnValue = ''; } });
function showError(error) {
  say('Orbit could not open yet.', error.message, 'error');
  openButton.hidden = false;
}
void setup().catch(showError);
