import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { canPublish, publishStory } from './publish.js';
import type { Store } from './store.js';
import { checkReviewItem, finishReview, REVIEW_CHECKS } from './newsroom.js';
import { saveDeliverable } from './deliverables.js';

const YEAR = 365 * 24 * 60 * 60 * 1000;

let store: Store;
let storyId: string;
const RECEIPT = {
  destinations: [{ platform: 'School website', url: 'https://school.example/news/gym-floor' }],
  publishedAt: 1_800_000_000_000,
  note: 'Posted after the Friday newsletter went out.',
};

beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
  storyId = (await store.stories.create({ title: 'Gym floor', status: 'REVIEW' })).id;
});

/** A picture with somebody identifiable in it, attached to the story. */
async function photoOf(userIds: string[]) {
  const asset = await store.assets.unsafeCreate({
    kind: 'IMAGE', origin: 'UPLOAD', sha256: `sha256:${userIds.join('')}`,
    path: 'p', mime: 'image/jpeg', bytes: 10, gateStatus: 'APPROVED',
  });
  for (const userId of userIds) {
    await store.appearances.create({ assetId: asset.id, storyId, userId, identifiable: true });
  }
  return asset;
}

describe('canPublish - the publish block', () => {
  test('checks credited media even when nobody is identifiable in it', async () => {
    const asset = await store.assets.unsafeCreate({ kind: 'IMAGE', origin: 'UPLOAD', sha256: 'sha256:credited', path: 'p', mime: 'image/png', bytes: 10, gateStatus: 'QUARANTINED' });
    await store.credits.create({ assetId: asset.id, storyId, usedIn: 'desk' });
    expect((await canPublish(store, storyId)).blockers).toMatchObject([{ reason: 'picture-not-checked', assetId: asset.id }]);
  });

  test('reports a missing recorded attachment instead of treating it as clear', async () => {
    await store.takes.create({ storyId, assetId: 'missing-take', userId: 'presenter', durationSec: 20 });
    expect((await canPublish(store, storyId)).blockers).toMatchObject([{ reason: 'missing-media', assetId: 'missing-take' }]);
  });

  test('a story with nobody in it can go out', async () => {
    const verdict = await canPublish(store, storyId);
    expect(verdict.ok).toBe(true);
  });

  test('BLOCKS when an identifiable minor has no release on file', async () => {
    const jordan = await store.users.create({ name: 'Jordan P.', penName: 'Jordan P.', role: 'STUDENT' });
    await photoOf([jordan.id]);

    const verdict = await canPublish(store, storyId);
    expect(verdict.ok).toBe(false);
    expect(verdict.blockers[0]!.reason).toBe('no-release');
  });

  test('BLOCKS when the release has expired', async () => {
    const aisha = await store.users.create({ name: 'Aisha M.', penName: 'Aisha M.', role: 'STUDENT' });
    await store.releases.create({ userId: aisha.id, status: 'ON_FILE', expiresAt: Date.now() - YEAR });
    await photoOf([aisha.id]);

    const verdict = await canPublish(store, storyId);
    expect(verdict.ok).toBe(false);
    expect(verdict.blockers[0]!.reason).toBe('release-expired');
  });

  test('BLOCKS when a family refused', async () => {
    const kid = await store.users.create({ name: 'Sam O.', penName: 'Sam O.', role: 'STUDENT' });
    await store.releases.create({ userId: kid.id, status: 'REFUSED' });
    await photoOf([kid.id]);

    const verdict = await canPublish(store, storyId);
    expect(verdict.ok).toBe(false);
    expect(verdict.blockers[0]!.reason).toBe('release-refused');
  });

  test('allows a valid, unexpired release', async () => {
    const maya = await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT' });
    await store.releases.create({ userId: maya.id, status: 'ON_FILE', expiresAt: Date.now() + YEAR });
    await photoOf([maya.id]);

    expect((await canPublish(store, storyId)).ok).toBe(true);
  });

  test('a release with no expiry date does not expire', async () => {
    const maya = await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT' });
    await store.releases.create({ userId: maya.id, status: 'ON_FILE' });
    await photoOf([maya.id]);

    expect((await canPublish(store, storyId)).ok).toBe(true);
  });

  test('somebody who is in the picture but not identifiable does not block it', async () => {
    const kid = await store.users.create({ name: 'Theo B.', penName: 'Theo B.', role: 'STUDENT' });
    const asset = await store.assets.unsafeCreate({
      kind: 'IMAGE', origin: 'UPLOAD', sha256: 'sha256:back-of-head',
      path: 'p', mime: 'image/jpeg', bytes: 10, gateStatus: 'APPROVED',
    });
    await store.appearances.create({ assetId: asset.id, storyId, userId: kid.id, identifiable: false });

    expect((await canPublish(store, storyId)).ok).toBe(true);
  });

  test('names every person who is blocking it, not just the first', async () => {
    const a = await store.users.create({ name: 'A', penName: 'A R.', role: 'STUDENT' });
    const b = await store.users.create({ name: 'B', penName: 'B T.', role: 'STUDENT' });
    await photoOf([a.id, b.id]);

    const verdict = await canPublish(store, storyId);
    expect(verdict.blockers).toHaveLength(2);
    expect(verdict.blockers.map((x) => x.penName).sort()).toEqual(['A R.', 'B T.']);
  });

  test('a quarantined picture also blocks publishing', async () => {
    await store.assets.unsafeCreate({
      kind: 'IMAGE', origin: 'UPLOAD', sha256: 'sha256:waiting',
      path: 'p', mime: 'image/jpeg', bytes: 10, gateStatus: 'QUARANTINED',
    }).then((asset) => store.appearances.create({
      assetId: asset.id, storyId, userId: 'nobody', identifiable: false,
    }));

    const verdict = await canPublish(store, storyId);
    expect(verdict.ok).toBe(false);
    expect(verdict.blockers[0]!.reason).toBe('picture-not-checked');
  });

  test('the block explains itself in language a kid reads', async () => {
    const kid = await store.users.create({ name: 'Jordan P.', penName: 'Jordan P.', role: 'STUDENT' });
    await photoOf([kid.id]);

    const verdict = await canPublish(store, storyId);
    expect(verdict.blockers[0]!.say).toMatch(/Jordan P\./);
    expect(verdict.blockers[0]!.say).not.toMatch(/release|RELEASE/);
  });
});

