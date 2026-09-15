import { describe, expect, test, beforeEach, vi } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { Gate } from './gate-ingest.js';
import { DEFAULT_GATE_CONFIG } from './gate.js';
import {
  DEFAULT_SETTINGS, EXPIRY_WARNING_DAYS, FRONT_DESK_LIMIT,
  expireRelease, frontDeskQueue, getSettings, holdStory, recordRelease,
  newsroomBackup, refuseRelease, saveSettings, setAppearance,
} from './adviser.js';
import { canPublish } from './publish.js';
import { checkReviewItem, finishReview, REVIEW_CHECKS } from './newsroom.js';
import type { Store } from './store.js';
import type { User } from './types.js';

const ADVISER = { actor: 'ms-boone', role: 'ADVISER' as const };
const STUDENT = { actor: 'maya', role: 'STUDENT' as const };
const DAY = 24 * 60 * 60 * 1000;

let store: Store;
let maya: User;

/** A clean picture, through the Gate, because nothing else may make an Asset. */
async function aPicture(): Promise<string> {
  const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0.01; } });
  const result = await gate.ingest({
    bytes: new TextEncoder().encode(`a picture ${Math.random()}`),
    source: 'upload',
    meta: { kind: 'IMAGE', mime: 'image/jpeg', origin: 'UPLOAD' },
  });
  return result.assetId!;
}

/** One the checker was unsure about, so it sits in the queue. */
async function anUncertainPicture(): Promise<string> {
  const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0.4; } });
  const result = await gate.ingest({
    bytes: new TextEncoder().encode(`unsure ${Math.random()}`),
    source: 'upload',
    meta: { kind: 'IMAGE', mime: 'image/jpeg', origin: 'UPLOAD' },
  });
  return result.assetId!;
}

/** A real piece the crew has genuinely finished checking, built through the API. */
async function aStoryThroughCrewReview(title: string) {
  const story = await store.stories.create({
    title,
    channels: ['web'],
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The race begins on Friday.' }] }] },
  });
  for (const check of REVIEW_CHECKS) await checkReviewItem(store, story.id, check.id, true, 'editor');
  await finishReview(store, story.id, 'editor');
  return story;
}

beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
  maya = await store.users.create({ name: 'Maya Ruiz', penName: 'Maya R.', role: 'STUDENT', active: true });
});

describe('recording a permission slip', () => {
  test('creates the release the app could not create before', async () => {
    const release = await recordRelease(store, maya.id, ADVISER);
    expect(release.status).toBe('ON_FILE');
    expect(release.userId).toBe(maya.id);
  });

  test('keeps an expiry date when one is given', async () => {
    const when = Date.now() + 200 * DAY;
    const release = await recordRelease(store, maya.id, ADVISER, when);
    expect(release.expiresAt).toBe(when);
  });

  test('updates the existing release rather than making a second one', async () => {
    await recordRelease(store, maya.id, ADVISER);
    await refuseRelease(store, maya.id, ADVISER);

    const all = await store.releases.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe('REFUSED');
  });

  test('marks a family saying no, and marks one retired early', async () => {
    await refuseRelease(store, maya.id, ADVISER);
    expect((await store.releases.list())[0]!.status).toBe('REFUSED');

    await expireRelease(store, maya.id, ADVISER);
    expect((await store.releases.list())[0]!.status).toBe('EXPIRED');
  });

  test('writes an audit event naming who decided', async () => {
    await recordRelease(store, maya.id, ADVISER);
    const events = await store.events.all();
    const recorded = events.find((event) => event.action === 'release.recorded');
    expect(recorded?.actor).toBe('ms-boone');
  });

  test('refuses a student', async () => {
    await expect(recordRelease(store, maya.id, STUDENT)).rejects.toThrow(/teacher/);
    expect(await store.releases.list()).toHaveLength(0);
  });

  test('refuses a user who does not exist', async () => {
    await expect(recordRelease(store, 'nobody', ADVISER)).rejects.toThrow(/no user/);
  });
});

