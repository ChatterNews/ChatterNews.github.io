import type { SessionDirectory } from './finish-session.js';
import { readReaderSelection } from './workspace-context.js';

type DriveHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
};
type Workspace = { id: string; handle: DriveHandle; name: string };
let mounted: { directory: SessionDirectory; name: string } | undefined;
let selected: Workspace | undefined;
let releaseLock: (() => void) | undefined;
let mobileReady = false;

export function isWebsiteEdition() { return import.meta.env.VITE_ORBIT_WEB === 'true'; }

export function isMobileEdition() { return import.meta.env.VITE_ORBIT_MOBILE === 'true'; }

export function getReaderDrive() { return mounted; }

async function workspace(id: string): Promise<Workspace> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('orbit-reader', 1);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Open your Story Drive in the Orbit reader first.'));
  });
  try {
    return await new Promise<Workspace>((resolve, reject) => {
      const request = database.transaction('workspaces').objectStore('workspaces').get(id);
      request.onsuccess = () => {
        const value = request.result as Workspace | undefined;
        if (!value || value.id !== id || value.handle?.kind !== 'directory') reject(new Error('Open your Story Drive in the Orbit reader again.'));
        else resolve(value);
      };
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export async function holdWorkspaceLock(locks: LockManager, id: string): Promise<() => void> {
  return new Promise((resolve, reject) => {
    void locks.request(`orbit-workspace:${id}`, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) { reject(new Error('This Story Drive is already open in another Orbit tab. Close that tab, then try again.')); return; }
      await new Promise<void>((release) => resolve(release));
    }).catch(reject);
  });
}

/** Called before any store, badge table, room or audio engine is mounted. */
export async function connectReaderDrive(askPermission = false): Promise<void> {
  const selection = readReaderSelection();
  if (!selection || mounted || mobileReady) return;
  if (!navigator.serviceWorker?.controller || !window.crossOriginIsolated) throw new Error('Orbit needs its prepared browser reader. Return to the reader and open the drive again.');
  if (!navigator.locks) throw new Error('This browser cannot keep the workspace safe between tabs. Update your browser and try again.');
  if (isWebsiteEdition() && navigator.serviceWorker.controller.scriptURL !== new URL('sw.js', new URL(import.meta.env.VITE_READER_BASE || '/', window.location.origin)).href) throw new Error('Orbit needs its own prepared website reader. Reopen the home page.');
  if (isMobileEdition() || isWebsiteEdition()) {
    if (!navigator.storage?.getDirectory || typeof SharedArrayBuffer === 'undefined') throw new Error('This browser cannot open Orbit’s media workspace. Update your browser or system and reopen Orbit.');
    if (localStorage.getItem(isWebsiteEdition() ? 'orbit-web-workspace-id' : 'orbit-mobile-workspace-id') !== selection.workspaceId) throw new Error('Open this device’s desk from the Orbit reader.');
    await navigator.storage.getDirectory();
    releaseLock = await holdWorkspaceLock(navigator.locks, selection.workspaceId);
    mobileReady = true;
    return;
  }
  selected ??= await workspace(selection.workspaceId);
  const permission = askPermission
    ? await selected.handle.requestPermission({ mode: 'readwrite' })
    : await selected.handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted') throw new Error('Reconnect your Story Drive to let Orbit save into Chatter News.');
  const unlock = await holdWorkspaceLock(navigator.locks, selection.workspaceId);
  try {
    const identity = await (await (await selected.handle.getDirectoryHandle('_Orbit')).getFileHandle('workspace.json')).getFile();
    if (identity.size > 256 || JSON.parse(await identity.text()).id !== selection.workspaceId) throw new Error('This is a different Story Drive. Return to the reader and choose it again.');
    const directory = await selected.handle.getDirectoryHandle('Chatter News', { create: true });
    mounted = { directory, name: selected.name };
    releaseLock = unlock;
  } catch (error) { unlock(); throw error; }
}

export function returnToReader() {
  releaseLock?.();
  releaseLock = undefined;
  window.location.assign(import.meta.env.VITE_READER_BASE || '/');
}