describe('publishStory - the block has teeth', () => {
  test('REFUSES to publish when a release is missing', async () => {
    const kid = await store.users.create({ name: 'Jordan P.', penName: 'Jordan P.', role: 'STUDENT' });
    await photoOf([kid.id]);

    await expect(publishStory(store, storyId, { actor: 'adviser', receipt: RECEIPT }))
      .rejects.toThrow(/cannot go out/i);
  });

  test('REFUSES to publish when the release has expired', async () => {
    const kid = await store.users.create({ name: 'Aisha M.', penName: 'Aisha M.', role: 'STUDENT' });
    await store.releases.create({ userId: kid.id, status: 'ON_FILE', expiresAt: Date.now() - YEAR });
    await photoOf([kid.id]);

    await expect(publishStory(store, storyId, { actor: 'adviser', receipt: RECEIPT }))
      .rejects.toThrow(/cannot go out/i);
  });

  test('a refused publish leaves the story exactly where it was', async () => {
    const kid = await store.users.create({ name: 'Jordan P.', penName: 'Jordan P.', role: 'STUDENT' });
    await photoOf([kid.id]);

    await expect(publishStory(store, storyId, { actor: 'adviser', receipt: RECEIPT })).rejects.toThrow();
    expect((await store.stories.get(storyId))!.status).toBe('REVIEW');
    expect(await store.episodes.list()).toHaveLength(0);
  });

  test('publishes when everything is in order', async () => {
    const maya = await store.users.create({ name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT' });
    await store.releases.create({ userId: maya.id, status: 'ON_FILE', expiresAt: Date.now() + YEAR });
    await photoOf([maya.id]);

    await publishStory(store, storyId, { actor: 'adviser', receipt: RECEIPT });
    expect((await store.stories.get(storyId))!.status).toBe('DONE');
    const episodes = await store.episodes.list();
    expect(episodes).toHaveLength(1);
    expect(episodes[0]!.stories?.[0]).toMatchObject({ storyId, title: 'Gym floor' });
    expect(episodes[0]!.receipt).toEqual({ ...RECEIPT, adviserId: 'adviser' });
    await store.stories.update(storyId, { title: 'Changed after publication' });
    expect(episodes[0]!.stories?.[0]?.title).toBe('Gym floor');
  });

  test('only an adviser may publish', async () => {
    await expect(publishStory(store, storyId, { actor: 'student', role: 'STUDENT', receipt: RECEIPT }))
      .rejects.toThrow(/teacher/i);
  });

  test('a refusal is written to the audit log, not just shown on screen', async () => {
    const kid = await store.users.create({ name: 'Jordan P.', penName: 'Jordan P.', role: 'STUDENT' });
    await photoOf([kid.id]);

    await expect(publishStory(store, storyId, { actor: 'adviser', receipt: RECEIPT })).rejects.toThrow();
    const refused = (await store.events.all()).find((e) => e.action === 'publish.refused');
    expect(refused).toBeTruthy();
    expect((refused!.payload as any).reasons).toContain('no-release');
  });

  test('REFUSES to enter the archive without a publishing receipt', async () => {
    await expect(publishStory(store, storyId, { actor: 'adviser' } as any))
      .rejects.toThrow(/receipt/i);
    expect((await store.stories.get(storyId))!.status).toBe('REVIEW');
    expect(await store.episodes.list()).toHaveLength(0);
  });

  test('REFUSES links that are not public web addresses', async () => {
    await expect(publishStory(store, storyId, {
      actor: 'adviser',
      receipt: { ...RECEIPT, destinations: [{ platform: 'School website', url: 'javascript:alert(1)' }] },
    })).rejects.toThrow(/public link/i);
  });

  test('an explicit recipe must have its reviewed audience file before publication', async () => {
    const project = await store.stories.update(storyId, {
      creationRecipeId: 'poster', channels: ['social'], workflowStepId: 'check',
      body: { type: 'doc', content: [] },
    });
    for (const check of REVIEW_CHECKS) await checkReviewItem(store, project.id, check.id, true, 'editor');
    await finishReview(store, project.id, 'editor');
    await expect(publishStory(store, project.id, { actor: 'adviser', receipt: RECEIPT })).rejects.toThrow(/Blast|poster|release file/i);
    await saveDeliverable(store, { bytes: new Uint8Array([1]), title: 'Poster', fileName: 'poster.png', kind: 'IMAGE', room: 'BLAST', stage: 'REVIEW', mime: 'image/png', storyId: project.id });
    for (const check of REVIEW_CHECKS) await checkReviewItem(store, project.id, check.id, true, 'editor');
    await finishReview(store, project.id, 'editor');
    await publishStory(store, project.id, { actor: 'adviser', receipt: RECEIPT });
    expect(await store.stories.get(project.id)).toMatchObject({ status: 'DONE', workflowStepId: 'out' });
  });

  test('a podcast story releases through Chatterbox instead of the generic publisher', async () => {
    const project = await store.stories.update(storyId, { creationRecipeId: 'podcast', channels: ['pod'], workflowStepId: 'export', body: { type: 'doc', content: [] } });
    await expect(publishStory(store, project.id, { actor: 'adviser', receipt: RECEIPT })).rejects.toThrow(/Chatterbox/i);
    expect(await store.episodes.list()).toHaveLength(0);
  });
});
