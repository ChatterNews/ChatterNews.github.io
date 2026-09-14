import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import {
  MAX_PEN_NAME, badgeTable, createAdviser, createStudent, retireBadge,
} from './identity.js';
import type { Store } from './store.js';

let store: Store;

beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
});

describe('making a badge', () => {
  test('a kid gets in with nothing but a pen name', async () => {
    const user = await createStudent(store, { penName: 'Sam T.' });
    expect(user.penName).toBe('Sam T.');
    expect(user.role).toBe('STUDENT');
    expect(user.active).toBe(true);
  });

  test('the legal name is never asked for, so it is never stored', async () => {
    const user = await createStudent(store, { penName: 'Sam T.' });
    // SPEC S1 and rule 5: a full legal name must never reach a byline. The
    // only way to guarantee that here is to never collect one.
    expect(user.name).toBe('Sam T.');
  });

  test('keeps a grade band when the kid picks one', async () => {
    const user = await createStudent(store, { penName: 'Sam T.', gradeBand: '6th grade' });
    expect(user.gradeBand).toBe('6th grade');
  });

  test('trims the pen name, because a stray space breaks a byline', async () => {
    expect((await createStudent(store, { penName: '  Sam T.  ' })).penName).toBe('Sam T.');
  });

  test('refuses an empty pen name', async () => {
    await expect(createStudent(store, { penName: '   ' })).rejects.toThrow(/pen name/i);
    expect(await store.users.list()).toHaveLength(0);
  });

  test('refuses one that is too long to fit a badge', async () => {
    await expect(createStudent(store, { penName: 'x'.repeat(MAX_PEN_NAME + 1) })).rejects.toThrow(/shorter/i);
  });

  test('refuses a name already on the table, whatever the casing', async () => {
    await createStudent(store, { penName: 'Sam T.' });
    await expect(createStudent(store, { penName: 'sam t.' })).rejects.toThrow(/already/i);
    expect(await store.users.list()).toHaveLength(1);
  });

  test('writes an audit event', async () => {
    const user = await createStudent(store, { penName: 'Sam T.' });
    const event = (await store.events.all()).find((item) => item.action === 'badge.made');
    expect(event?.target).toBe(user.id);
  });
});

describe('the badge table', () => {
  test('shows the kids, not the adviser', async () => {
    await createStudent(store, { penName: 'Sam T.' });
    await createAdviser(store, { penName: 'Ms. Boone' });

    const badges = await badgeTable(store);
    expect(badges.map((badge) => badge.penName)).toEqual(['Sam T.']);
  });

  test('is in alphabetical order, so a kid can find themselves', async () => {
    for (const penName of ['Zoe R.', 'Ada L.', 'Marcus D.']) {
      await createStudent(store, { penName });
    }
    expect((await badgeTable(store)).map((badge) => badge.penName))
      .toEqual(['Ada L.', 'Marcus D.', 'Zoe R.']);
  });

  test('carries what each badge shows: initials, grade, jobs finished', async () => {
    const user = await createStudent(store, { penName: 'Sam T.', gradeBand: '6th grade' });
    const story = await store.stories.create({ title: 'Gym floor' });
    await store.roleAssigns.create({ userId: user.id, storyId: story.id, role: 'write', cycle: '2026' });

    const badge = (await badgeTable(store))[0]!;
    expect(badge).toMatchObject({ penName: 'Sam T.', initials: 'ST', gradeBand: '6th grade', jobsDone: 1 });
  });

  test('a kid with no jobs yet is marked as new, and that is not a failure state', async () => {
    await createStudent(store, { penName: 'Sam T.' });
    expect((await badgeTable(store))[0]).toMatchObject({ jobsDone: 0, isNew: true });
  });

  test('leaves out a retired badge', async () => {
    const user = await createStudent(store, { penName: 'Sam T.' });
    await createStudent(store, { penName: 'Ada L.' });
    await retireBadge(store, user.id, { actor: 'ms-boone', role: 'ADVISER' });

    expect((await badgeTable(store)).map((badge) => badge.penName)).toEqual(['Ada L.']);
  });
});

describe('advisers', () => {
  test('an adviser can be added mid-year, which the seed could not do', async () => {
    const user = await createAdviser(store, { penName: 'Mr. Alvarez' });
    expect(user.role).toBe('ADVISER');
    expect(user.active).toBe(true);
  });

  test('two advisers can share one newsroom', async () => {
    await createAdviser(store, { penName: 'Ms. Boone' });
    await createAdviser(store, { penName: 'Mr. Alvarez' });

    const advisers = (await store.users.list()).filter((user) => user.role === 'ADVISER');
    expect(advisers).toHaveLength(2);
  });

  test('the same name rules apply', async () => {
    await createAdviser(store, { penName: 'Ms. Boone' });
    await expect(createAdviser(store, { penName: 'ms. boone' })).rejects.toThrow(/already/i);
  });
});

describe('retiring a badge', () => {
  test('only an adviser may, and the record survives', async () => {
    const user = await createStudent(store, { penName: 'Sam T.' });

    await expect(retireBadge(store, user.id, { actor: 'kid', role: 'STUDENT' })).rejects.toThrow(/teacher/);

    await retireBadge(store, user.id, { actor: 'ms-boone', role: 'ADVISER' });
    // Deactivated, never deleted: their name is still on work they did.
    expect((await store.users.get(user.id))?.active).toBe(false);
  });

  test('removing the final adviser badge clears the device PIN for the next setup', async () => {
    const adviser = await createAdviser(store, { penName: 'Ms. Boone' });
    await store.settings.save({ adviserPin: '2468' });

    await retireBadge(store, adviser.id, { actor: adviser.id, role: 'ADVISER' });

    expect((await store.users.get(adviser.id))?.active).toBe(false);
    expect((await store.settings.get()).adviserPin).toBe('');
  });
});
