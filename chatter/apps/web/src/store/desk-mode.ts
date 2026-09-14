export type DeskMode = 'LIVE' | 'DEMO';

const DESK_MODE_KEY = 'chatter.deskMode.v1';

export function readDeskMode(storage: Storage): DeskMode {
  try { return storage.getItem(DESK_MODE_KEY) === 'DEMO' ? 'DEMO' : 'LIVE'; }
  catch { return 'LIVE'; }
}

export function enterDemoDesk(storage: Storage): void {
  storage.setItem(DESK_MODE_KEY, 'DEMO');
}

export function leaveDemoDesk(storage: Storage): void {
  try { storage.removeItem(DESK_MODE_KEY); } catch { /* a reload still falls back to live */ }
}

export function storeNameForDesk(mode: DeskMode): string {
  return mode === 'DEMO' ? 'chatter-demo' : 'chatter';
}
