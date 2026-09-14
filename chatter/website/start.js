import { cacheIsComplete, getRelease, prepareRelease, putRelease, validateActivation, verifyManifest } from './core.mjs';
import { ensureReaderController } from './control.mjs';
import { manifest, trust } from './release.mjs';

const BASE = new URL('./', import.meta.url);
const prepareButton = document.querySelector('#prepare');
const openButton = document.querySelector('#resume');
const cancel = document.querySelector('#cancel');
const progress = document.querySelector('#progress');
let active;
let prepared;
function say(title, detail = '', state = 'ready') {
  document.querySelector('#status').textContent = title;
  document.querySelector('#detail').textContent = detail;
  document.body.dataset.state = state;
}
function report(update) {
  progress.hidden = false; progress.max = Math.max(1, update.totalBytes); progress.value = update.bytes;
  const checking = update.phase === 'checking';
  document.querySelector('#progress-label').textContent = `${Math.floor(update.bytes / Math.max(1, update.totalBytes) * 100)}% ${checking ? 'checked' : 'prepared'}`;
  say(checking ? 'Checking your toolkit…' : 'Getting your toolkit ready…', `${Math.round(update.bytes / 1024 / 1024)} of ${Math.ceil(update.totalBytes / 1024 / 1024)} MB. Keep this tab open.`, 'busy');
}
async function setup() {
  if (!window.isSecureContext || !navigator.serviceWorker || !navigator.storage?.getDirectory || !navigator.locks || !window.caches) throw new Error('This browser is missing the local storage Orbit needs. Try an up-to-date Chrome or Safari, with school permission to use local website storage.');
  await verifyManifest(new TextEncoder().encode(JSON.stringify(manifest)), trust);
  const registration = await ensureReaderController(BASE);
  registration.addEventListener('updatefound', () => {
    registration.installing?.addEventListener('statechange', () => {
      if (registration.waiting) document.querySelector('#update-note').hidden = false;
    });
  });
  document.querySelector('#update-note').hidden = !registration.waiting;
  try {
    const saved = validateActivation(await getRelease(trust.releaseId), trust.releaseId);
    if (saved.manifestSha256 === trust.manifestSha256 && await caches.has(saved.cacheName) && await cacheIsComplete(await caches.open(saved.cacheName), manifest, BASE, undefined, undefined, { metadataOnly: true })) prepared = saved;
  } catch { /* A fresh browser needs preparation. Recovery data is untouched. */ }
  prepareButton.disabled = false;
  if (prepared) { openButton.hidden = false; prepareButton.hidden = true; say('Your Orbit desk is ready.', 'Open Orbit. Finish session before leaving to keep an editable file.'); }
  else say('One small setup. A whole newsroom.', `Prepare ${Math.ceil(manifest.totalBytes / 1024 / 1024)} MB of tools on this device. Afterward, Orbit works from its local copy. Use school Wi-Fi for setup.`);
}
async function prepare() {
  if (active) return;
  active = new AbortController(); const signal = active.signal;
  prepareButton.disabled = true; openButton.hidden = true; cancel.hidden = false;
  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.quota && estimate.quota - (estimate.usage || 0) < manifest.totalBytes + 8 * 1024 * 1024) throw new Error('Free some device storage, then try preparing Orbit again.');
    await navigator.storage.persist?.().catch(() => false);
    prepared = await prepareRelease({ manifest, manifestSha256: trust.manifestSha256, origin: BASE, publish: putRelease, onProgress: report, signal,
      async loadFile(path) {
        const response = await fetch(new URL(`downloads/${manifest.releaseId}/${path.split('/').map(encodeURIComponent).join('/')}`, BASE), { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
        if (!response.ok) throw new Error('An app download did not finish. Check your connection and retry preparation.');
        return response.blob();
      },
    });
    say('Your toolkit is ready!', 'Open Orbit to start a story.'); prepareButton.hidden = true;
  } catch (error) {
    say(error?.name === 'AbortError' ? 'Preparation stopped.' : 'Orbit could not prepare yet.', error?.message || 'Check your connection and free storage, then retry.', 'error');
  } finally { active = undefined; prepareButton.disabled = false; openButton.hidden = !prepared; cancel.hidden = true; }
}
function enter() {
  let id = localStorage.getItem('orbit-web-workspace-id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('orbit-web-workspace-id', id); }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new Error('The local desk reference could not be read. Keep your saved files and ask your advisor for help.');
  sessionStorage.setItem('orbit-reader-current', JSON.stringify({ workspaceId: id, releaseId: trust.releaseId }));
  window.location.assign(new URL(`r/${trust.releaseId}/`, BASE));
}
prepareButton.addEventListener('click', () => void prepare());
openButton.addEventListener('click', () => { try { enter(); } catch (error) { say('The desk could not open.', error.message, 'error'); } });
cancel.addEventListener('click', () => active?.abort());
window.addEventListener('beforeunload', (event) => { if (active) { event.preventDefault(); event.returnValue = ''; } });
void setup().catch((error) => say('A quick setup check…', error.message, 'error'));
