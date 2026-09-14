import { beforeEach, describe, expect, test } from 'vitest';
import { MemoryStore } from './store-memory.js';
import type { Store } from './store.js';
import { createAdviser } from './identity.js';
import {
  completeDeviceSetup, firstRunState, resetDeviceCheckIn, setupAdviser, verifyAdviserPin,
} from './first-run.js';

let store: Store;

beforeEach(async () => {
  store = new MemoryStore('first-run-device');
  await store.open();
});

describe('adviser setup', () => {
  test('creates the first adviser and records the device PIN', async () => {
    const adviser = await setupAdviser(store, { penName: 'Ms. Rivera', pin: '2468' });

    expect(adviser).toMatchObject({ penName: 'Ms. Rivera', role: 'ADVISER', active: true });
    expect(await verifyAdviserPin(store, '2468')).toBe(true);
    expect(await verifyAdviserPin(store, '9999')).toBe(false);
    expect(await firstRunState(store)).toBe('CONFIGURED');
  });

  test('legacy setup reuses an adviser without replacing existing work', async () => {
    const adviser = await createAdviser(store, { penName: 'Mr. Alvarez' });
    const story = await store.stories.create({ title: 'Solar race' });

    const selected = await setupAdviser(store, { adviserId: adviser.id, pin: '1357' });

    expect(selected.id).toBe(adviser.id);
    expect(await store.stories.get(story.id)).toMatchObject({ title: 'Solar race' });
  });

  test('rejects malformed PINs before creating an adviser', async () => {
    await expect(setupAdviser(store, { penName: 'Ms. Rivera', pin: '12' })).rejects.toThrow(/four digits/i);
    await expect(setupAdviser(store, { penName: 'Ms. Rivera', pin: 'abcd' })).rejects.toThrow(/four digits/i);
    expect(await store.users.list()).toEqual([]);
  });

  test('refuses to set up with a student badge', async () => {
    const student = await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT', active: true });
    await expect(setupAdviser(store, { adviserId: student.id, pin: '2468' })).rejects.toThrow(/adviser badge/i);
  });
});

describe('first-run state', () => {
  test('an empty browser stays empty until setup is chosen', async () => {
    expect(await firstRunState(store)).toBe('EMPTY');
    expect(await store.users.list()).toEqual([]);
    expect(await store.stories.list()).toEqual([]);
  });

  test('records without a setup marker are legacy work, not an empty browser', async () => {
    await store.stories.create({ title: 'Book fair' });
    expect(await firstRunState(store)).toBe('LEGACY');
  });

  test('completes student setup without replacing existing work', async () => {
    const story = await store.stories.create({ title: 'Book fair' });
    await completeDeviceSetup(store, 'STUDENT');

    expect(await firstRunState(store)).toBe('CONFIGURED');
    expect(await store.stories.get(story.id)).toMatchObject({ title: 'Book fair' });
    expect(await store.settings.get()).toMatchObject({ setupVersion: 1, preferredDesk: 'STUDENT' });
  });

  test('requires the configured adviser PIN before resetting desk setup', async () => {
    const adviser = await setupAdviser(store, { penName: 'Ms. Rivera', pin: '2468' });
    const student = await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT', active: true });
    const story = await store.stories.create({ title: 'Book fair', bylineIds: [student.id] });

    await expect(resetDeviceCheckIn(store)).rejects.toThrow(/adviser PIN/i);
    expect(await firstRunState(store)).toBe('CONFIGURED');
    expect(await store.stories.get(story.id)).toMatchObject({ title: 'Book fair' });

    await resetDeviceCheckIn(store, '2468');

    expect(await firstRunState(store)).toBe('LEGACY');
    expect(await verifyAdviserPin(store, '2468')).toBe(false);
    expect(await store.users.get(adviser.id)).toMatchObject({ active: true });
    expect(await store.users.get(student.id)).toMatchObject({ active: true });
    expect(await store.stories.get(story.id)).toMatchObject({ title: 'Book fair', bylineIds: [student.id] });
    expect(await store.settings.get()).toMatchObject({ setupVersion: undefined, preferredDesk: undefined, adviserPin: '' });
  });

  test('lets an older newsroom without a PIN recover its check-in without losing work', async () => {
    const student = await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT', active: true });
    const story = await store.stories.create({ title: 'Book fair', bylineIds: [student.id] });

    expect(await firstRunState(store)).toBe('LEGACY');
    await resetDeviceCheckIn(store);

    expect(await firstRunState(store)).toBe('LEGACY');
    expect(await store.users.get(student.id)).toMatchObject({ active: true });
    expect(await store.stories.get(story.id)).toMatchObject({ title: 'Book fair', bylineIds: [student.id] });
  });
});
