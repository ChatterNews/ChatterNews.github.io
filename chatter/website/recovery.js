import { checkWebsiteUpdate } from './update.mjs';
const base = new URL('./', import.meta.url);
const button = document.querySelector('#retry');
const status = document.querySelector('#recovery-status');
let busy = false;
async function retry() {
  if (busy) return;
  busy = true; button.disabled = true;
  status.textContent = 'Checking the connection and opening Orbit…';
  try {
    const release = await checkWebsiteUpdate(base);
    if (!release) throw new Error('not ready');
    const response = await fetch(new URL(`r/${release}/`, base), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok || !response.headers.get('X-Orbit-SHA256')) throw new Error('not ready');
    // The homepage reconnects the same local desk and preserves the room fragment.
    window.location.replace(new URL(window.location.hash, base));
  } catch {
    status.textContent = navigator.onLine === false
      ? 'This device is offline and a required tool is missing. Reconnect; Orbit will retry automatically. Your saved work stays here.'
      : 'Orbit could not finish opening. Check the connection or school access settings, then press Try again. Your saved work stays here.';
  } finally { busy = false; button.disabled = false; }
}
button.addEventListener('click', retry);
window.addEventListener('online', retry);
navigator.serviceWorker?.addEventListener('controllerchange', retry);
void retry();
