import { activeWebsiteRelease, checkWebsiteUpdate } from '../../../../website/update.mjs';
import { flushStudioSaves, type Store } from '@chatter/shared';
import { flushSessionCheckpoints } from '../store/session-checkpoint.js';
import { flushPodcastSaves } from '../rooms/podcast-workspace.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function websiteRelease(baseURL = import.meta.env.BASE_URL): string | undefined {
  return /\/r\/([a-z0-9][a-z0-9._-]{0,95})\/$/i.exec(baseURL)?.[1];
}
export function websiteBase() { return new URL(import.meta.env.VITE_READER_BASE || '/', window.location.origin); }

/** The device identity stays fixed; only this tab's app-release reference changes. */
export function selectWebsiteRelease(releaseId: string, local: Pick<Storage, 'getItem'> = localStorage, session: Pick<Storage, 'setItem'> = sessionStorage) {
  const workspaceId = local.getItem('orbit-web-workspace-id');
  if (!workspaceId || !UUID.test(workspaceId) || !/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(releaseId)) throw new Error('Open Orbit from its homepage to reconnect this device’s desk.');
  session.setItem('orbit-reader-current', JSON.stringify({ workspaceId, releaseId }));
}
export async function prepareWebsiteStart(): Promise<boolean> {
  if (import.meta.env.VITE_ORBIT_WEB !== 'true') return true;
  const current = websiteRelease();
  if (!current) throw new Error('Open Orbit from its homepage.');
  // Offline reload keeps this tab's available release. Nothing clears its caches.
  const latest = navigator.onLine === false ? undefined : await checkWebsiteUpdate(websiteBase());
  if (latest && latest !== current) {
    selectWebsiteRelease(latest);
    window.location.replace(new URL(`r/${latest}/${window.location.hash}`, websiteBase()));
    return false;
  }
  selectWebsiteRelease(current);
  return true;
}
export async function saveBeforeWebsiteUpdate(store: Store, navigate: () => void) {
  // Recorder/export checkpoints reject while a job is active. Failed saves never reload.
  await flushSessionCheckpoints(store);
  await flushStudioSaves(store);
  await flushPodcastSaves(store);
  navigate();
}
export { activeWebsiteRelease, checkWebsiteUpdate };
