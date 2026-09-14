import { beforeEach, describe, expect, test } from 'vitest';
import { MemoryStore } from './store-memory.js';
import type { Store } from './store.js';
import type { Story } from './types.js';
import { addReviewNote, checkCrewTaskStep, checkReviewItem, claimCrewTask, finishCrewTask, finishReview, JOB_GUIDES, openReview, reopenCrewTask, REVIEW_CHECKS, reviewMediaKey, reviewProgress } from './newsroom.js';
import { publishStory } from './publish.js';

let store: Store;
let story: Story;
beforeEach(async () => {
  store = new MemoryStore('newsroom-test');
  await store.open();
  story = await store.stories.create({ title: 'Solar race', channels: ['web'], body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The race begins on Friday.' }] }] } });
});

async function checkEverything() {
  for (const check of REVIEW_CHECKS) await checkReviewItem(store, story.id, check.id, true, 'editor');
  return (await store.reviews.list())[0]!;
}

describe('student editorial review', () => {
  test('the source check stays a human review instead of enforcing a journalism proof form', async () => {
    const source = { id: 'web-1', name: 'Club post', role: 'Web lead', reference: 'https://example.test/post', notes: 'The post announces Friday.', quotes: '', state: 'CONFIRMED' as const, evidenceType: 'WEB_LEAD' as const };
    story = await store.stories.update(story.id, { brief: { angle: 'The date changed.', audience: 'Students', priority: 'NORMAL', questions: [], sources: [source], checklist: [], productionNotes: '' } });
    await expect(checkReviewItem(store, story.id, 'sources', true, 'editor')).resolves.toMatchObject({ state: 'REVIEWING', checks: { sources: { checked: true } } });
  });

  test('the five checks fit a media-production club without a mandatory response protocol', () => {
    expect(REVIEW_CHECKS.map((check) => check.title)).toEqual([
      'Names, details & labels', 'Credits & attribution', 'Message & context', 'Readability & accessibility', 'Final audience check',
    ]);
    expect(REVIEW_CHECKS.map((check) => check.prompt).join(' ')).not.toMatch(/criticized|get a fair chance to respond|unsupported claims/i);
  });

  test('taking a review reuses one record and does not award a contribution', async () => {
    const first = await openReview(store, story.id, 'editor');
    expect((await openReview(store, story.id, 'editor')).id).toBe(first.id);
    expect(await store.reviews.list()).toHaveLength(1);
    expect(await store.roleAssigns.list()).toHaveLength(0);
  });

  test('all five human checks are required and record who checked', async () => {
    await expect(finishReview(store, story.id, 'editor')).rejects.toThrow(/five checks/);
    const review = await checkEverything();
    expect(reviewProgress(review, story)).toMatchObject({ checked: 5, ready: true });
    expect(review.checks.accuracy).toMatchObject({ actor: 'editor', checked: true });
    await expect(checkReviewItem(store, story.id, 'made-up', true, 'editor')).rejects.toThrow(/Unknown/);
  });

  test('revision notes block handoff until resolved', async () => {
    await checkEverything();
    const review = await addReviewNote(store, story.id, 'editor', '  Check the date.  ', 'FACT');
    expect(review.notes[0]!.text).toBe('Check the date.');
    expect(reviewProgress(review, story)).toMatchObject({ openNotes: 1, ready: false });
    await expect(finishReview(store, story.id, 'editor')).rejects.toThrow();
    await store.reviews.update(review.id, { notes: review.notes.map((note) => ({ ...note, resolved: true })) });
    expect((await finishReview(store, story.id, 'editor')).state).toBe('READY');
    await expect(addReviewNote(store, story.id, 'editor', '  ', 'GENERAL')).rejects.toThrow(/Write/);
  });

  test('a changed draft invalidates all old checks but keeps revision notes', async () => {
    await checkEverything();
    const review = await addReviewNote(store, story.id, 'editor', 'Keep this note.', 'CLARITY');
    story = await store.stories.update(story.id, { title: 'The updated solar race' });
    expect(reviewProgress(review, story)).toMatchObject({ stale: true, checked: 0, ready: false });
    const reopened = await openReview(store, story.id, 'editor');
    expect(reopened.checks).toEqual({});
    expect(reopened.notes).toHaveLength(1);
    expect(reopened.state).toBe('REVIEWING');
  });

  test('ordinary workflow status changes do not invalidate the reviewed version', async () => {
    await checkEverything();
    const review = await finishReview(store, story.id, 'editor');
    story = (await store.stories.get(story.id))!;
    expect(story.status).toBe('REVIEW');
    expect(reviewProgress(review, story).ready).toBe(true);
    await finishReview(store, story.id, 'editor');
    expect(await store.roleAssigns.list()).toHaveLength(1);
  });

  test('adding an attachment invalidates checks without changing the text', async () => {
    const review = await checkEverything();
    await store.takes.create({ storyId: story.id, assetId: 'new-take', userId: 'presenter', durationSec: 10 });
    expect(reviewProgress(review, story, await reviewMediaKey(store, story.id)).stale).toBe(true);
    expect((await openReview(store, story.id, 'editor')).checks).toEqual({});
  });

  test('an empty draft cannot be marked ready', async () => {
    story = await store.stories.update(story.id, { body: { type: 'doc', content: [] } });
    const review = await checkEverything();
    expect(reviewProgress(review, story).ready).toBe(false);
    await expect(finishReview(store, story.id, 'editor')).rejects.toThrow(/Write the piece/);
  });

  test.each([
    ['poster', ['social']],
    ['podcast', ['pod']],
  ] as const)('reviews a %s by its finished medium without inventing a Desk draft', async (creationRecipeId, channels) => {
    const project = await store.stories.create({
      title: creationRecipeId === 'poster' ? 'STEAM night poster' : 'Chatterbox field notes',
      creationRecipeId,
      channels: [...channels],
      workflowStepId: 'check',
      body: { type: 'doc', content: [] },
    });
    for (const check of REVIEW_CHECKS) await checkReviewItem(store, project.id, check.id, true, 'editor');
    const review = (await store.reviews.list()).find((item) => item.storyId === project.id)!;
    expect(reviewProgress(review, project).ready).toBe(true);
    await expect(finishReview(store, project.id, 'editor')).resolves.toMatchObject({ state: 'READY' });
    expect(await store.stories.get(project.id)).toMatchObject({ status: 'REVIEW', workflowStepId: 'export' });
  });

  test('publication cannot bypass a started, incomplete or stale crew review', async () => {
    const receipt = { destinations: [{ platform: 'School website', url: 'https://school.example/news/story' }], publishedAt: 1_800_000_000_000 };
    await openReview(store, story.id, 'editor');
    await expect(publishStory(store, story.id, { actor: 'teacher', role: 'ADVISER', receipt })).rejects.toThrow(/crew review/);
    await checkEverything(); await finishReview(store, story.id, 'editor');
    story = await store.stories.update(story.id, { title: 'Changed after checking' });
    await expect(publishStory(store, story.id, { actor: 'teacher', role: 'ADVISER', receipt })).rejects.toThrow(/current version/);
    expect(await store.episodes.list()).toHaveLength(0);
    await checkEverything(); await finishReview(store, story.id, 'editor');
    await publishStory(store, story.id, { actor: 'teacher', role: 'ADVISER', receipt });
    expect((await store.stories.get(story.id))!.status).toBe('DONE');
  });
});

describe('crew jobs and handoffs', () => {
  test('step updates use saved progress, do not duplicate steps, and keep a raised hand visible', async () => {
    const task = await claimCrewTask(store, story.id, 'report', 'reporter');
    await store.crewTasks.update(task.id, { state: 'NEEDS_HELP' });
    await checkCrewTaskStep(store, task.id, 'questions', true, 'reporter');
    await checkCrewTaskStep(store, task.id, 'questions', true, 'reporter');
    expect(await checkCrewTaskStep(store, task.id, 'sources', true, 'reporter')).toMatchObject({ state: 'NEEDS_HELP', completedSteps: ['questions', 'sources'] });
    expect((await checkCrewTaskStep(store, task.id, 'questions', false, 'reporter')).completedSteps).toEqual(['sources']);
    await expect(checkCrewTaskStep(store, task.id, 'notes', true, 'someone-else')).rejects.toThrow(/Only the person/);
  });

  test('claims one real job without pretending work is done', async () => {
    const task = await claimCrewTask(store, story.id, 'write', 'writer');
    expect(task.state).toBe('CLAIMED');
    expect((await claimCrewTask(store, story.id, 'write', 'writer')).id).toBe(task.id);
    expect(await store.roleAssigns.list()).toHaveLength(0);
    await expect(claimCrewTask(store, story.id, 'write', 'other-writer')).rejects.toThrow(/already has/);
  });

  test('only the owner can finish and every brief step plus handoff is required', async () => {
    const task = await claimCrewTask(store, story.id, 'picture', 'designer');
    await expect(finishCrewTask(store, task.id, 'somebody-else')).rejects.toThrow(/Only the person/);
    await expect(finishCrewTask(store, task.id, 'designer')).rejects.toThrow(/three job steps/);
    await store.crewTasks.update(task.id, { completedSteps: JOB_GUIDES.picture.steps.map((step) => step.id) });
    await expect(finishCrewTask(store, task.id, 'designer')).rejects.toThrow(/handoff note/);
    await store.crewTasks.update(task.id, { handoffNote: 'The flyer is in Blast. Double-check the venue.' });
    const done = await finishCrewTask(store, task.id, 'designer');
    expect(done.state).toBe('DONE');
    expect(done.completedAt).toBeGreaterThan(0);
    await finishCrewTask(store, task.id, 'designer');
    expect(await store.roleAssigns.list()).toHaveLength(1);
    await expect(claimCrewTask(store, story.id, 'picture', 'designer')).rejects.toThrow(/already finished/);
  });

  test('jobs are not offered on missing or published stories', async () => {
    await expect(claimCrewTask(store, 'missing', 'report', 'reporter')).rejects.toThrow(/still in production/);
    await store.stories.update(story.id, { status: 'DONE' });
    await expect(claimCrewTask(store, story.id, 'report', 'reporter')).rejects.toThrow(/still in production/);
  });

  test('an owner can make another pass without losing the previous handoff or double-counting', async () => {
    const task = await claimCrewTask(store, story.id, 'edit', 'editor');
    await store.crewTasks.update(task.id, { completedSteps: JOB_GUIDES.edit.steps.map((step) => step.id), handoffNote: 'First pass checked in Green Light.' });
    await finishCrewTask(store, task.id, 'editor');
    await expect(reopenCrewTask(store, task.id, 'somebody-else')).rejects.toThrow(/Only the person/);
    expect(await reopenCrewTask(store, task.id, 'editor')).toMatchObject({ completedSteps: [], state: 'IN_PROGRESS', handoffNote: 'First pass checked in Green Light.' });
    await store.crewTasks.update(task.id, { completedSteps: JOB_GUIDES.edit.steps.map((step) => step.id) });
    await finishCrewTask(store, task.id, 'editor');
    expect(await store.roleAssigns.list()).toHaveLength(1);
  });
});
