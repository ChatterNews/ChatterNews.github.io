import { describe, expect, test } from 'vitest';
import { mergeField, tickLamport, resolveClaim, applyStatus } from './merge.js';

describe('mergeField - per-field last-write-wins on a Lamport counter', () => {
  test('the higher counter wins', () => {
    const a = { value: 'Taco bar', lamport: 4, deviceId: 'aaa' };
    const b = { value: 'The taco bar is back', lamport: 7, deviceId: 'bbb' };
    expect(mergeField(a, b).value).toBe('The taco bar is back');
    expect(mergeField(b, a).value).toBe('The taco bar is back');
  });

  test('a wrong wall clock cannot rewrite history', () => {
    const stale = { value: 'old', lamport: 2, deviceId: 'zzz', wallClock: 4102444800000 };
    const fresh = { value: 'new', lamport: 9, deviceId: 'aaa', wallClock: 0 };
    expect(mergeField(stale, fresh).value).toBe('new');
  });

  test('ties break on deviceId so every device reaches the same answer', () => {
    const a = { value: 'A', lamport: 3, deviceId: 'aaa' };
    const b = { value: 'B', lamport: 3, deviceId: 'bbb' };
    expect(mergeField(a, b)).toEqual(mergeField(b, a));
    expect(mergeField(a, b).value).toBe('B');
  });
});

describe('tickLamport', () => {
  test('advances past every counter it has seen', () => {
    expect(tickLamport(3, [{ lamport: 9 }, { lamport: 5 }])).toBe(10);
  });

  test('still advances when nothing has come in', () => {
    expect(tickLamport(3, [])).toBe(4);
  });
});

describe('resolveClaim', () => {
  const events = [
    { actor: 'deshawn', lamport: 5, deviceId: 'bbb', draftId: 'd2' },
    { actor: 'maya', lamport: 4, deviceId: 'aaa', draftId: 'd1' },
  ];

  test('the lowest (lamport, deviceId) pair wins the story', () => {
    expect(resolveClaim(events).owner).toBe('maya');
  });

  test('ties break on deviceId without any device talking to another', () => {
    const tied = [
      { actor: 'deshawn', lamport: 4, deviceId: 'bbb', draftId: 'd2' },
      { actor: 'maya', lamport: 4, deviceId: 'aaa', draftId: 'd1' },
    ];
    expect(resolveClaim(tied).owner).toBe('maya');
  });

  test('THE INVARIANT: a losing claim is kept as an alternate, never discarded', () => {
    const { alternates } = resolveClaim(events);
    expect(alternates).toEqual([{ actor: 'deshawn', draftId: 'd2' }]);
  });

  test('a single claim has no alternates', () => {
    expect(resolveClaim([events[1]!]).alternates).toEqual([]);
  });
});

describe('applyStatus - status may not move backwards past an adviser gate', () => {
  test('a student device cannot un-approve an approved story', () => {
    const approved = { value: 'DONE' as const, lamport: 2, deviceId: 'adviser', gated: true };
    const studentEdit = { value: 'WORK' as const, lamport: 99, deviceId: 'kid', gated: false };
    expect(applyStatus(approved, studentEdit).value).toBe('DONE');
  });

  test('an adviser may still move a gated status', () => {
    const approved = { value: 'DONE' as const, lamport: 2, deviceId: 'adviser', gated: true };
    const pulled = { value: 'HELD' as const, lamport: 3, deviceId: 'adviser', gated: true };
    expect(applyStatus(approved, pulled).value).toBe('HELD');
  });

  test('ungated statuses merge by the ordinary field rule', () => {
    const a = { value: 'WORK' as const, lamport: 2, deviceId: 'kid', gated: false };
    const b = { value: 'BOOTH' as const, lamport: 5, deviceId: 'kid', gated: false };
    expect(applyStatus(a, b).value).toBe('BOOTH');
  });
});
