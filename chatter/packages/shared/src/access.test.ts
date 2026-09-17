import { describe, expect, test } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { createAdviser, createStudent } from './identity.js';
import { setupAdviser } from './first-run.js';
import { newsroomBackup } from './adviser.js';
import { schoolTime, setStudentAccessException, studentAccessAllowed, verifyAdviserAuthorization } from './access.js';
const at = (value: string) => Date.parse(value);

describe('classroom access', () => {
  test.each([
    ['2026-09-18T18:59:59Z', false], ['2026-09-18T19:00:00Z', true],
    ['2026-09-18T21:59:59Z', true], ['2026-09-18T22:00:00Z', false],
    ['2026-09-19T19:00:00Z', false], ['2026-09-20T19:00:00Z', false],
    ['2026-09-21T19:00:00Z', true], ['2026-12-14T19:59:59Z', false],
    ['2026-12-14T20:00:00Z', true], ['2026-12-14T23:00:00Z', false],
  ])('uses Eastern weekday hours at %s', (date, expected) => {
    expect(studentAccessAllowed('student', [], at(date))).toBe(expected);
  });
  test('dated grants are inclusive Eastern dates, specific to one badge, and expire', () => {
    const grants = [{ userId: 'maya', from: '2026-09-19', through: '2026-09-20' }];
    expect(studentAccessAllowed('maya', grants, at('2026-09-19T03:59:59Z'))).toBe(false);
    expect(studentAccessAllowed('maya', grants, at('2026-09-19T04:00:00Z'))).toBe(true);
    expect(studentAccessAllowed('maya', grants, at('2026-09-21T03:59:59Z'))).toBe(true);
    expect(studentAccessAllowed('maya', grants, at('2026-09-21T04:00:00Z'))).toBe(false);
    expect(studentAccessAllowed('other', grants, at('2026-09-19T12:00:00Z'))).toBe(false);
    expect(schoolTime(at('2026-09-19T02:00:00Z')).date).toBe('2026-09-18');
  });
  test('missing, wrong and malformed codes cannot create or claim staff badges', async () => {
    const store = new MemoryStore(); await store.open();
    for (const authorizationCode of ['', '0000', 'abcd', '18950']) {
      expect(await verifyAdviserAuthorization(authorizationCode)).toBe(false);
      await expect(createAdviser(store, { penName: 'Staff', authorizationCode })).rejects.toThrow(/authorization code/);
      await expect(setupAdviser(store, { penName: 'Staff', pin: '2468', authorizationCode })).rejects.toThrow(/authorization code/);
    }
    expect(await store.users.list()).toEqual([]);
    expect(await store.events.all()).toEqual([]);
    expect(await store.settings.get()).not.toHaveProperty('adviserPin');
  });
  test('grant/revoke operations require authorization and omit codes/grants from backups', async () => {
    const store = new MemoryStore(); await store.open();
    const adviser = await setupAdviser(store, { penName: 'Staff', pin: '2468', authorizationCode: '1895' });
    const student = await createStudent(store, { penName: 'Maya' });
    const grant = { userId: student.id, from: '2099-09-19', through: '2099-09-20' };
    await expect(setStudentAccessException(store, grant, '', adviser.id)).rejects.toThrow(/authorization/);
    await expect(setStudentAccessException(store, grant, '1895', student.id)).rejects.toThrow(/adviser/);
    await expect(setStudentAccessException(store, { ...grant, through: '2099-02-30' }, '1895', adviser.id)).rejects.toThrow(/date range/);
    expect((await store.settings.get()).studentAccessExceptions).toBeUndefined();
    await setStudentAccessException(store, grant, '1895', adviser.id);
    expect((await store.settings.get()).studentAccessExceptions).toEqual([grant]);
    const backup = JSON.stringify(await newsroomBackup(store, '2468'));
    expect(backup).not.toContain('studentAccessExceptions');
    expect(backup).not.toContain('1895');
    expect(backup).not.toContain('2468');
    await expect(setStudentAccessException(store, { userId: student.id }, '0000', adviser.id)).rejects.toThrow(/authorization/);
    await setStudentAccessException(store, { userId: student.id }, '1895', adviser.id);
    expect((await store.settings.get()).studentAccessExceptions).toEqual([]);
  });
});