describe('saying who is in a picture', () => {
  test('arms the publish block that nothing else armed', async () => {
    const story = await store.stories.create({ title: 'Gym floor' });
    const assetId = await aPicture();

    // Before: the block has nothing to check, so the story looks fine.
    expect((await canPublish(store, story.id)).ok).toBe(true);

    await setAppearance(store, { assetId, userId: maya.id, identifiable: true, storyId: story.id }, ADVISER);

    const verdict = await canPublish(store, story.id);
    expect(verdict.ok).toBe(false);
    expect(verdict.blockers[0]!.reason).toBe('no-release');
  });

  test('and recording the slip clears it again', async () => {
    const story = await store.stories.create({ title: 'Gym floor' });
    const assetId = await aPicture();
    await setAppearance(store, { assetId, userId: maya.id, identifiable: true, storyId: story.id }, ADVISER);
    await recordRelease(store, maya.id, ADVISER);

    expect((await canPublish(store, story.id)).ok).toBe(true);
  });

  test('the back of a head in a crowd needs no permission', async () => {
    const story = await store.stories.create({ title: 'Gym floor' });
    const assetId = await aPicture();
    await setAppearance(store, { assetId, userId: maya.id, identifiable: false, storyId: story.id }, ADVISER);

    expect((await canPublish(store, story.id)).ok).toBe(true);
  });

  test('changing your mind updates the row instead of adding one', async () => {
    const assetId = await aPicture();
    await setAppearance(store, { assetId, userId: maya.id, identifiable: true }, ADVISER);
    await setAppearance(store, { assetId, userId: maya.id, identifiable: false }, ADVISER);

    const all = await store.appearances.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.identifiable).toBe(false);
  });

  test('refuses a student, and an asset that is not there', async () => {
    const assetId = await aPicture();
    await expect(setAppearance(store, { assetId, userId: maya.id, identifiable: true }, STUDENT)).rejects.toThrow(/teacher/);
    await expect(setAppearance(store, { assetId: 'nope', userId: maya.id, identifiable: true }, ADVISER)).rejects.toThrow(/no asset/);
  });
});

describe('pulling a published piece back', () => {
  async function aPublishedStory() {
    const story = await store.stories.create({ title: 'Gym floor' });
    await store.stories.update(story.id, { status: 'DONE' });
    await store.episodes.create({ title: 'Gym floor', publishedAt: Date.now(), channel: 'web', storyIds: [story.id] });
    return story;
  }

  test('moves it to HELD so it leaves public view', async () => {
    const story = await aPublishedStory();
    const held = await holdStory(store, story.id, ADVISER);
    expect(held.status).toBe('HELD');
  });

  test('keeps the frozen episode, because the record has to survive', async () => {
    const story = await aPublishedStory();
    await holdStory(store, story.id, ADVISER);
    expect(await store.episodes.list()).toHaveLength(1);
  });

  test('writes an audit event', async () => {
    const story = await aPublishedStory();
    await holdStory(store, story.id, ADVISER);
    expect((await store.events.all()).some((event) => event.action === 'story.held')).toBe(true);
  });

  test('refuses a piece that was never out', async () => {
    const story = await store.stories.create({ title: 'Not out yet' });
    await expect(holdStory(store, story.id, ADVISER)).rejects.toThrow(/already out/);
  });

  test('refuses a student', async () => {
    const story = await aPublishedStory();
    await expect(holdStory(store, story.id, STUDENT)).rejects.toThrow(/teacher/);
    expect((await store.stories.get(story.id))!.status).toBe('DONE');
  });
});

