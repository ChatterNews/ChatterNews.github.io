import { workspaceStorage } from '../portable/workspace-context.js';
export const REILY_SESSION_KEY = 'chatter.reily.hint.seen';
export const REILY_POCKET_KEY = 'chatter.reily.pocket';
const REILY_SEEN_PREFIX = 'chatter.reily.seen.';
const REILY_SEEN_LIMIT = 500;

export type ReilyHintAction = 'ASK' | 'DISMISS' | 'ROOM_CHANGED';
export type ReilyPocketAction = 'PARK' | 'RETURN' | 'ROOM_CHANGED';

export function initialReilyHintOpen(sessionValue: string | null): boolean {
  return sessionValue !== 'seen';
}

export function reduceReilyHint(open: boolean, action: ReilyHintAction): boolean {
  if (action === 'ASK') return true;
  if (action === 'DISMISS') return false;
  return open;
}

export function initialReilyParked(storageValue: string | null): boolean {
  return storageValue === 'parked';
}

export function readReilyPocket(suppliedStorage?: Pick<Storage, 'getItem'>): boolean {
  const storage = suppliedStorage ?? (typeof window !== 'undefined' ? workspaceStorage(window.localStorage) : undefined);
  try { return initialReilyParked(storage?.getItem(REILY_POCKET_KEY) ?? null); }
  catch { return false; }
}

export function writeReilyPocket(parked: boolean, suppliedStorage?: Pick<Storage, 'setItem'>): void {
  const storage = suppliedStorage ?? (typeof window !== 'undefined' ? workspaceStorage(window.localStorage) : undefined);
  try { storage?.setItem(REILY_POCKET_KEY, parked ? 'parked' : 'open'); }
  catch { /* Storage is optional on locked-down browsers. */ }
}

export function reduceReilyPocket(parked: boolean, action: ReilyPocketAction): boolean {
  if (action === 'PARK') return true;
  if (action === 'RETURN') return false;
  return parked;
}

export interface ReilySeenMemory {
  read(): string[];
  mark(id: string): string[];
  replace(ids: string[]): string[];
}

export function reilySeenKey(userId: string): string {
  return `${REILY_SEEN_PREFIX}${userId}`;
}

function sanitizeSeenIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  return ids.slice(-REILY_SEEN_LIMIT);
}

export function createReilySeenMemory(
  userId: string,
  suppliedStorage?: Pick<Storage, 'getItem' | 'setItem'>,
): ReilySeenMemory {
  const storage = suppliedStorage ?? (typeof window !== 'undefined' ? workspaceStorage(window.localStorage) : undefined);
  const key = reilySeenKey(userId);
  let fallback: string[] = [];

  try {
    fallback = sanitizeSeenIds(JSON.parse(storage?.getItem(key) ?? '[]'));
  } catch {
    fallback = [];
  }

  function persist(ids: string[]): string[] {
    fallback = sanitizeSeenIds(ids);
    try { storage?.setItem(key, JSON.stringify(fallback)); }
    catch { /* Locked-down browsers keep the session copy. */ }
    return [...fallback];
  }

  return {
    read: () => [...fallback],
    mark: (id) => persist([...fallback, id]),
    replace: (ids) => persist(ids),
  };
}
