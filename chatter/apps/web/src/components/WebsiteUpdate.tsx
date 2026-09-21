import { LoadingStatus } from './LoadingStatus.js';
import { useEffect, useState } from 'react';
import { useStore } from '../store/StoreProvider.js';
import { activeWebsiteRelease, checkWebsiteUpdate, saveBeforeWebsiteUpdate, websiteBase, websiteRelease } from '../portable/website-update.js';

export function WebsiteUpdate() {
  const store = useStore();
  const [latest, setLatest] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (import.meta.env.VITE_ORBIT_WEB !== 'true') return;
    let alive = true;
    let checking = false;
    const show = (release?: string) => { if (alive && release && release !== websiteRelease()) setLatest(release); };
    const changed = () => { void activeWebsiteRelease(navigator.serviceWorker).then(show); };
    const check = async () => {
      if (checking || document.visibilityState === 'hidden' || !navigator.onLine) return;
      checking = true;
      try { show(await checkWebsiteUpdate(websiteBase())); } finally { checking = false; }
    };
    changed();
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    const interval = window.setInterval(check, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(interval); navigator.serviceWorker.removeEventListener('controllerchange', changed); window.removeEventListener('online', check); document.removeEventListener('visibilitychange', check); };
  }, []);
  if (import.meta.env.VITE_ORBIT_WEB !== 'true') return null;
  async function update() {
    setBusy(true); setError('');
    try { await saveBeforeWebsiteUpdate(store, () => window.location.assign(new URL(window.location.hash, websiteBase()))); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Your work did not finish saving. Keep this tab open and retry.'); setBusy(false); }
  }
  return <section className="display-install" aria-label="Orbit updates">
    <b>{latest ? 'An Orbit update is ready' : 'Orbit updates automatically on opening or refresh'}</b>
    <p>{latest ? 'Your current tools keep working. Save open edits and switch when you’re ready.' : 'An active lesson is never reloaded automatically. Offline, keep using the available version.'}</p>
    {latest && <button type="button" disabled={busy} onClick={() => void update()}>{busy ? 'Saving edits…' : 'Save and update'}</button>}
    {busy && <LoadingStatus label="Saving before updating…" detail="Saving open edits, then opening the new version." />}
    {error && <p role="alert">{error}</p>}
    <small>Version {websiteRelease()?.replace(/^web-/, '').slice(0, 7)}</small>
  </section>;
}
