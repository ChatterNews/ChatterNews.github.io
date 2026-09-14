export type RoleSession =
  | { kind: 'NONE' }
  | { kind: 'STUDENT'; userId: string }
  | { kind: 'ADVISER'; userId: string; unlocked: true };

const ROLE_SESSION_KEY = 'chatter.roleSession.v1';

export function readRoleSession(storage: Storage): RoleSession {
  try {
    const raw = storage.getItem(ROLE_SESSION_KEY);
    if (!raw) return { kind: 'NONE' };
    const value = JSON.parse(raw) as Partial<RoleSession>;
    if (value.kind === 'STUDENT' && typeof value.userId === 'string' && value.userId) {
      return { kind: 'STUDENT', userId: value.userId };
    }
    if (value.kind === 'ADVISER' && typeof value.userId === 'string' && value.userId && value.unlocked === true) {
      return { kind: 'ADVISER', userId: value.userId, unlocked: true };
    }
  } catch { /* malformed or unavailable storage starts checked out */ }
  return { kind: 'NONE' };
}

export function writeRoleSession(storage: Storage, session: RoleSession): void {
  if (session.kind === 'NONE') {
    storage.removeItem(ROLE_SESSION_KEY);
    return;
  }
  storage.setItem(ROLE_SESSION_KEY, JSON.stringify(session));
}

export function clearRoleSession(storage: Storage): void {
  try { storage.removeItem(ROLE_SESSION_KEY); } catch { /* React state still checks out */ }
}

export function isAdviserSession(session: RoleSession): session is Extract<RoleSession, { kind: 'ADVISER' }> {
  return session.kind === 'ADVISER' && session.unlocked === true;
}

export function resolveRoleSession(
  users: Array<{ id: string; role: string; active: boolean }>,
  session: RoleSession,
): RoleSession {
  if (session.kind === 'NONE') return session;
  const user = users.find((item) => item.id === session.userId && item.active);
  if (!user || user.role !== session.kind) return { kind: 'NONE' };
  return session;
}