describe('newsroom settings', () => {
  test('reads defaults before anything is saved', async () => {
    expect(await getSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  test('saves a change and leaves the rest alone', async () => {
    await saveSettings(store, { takeRetentionDays: 30 }, ADVISER);
    const settings = await getSettings(store);
    expect(settings.takeRetentionDays).toBe(30);
    expect(settings.rolloverMonth).toBe(DEFAULT_SETTINGS.rolloverMonth);
  });

  test('takes a four-digit PIN and refuses anything else', async () => {
    await saveSettings(store, { adviserPin: '1234' }, ADVISER);
    expect((await getSettings(store)).adviserPin).toBe('1234');

    await expect(saveSettings(store, { adviserPin: '12' }, ADVISER)).rejects.toThrow(/four digits/);
    await expect(saveSettings(store, { adviserPin: 'abcd' }, ADVISER)).rejects.toThrow(/four digits/);
  });

  test('clearing the PIN is allowed', async () => {
    await saveSettings(store, { adviserPin: '1234' }, ADVISER);
    await saveSettings(store, { adviserPin: '' }, ADVISER);
    expect((await getSettings(store)).adviserPin).toBe('');
  });

  test('refuses a retention window under a day', async () => {
    await expect(saveSettings(store, { takeRetentionDays: 0 }, ADVISER)).rejects.toThrow(/at least a day/);
  });

  test('never writes the PIN into the audit log', async () => {
    await saveSettings(store, { adviserPin: '4321', showName: 'The Chatterbox' }, ADVISER);
    const event = (await store.events.all()).find((item) => item.action === 'settings.saved');
    expect(JSON.stringify(event?.payload)).not.toContain('4321');
    expect(JSON.stringify(event?.payload)).toContain('showName');
  });

  test('refuses a student', async () => {
    await expect(saveSettings(store, { showName: 'Mine now' }, STUDENT)).rejects.toThrow(/teacher/);
  });
});

describe('backing the newsroom up', () => {
  test('requires adviser setup even if a caller supplies a PIN', async () => {
    const readRecords = vi.spyOn(store.stories, 'list');
    await expect(newsroomBackup(store, '2468')).rejects.toThrow(/Set up adviser access/);
    expect(readRecords).not.toHaveBeenCalled();
  });

  test.each([undefined, '', '9999', '12', 'abcd'])('blocks missing or incorrect authorization before reading records (%s)', async (pin) => {
    await saveSettings(store, { adviserPin: '2468' }, ADVISER);
    const readRecords = vi.spyOn(store.stories, 'list');
    const readBlobs = vi.spyOn(store.blobs, 'list');
    const eventsBefore = await store.events.all();
    // Exercise untyped callers as well as the UI's empty-string case.
    await expect(newsroomBackup(store, pin as string)).rejects.toThrow('Enter the correct adviser PIN. No backup was created.');
    expect(readRecords).not.toHaveBeenCalled();
    expect(readBlobs).not.toHaveBeenCalled();
    expect(await store.events.all()).toEqual(eventsBefore);
    expect(JSON.stringify(eventsBefore)).not.toContain('2468');
  });

  test('uses the current PIN on every export', async () => {
    await saveSettings(store, { adviserPin: '2468' }, ADVISER);
    await newsroomBackup(store, '2468');
    await saveSettings(store, { adviserPin: '1357' }, ADVISER);
    await expect(newsroomBackup(store, '2468')).rejects.toThrow(/correct adviser PIN/);
    await expect(newsroomBackup(store, '1357')).resolves.toMatchObject({ format: 'chatter-newsroom' });
  });

  test('carries every collection, and the blob hashes', async () => {
    const story = await store.stories.create({ title: 'Gym floor' });
    const assetId = await aPicture();
    await setAppearance(store, { assetId, userId: maya.id, identifiable: true, storyId: story.id }, ADVISER);
    await store.studioProjects.create({ storyId: story.id, project: { id: 'song', name: 'Theme', bpm: 96, tracks: [] } });

    await saveSettings(store, { adviserPin: '2468' }, ADVISER);
    const backup = JSON.parse(JSON.stringify(await newsroomBackup(store, '2468')));
    expect(backup.format).toBe('chatter-newsroom');
    expect(backup.records.stories).toHaveLength(1);
    expect(backup.records.stories[0]).toMatchObject({ id: story.id, title: 'Gym floor' });
    expect(Object.values(backup.records).every(Array.isArray)).toBe(true);
    expect(backup.version).toBe(1);
    expect(backup.records.users).toHaveLength(1);
    expect(backup.records.appearances).toHaveLength(1);
    expect(backup.records.studioProjects).toHaveLength(1);
    expect(backup.blobHashes.length).toBeGreaterThan(0);
  });

  test('leaves device setup and the PIN out, because they are doors and not records', async () => {
    await saveSettings(store, {
      adviserPin: '1234', showName: 'The Chatterbox', setupVersion: 1, preferredDesk: 'ADVISER',
    }, ADVISER);
    const backup = await newsroomBackup(store, '1234');

    expect(JSON.stringify(backup)).not.toContain('1234');
    expect(JSON.stringify(backup.records.settings)).not.toContain('setupVersion');
    expect(JSON.stringify(backup.records.settings)).not.toContain('preferredDesk');
    expect(JSON.stringify(backup.records.settings)).toContain('The Chatterbox');
  });
});

describe('the Front Desk queue', () => {
  test('is empty when nothing needs the adviser', async () => {
    const queue = await frontDeskQueue(store);
    expect(queue.items).toEqual([]);
    expect(queue.more).toBe(0);
  });

  test('surfaces quarantined media, counted', async () => {
    await anUncertainPicture();
    await anUncertainPicture();

    const queue = await frontDeskQueue(store);
    expect(queue.items[0]!.kind).toBe('QUARANTINE');
    expect(queue.items[0]!.count).toBe(2);
    expect(queue.items[0]!.title).toContain('2 pictures are waiting');
  });

  test('says it in the singular when there is one', async () => {
    await anUncertainPicture();
    expect((await frontDeskQueue(store)).items[0]!.title).toContain('1 picture is waiting');
  });

  test('surfaces a piece blocked on a missing permission, and never blames the kid', async () => {
    const story = await store.stories.create({ title: 'Gym floor' });
    const assetId = await aPicture();
    await setAppearance(store, { assetId, userId: maya.id, identifiable: true, storyId: story.id }, ADVISER);

    const item = (await frontDeskQueue(store)).items.find((entry) => entry.kind === 'BLOCKED');
    expect(item?.title).toContain('Gym floor');
    expect(item?.detail).toContain('Nobody messed up');
  });

  test('does not surface a piece that is already out', async () => {
    const story = await store.stories.create({ title: 'Gym floor' });
    const assetId = await aPicture();
    await setAppearance(store, { assetId, userId: maya.id, identifiable: true, storyId: story.id }, ADVISER);
    await store.stories.update(story.id, { status: 'DONE' });

    expect((await frontDeskQueue(store)).items.some((entry) => entry.kind === 'BLOCKED')).toBe(false);
  });

  test('warns about a permission running out inside the window', async () => {
    const now = Date.now();
    await recordRelease(store, maya.id, ADVISER, now + 6 * DAY);

    const item = (await frontDeskQueue(store, now)).items.find((entry) => entry.kind === 'RELEASE_EXPIRING');
    expect(item?.title).toBe("Maya R.'s permission runs out in 6 days");
  });

  test('stays quiet about one that is not close yet', async () => {
    const now = Date.now();
    await recordRelease(store, maya.id, ADVISER, now + (EXPIRY_WARNING_DAYS + 10) * DAY);

    expect((await frontDeskQueue(store, now)).items.some((entry) => entry.kind === 'RELEASE_EXPIRING')).toBe(false);
  });

  test('ranks blocking work above dated obligations', async () => {
    const now = Date.now();
    await anUncertainPicture();
    await recordRelease(store, maya.id, ADVISER, now + 3 * DAY);

    const kinds = (await frontDeskQueue(store, now)).items.map((entry) => entry.kind);
    expect(kinds).toEqual(['QUARANTINE', 'RELEASE_EXPIRING']);
  });

  test('allows exactly one editorial line, and puts it last', async () => {
    await anUncertainPicture();
    for (const title of ['One', 'Two']) await aStoryThroughCrewReview(title);

    const items = (await frontDeskQueue(store)).items;
    const editorial = items.filter((entry) => entry.kind === 'READY_FOR_RELEASE');
    expect(editorial).toHaveLength(1);
    expect(items[items.length - 1]!.kind).toBe('READY_FOR_RELEASE');
  });

  test('caps at five and reports what did not fit', async () => {
    const now = Date.now();
    await anUncertainPicture();
    for (let index = 0; index < 6; index += 1) {
      const kid = await store.users.create({ name: `Kid ${index}`, penName: `Kid ${index}`, role: 'STUDENT', active: true });
      await recordRelease(store, kid.id, ADVISER, now + 2 * DAY);
    }

    const queue = await frontDeskQueue(store, now);
    expect(queue.items).toHaveLength(FRONT_DESK_LIMIT);
    expect(queue.more).toBe(2);
  });
});
