import { workspaceStorage } from '../portable/workspace-context.js';
/**
 * Who is using this.
 *
 * SPEC S1 - students need no email, so Chatter uses local press badges rather
 * than accounts. The active badge lasts for one browser session. Adviser
 * authority exists only after a staff badge and the device PIN agree.
 */
import { useCallback, useEffect, useState } from 'react';
import { verifyAdviserAuthorization, verifyAdviserPin, type Store, type User } from '@chatter/shared';
import {
  clearRoleSession, readRoleSession, resolveRoleSession, writeRoleSession,
  type RoleSession,
} from './role-session.js';

const PREFERRED_ADVISER_KEY = 'chatter.preferredAdviser.v1';

function sessionStore(): Storage | undefined {
  try { return workspaceStorage(window.sessionStorage); } catch { return undefined; }
}

function localStore(): Storage | undefined {
  try { return workspaceStorage(window.localStorage); } catch { return undefined; }
}

export interface RoleIdentity {
  loaded: boolean;
  session: RoleSession;
  me?: User;
  students: User[];
  advisers: User[];
  preferredAdviserId?: string;
  chooseStudent: (userId: string) => Promise<boolean>;
  unlockAdviser: (userId: string, pin: string, authorizationCode: string) => Promise<boolean>;
  switchAdviser: (userId: string) => Promise<boolean>;
  checkout: () => void;
  refresh: () => void;
}

export function useRoleIdentity(store: Store | null): RoleIdentity {
  const [users, setUsers] = useState<User[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [session, setSession] = useState<RoleSession>(() => {
    const storage = sessionStore();
    return storage ? readRoleSession(storage) : { kind: 'NONE' };
  });
  const [preferredAdviserId, setPreferredAdviserId] = useState<string | undefined>(() => {
    try { return localStore()?.getItem(PREFERRED_ADVISER_KEY) ?? undefined; } catch { return undefined; }
  });

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void store.users.list().then((rows: User[]) => {
      if (cancelled) return;
      const active = rows.filter((user) => user.active);
      setUsers(active);
      setSession((current) => {
        const valid = resolveRoleSession(active, current);
        if (valid.kind === 'NONE' && current.kind !== 'NONE') {
          const storage = sessionStore();
          if (storage) clearRoleSession(storage);
        }
        return valid;
      });
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [store, revision]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const persistSession = useCallback((next: RoleSession) => {
    setSession(next);
    const storage = sessionStore();
    if (storage) writeRoleSession(storage, next);
  }, []);

  const chooseStudent = useCallback(async (userId: string) => {
    const user = users.find((item) => item.id === userId) ?? await store?.users.get(userId) as User | undefined;
    if (!user || user.role !== 'STUDENT' || !user.active) return false;
    persistSession({ kind: 'STUDENT', userId });
    return true;
  }, [persistSession, store, users]);

  const rememberAdviser = useCallback((userId: string) => {
    setPreferredAdviserId(userId);
    try { localStore()?.setItem(PREFERRED_ADVISER_KEY, userId); } catch { /* preference is optional */ }
  }, []);

  const unlockAdviser = useCallback(async (userId: string, pin: string, authorizationCode: string) => {
    if (!store) return false;
    const user = users.find((item) => item.id === userId) ?? await store.users.get(userId) as User | undefined;
    if (!user || user.role !== 'ADVISER' || !user.active) return false;
    if (!await verifyAdviserAuthorization(authorizationCode)) return false;
    if (!await verifyAdviserPin(store, pin)) return false;
    persistSession({ kind: 'ADVISER', userId, unlocked: true });
    rememberAdviser(userId);
    return true;
  }, [persistSession, rememberAdviser, store, users]);

  const switchAdviser = useCallback(async (userId: string) => {
    if (session.kind !== 'ADVISER'
      || !store) return false;
    const user = users.find((item) => item.id === userId) ?? await store.users.get(userId) as User | undefined;
    if (!user || user.role !== 'ADVISER' || !user.active) return false;
    persistSession({ kind: 'ADVISER', userId, unlocked: true });
    rememberAdviser(userId);
    return true;
  }, [persistSession, rememberAdviser, session.kind, store, users]);

  const checkout = useCallback(() => {
    setSession({ kind: 'NONE' });
    const storage = sessionStore();
    if (storage) clearRoleSession(storage);
  }, []);

  const students = users.filter((user) => user.role === 'STUDENT');
  const advisers = users.filter((user) => user.role === 'ADVISER');
  const me = session.kind === 'NONE' ? undefined : users.find((user) => user.id === session.userId);

  return {
    loaded, session, ...(me ? { me } : {}), students, advisers,
    ...(preferredAdviserId ? { preferredAdviserId } : {}),
    chooseStudent, unlockAdviser, switchAdviser, checkout, refresh,
  };
}
