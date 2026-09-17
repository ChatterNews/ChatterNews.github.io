import { describe, expect, test } from 'vitest';
import {
  clearRoleSession, isAdviserSession, readRoleSession, resolveRoleSession, writeRoleSession,
} from './role-session.js';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, value); },
  };
}

describe('role session storage', () => {
  test('starts with no authority', () => {
    expect(readRoleSession(memoryStorage())).toEqual({ kind: 'NONE' });
  });

  test('round-trips a student badge for this browser session', () => {
    const storage = memoryStorage();
    writeRoleSession(storage, { kind: 'STUDENT', userId: 'student-1' });
    expect(readRoleSession(storage)).toEqual({ kind: 'STUDENT', userId: 'student-1' });
  });

  test('round-trips PIN-unlocked adviser authority for this browser session', () => {
    const storage = memoryStorage();
    writeRoleSession(storage, { kind: 'ADVISER', userId: 'teacher-1', unlocked: true });
    expect(readRoleSession(storage)).toEqual({ kind: 'ADVISER', userId: 'teacher-1', unlocked: true });
    expect(isAdviserSession(readRoleSession(storage))).toBe(true);
  });

  test('rejects malformed or presentation-only adviser state', () => {
    const storage = memoryStorage();
    storage.setItem('chatter.roleSession.v1', JSON.stringify({ kind: 'ADVISER', userId: 'teacher-1' }));
    expect(readRoleSession(storage)).toEqual({ kind: 'NONE' });
    expect(isAdviserSession({ kind: 'STUDENT', userId: 'student-1' })).toBe(false);
  });

  test('old PIN-only adviser sessions must reauthorize', () => {
    const storage = memoryStorage({ 'chatter.roleSession.v1': JSON.stringify({ kind: 'ADVISER', userId: 'teacher-1', unlocked: true }) });
    expect(readRoleSession(storage)).toEqual({ kind: 'NONE' });
  });

  test('old persistent identity keys cannot grant authority', () => {
    const storage = memoryStorage({
      'chatter.whoAmI': 'student-1',
      'chatter.whoAmI.adviser': 'teacher-1',
    });
    expect(readRoleSession(storage)).toEqual({ kind: 'NONE' });
  });

  test('checkout clears the session', () => {
    const storage = memoryStorage();
    writeRoleSession(storage, { kind: 'STUDENT', userId: 'student-1' });
    clearRoleSession(storage);
    expect(readRoleSession(storage)).toEqual({ kind: 'NONE' });
  });

  test('rejects a session when the badge role or active state does not match', () => {
    const users = [
      { id: 'student-1', role: 'STUDENT', active: true },
      { id: 'teacher-1', role: 'ADVISER', active: false },
    ];

    expect(resolveRoleSession(users, { kind: 'ADVISER', userId: 'student-1', unlocked: true }))
      .toEqual({ kind: 'NONE' });
    expect(resolveRoleSession(users, { kind: 'ADVISER', userId: 'teacher-1', unlocked: true }))
      .toEqual({ kind: 'NONE' });
    expect(resolveRoleSession(users, { kind: 'STUDENT', userId: 'student-1' }))
      .toEqual({ kind: 'STUDENT', userId: 'student-1' });
  });
});
