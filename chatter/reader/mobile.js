import { cacheIsComplete, getRelease, prepareRelease, putRelease, validateActivation, validateTrust } from './core.mjs';
import { openCartridge } from './cartridge.mjs';
import { ensureReaderController } from './control.mjs';

const BASE = new URL('./', import.meta.url);
const pick = document.querySelector('#open-app');
const input = document.querySelector('#cartridge');
const resume = document.querySelector('#resume');
const cancel = document.querySelector('#cancel');
const status = document.querySelector('#status');
const detail = document.querySelector('#detail');
const progress = document.querySelector('#progress');
let active;
let trust;
let prepared;

function say(title, message = '', state = 'ready') {
  status.textContent = title; detail.textContent = message; document.body.dataset.state = state;
}
function report(update) {
  progress.hidden = false; progress.max = Math.max(1, update.totalBytes); progress.value = update.bytes;
  document.querySelector('#progress-label').textContent = `${Math.floor(update.bytes / Math.max(1, update.totalBytes) * 100)}% prepared`;
  say('Getting your toolkit ready…', `${Math.round(update.bytes / 1024 / 1024)} of ${Math.ceil(update.totalBytes / 1024 / 1024)} MB. Keep Orbit open while it prepares.`, 'busy');
}
function enter() {
  let id = localStorage.getItem('orbit-mobile-workspace-id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('orbit-mobile-workspace-id', id); }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new Error('The local desk reference could not be read. Keep your saved files and ask your advisor for help.');
  sessionStorage.setItem('orbit-reader-current', JSON.stringify({ workspaceId: id, releaseId: trust.releaseId }));
  active = undefined;
  window.location.assign(new URL(`r/${trust.releaseId}/`, BASE));
}
async function setup() {
  if (!window.isSecureContext || !navigator.serviceWorker || !navigator.storage?.getDirectory || !navigator.locks || !window.caches) throw new Error('This browser is missing the local storage Orbit needs. Update iOS/iPadOS and open the reader in Safari.');
  await ensureReaderController(BASE);
  const reference = await fetch(new URL('trusted-release.json', BASE));
  if (!reference.ok) throw new Error('The reader release reference is unavailable. Reconnect and reload.');
  trust = validateTrust(await reference.json());
  try {
    const saved = validateActivation(await getRelease(trust.releaseId), trust.releaseId);
    if (saved.manifestSha256 === trust.manifestSha256 && await caches.has(saved.cacheName) && await cacheIsComplete(await caches.open(saved.cacheName), saved.manifest, BASE)) prepared = saved;
  } catch { /* First use needs the cartridge. */ }
  pick.disabled = false;
  if (prepared) { resume.hidden = false; pick.textContent = 'Choose another app file'; say('Your Orbit desk is ready.', 'Open Orbit. Use Finish session to make a file before leaving.'); }
  else say('Choose your Orbit file.', 'Select Orbit.orbit in Files. The app is prepared on this device; your original file stays intact.');
}
async function prepare(file) {
  if (!file || active) return;
  active = new AbortController(); const signal = active.signal;
  pick.disabled = true; resume.hidden = true; cancel.hidden = false;
  document.querySelector('#drive-name').textContent = file.name;
  try {
    const cartridge = await openCartridge(file, trust, { signal });
    const estimate = await navigator.storage.estimate();
    if (estimate.quota && estimate.quota - (estimate.usage || 0) < cartridge.manifest.totalBytes + 8 * 1024 * 1024) throw new Error('This device needs more free storage to prepare Orbit. Free space in Settings, then retry.');
    await navigator.storage.persist?.().catch(() => false);
    prepared = await prepareRelease({ ...cartridge, origin: BASE, publish: putRelease, onProgress: report, signal });
    say('Your toolkit is ready!', 'Open Orbit to start a story.'); resume.hidden = false;
  } catch (error) {
    say(error?.name === 'AbortError' ? 'Preparation stopped.' : 'Orbit could not prepare yet.', error?.message || 'Keep the Orbit file and try again.', 'error');
  } finally { active = undefined; pick.disabled = false; resume.hidden = !prepared; cancel.hidden = true; input.value = ''; }
}
pick.addEventListener('click', () => input.click());
input.addEventListener('change', () => void prepare(input.files?.[0]));
resume.addEventListener('click', () => { try { enter(); } catch (error) { say('The desk could not open.', error.message, 'error'); } });
cancel.addEventListener('click', () => active?.abort());
window.addEventListener('beforeunload', (event) => { if (active) { event.preventDefault(); event.returnValue = ''; } });
void setup().catch((error) => say('A quick setup check…', error.message, 'error'));
