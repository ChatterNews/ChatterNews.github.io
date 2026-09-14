import { beforeEach, describe, expect, test } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { claimStory, createPitch, emptyBrief, moveStory, slateQuery, storyAngleChecks, STORY_TEMPLATES } from './slate.js';
import type { Store } from './store.js';
import type { User } from './types.js';

let store: Store;
let student: User;
beforeEach(async () => { store = new MemoryStore(); await store.open(); student = await store.users.create({ name: 'A', penName: 'A.', role: 'STUDENT', active: true }); });
describe('Slate production planning', () => {
  test('a pitch persists the editable template without pretending it is reported', async () => {
    const story = await createPitch(store, '  The lunch line  ', 'interview', student.id, 'Why did the line change?');
    expect(story).toMatchObject({ title: 'The lunch line', status: 'PITCH', channels: ['pod'], brief: { angle: 'Why did the line change?' } });
    expect(story.brief!.questions).toHaveLength(3);
    expect((await store.stories.get(story.id))!.brief).toEqual(story.brief);
    expect(await store.roleAssigns.list()).toHaveLength(0);
    await expect(createPitch(store, ' ', 'news', student.id)).rejects.toThrow(/headline/);
  });
  test('a pitch keeps the primary thing the crew chose to make', async () => {
    const story = await createPitch(
      store, 'Voices from the science fair', 'event', student.id,
      'Students changed their designs after the first test.',
      { affected: 'The design teams', verification: 'Compare build logs and interview students' },
      'podcast',
    );
    expect(story).toMatchObject({ creationRecipeId: 'podcast', channels: ['pod'], workflowStepId: 'idea' });
  });
  test('each template creates independent question and checklist records', () => {
    const a = emptyBrief('event'); const b = emptyBrief('event');
    expect(a.questions[0]!.id).not.toBe(b.questions[0]!.id);
    a.checklist[0]!.done = true; expect(b.checklist[0]!.done).toBe(false);
  });
  test('story starters teach six distinct school-scale angles instead of generic topics', () => {
    expect(STORY_TEMPLATES).toHaveLength(6);
    expect(new Set(STORY_TEMPLATES.map((item) => item.example.headline)).size).toBe(6);
    for (const template of STORY_TEMPLATES) {
      expect(template.example.headline.length).toBeGreaterThan(20);
      expect(template.example.angle).toMatch(/\b(we|can|using|through|compare|check|observe|measure)\b/i);
    }
  });
  test('project direction works for media-making without requiring a hard-news angle', () => {
    const incomplete = emptyBrief('news');
    expect(storyAngleChecks(incomplete).map((item) => item.label)).toEqual(['What’s the focus?', 'Who is it for?', 'What can we use?']);
    expect(storyAngleChecks(incomplete).map(({ id, complete }) => [id, complete])).toEqual([
      ['changed', false], ['affected', false], ['verifiable', false],
    ]);

    const complete = {
      ...incomplete,
      angle: 'The new two-line lunch system shortened the wait.',
      angleCheck: { affected: 'Sixth graders trying to finish lunch', verification: 'Time both lines and interview students' },
    };
    expect(storyAngleChecks(complete).every((item) => item.complete)).toBe(true);
  });
  test('a pitch keeps its story type and structured Angle Check in the reporting file', async () => {
    const story = await createPitch(
      store, 'Testing a better turbine blade', 'experiment', student.id,
      'A fourth blade shape produced more power than the first three.',
      { affected: 'The KidWind team choosing a final design', verification: 'Compare the test log and meter readings' },
    );
    expect(story.brief).toMatchObject({
      storyType: 'experiment',
      angleCheck: {
        affected: 'The KidWind team choosing a final design',
        verification: 'Compare the test log and meter readings',
      },
    });
  });
  test('claiming a story assigns the lead and a real reporter job without awarding credit', async () => {
    const story = await createPitch(store, 'School garden', 'news', student.id);
    expect(await claimStory(store, story.id, student.id)).toMatchObject({ ownerId: student.id, bylineIds: [student.id], status: 'WORK', workflowStepId: 'report' });
    await claimStory(store, story.id, student.id);
    expect(await store.crewTasks.list()).toHaveLength(1);
    expect(await store.roleAssigns.list()).toHaveLength(0);
    await expect(claimStory(store, story.id, 'other')).rejects.toThrow(/already has a lead/);
  });
  test('a card cannot bypass publication or an adviser hold', async () => {
    const story = await store.stories.create({ title: 'Held story', status: 'HELD' });
    await expect(moveStory(store, story.id, 'WORK', student)).rejects.toThrow(/adviser/);
    await expect(moveStory(store, story.id, 'DONE', student)).rejects.toThrow(/Green Light/);
    expect(await moveStory(store, story.id, 'WORK', { ...student, role: 'ADVISER' })).toMatchObject({ status: 'WORK' });
  });
  test('sending an empty draft to review explains the missing next step', async () => {
    const story = await store.stories.create({ title: 'Empty' });
    await expect(moveStory(store, story.id, 'REVIEW', student)).rejects.toThrow(/Write the piece/);
    expect(await moveStory(store, story.id, 'BOOTH', student)).toMatchObject({ status: 'BOOTH' });
  });
  test.each([
    ['poster', ['social']],
    ['podcast', ['pod']],
  ] as const)('does not invent a Desk draft gate for a %s', async (creationRecipeId, channels) => {
    const project = await store.stories.create({ title: `${creationRecipeId} project`, creationRecipeId, channels: [...channels], workflowStepId: 'report', body: { type: 'doc', content: [] } });
    expect(await moveStory(store, project.id, 'REVIEW', student)).toMatchObject({ status: 'REVIEW', workflowStepId: 'check' });
  });
  test('card, board, and table views share the same search, owner, channel and deadline query', async () => {
    const a = await store.stories.create({ title: 'Garden update', ownerId: student.id, channels: ['pod'], dueAt: 20 });
    const b = await store.stories.create({ title: 'Garden questions', ownerId: student.id, channels: ['pod'], dueAt: 10 });
    const c = await store.stories.create({ title: 'Sports', channels: ['web'] });
    const options = { search: 'garden', stage: 'ALL', channel: 'pod', scope: 'MINE', actor: student.id, sort: 'DUE' };
    expect(slateQuery([a, b, c], options).map((story) => story.id)).toEqual([b.id, a.id]);
    expect(slateQuery([a, b, c], { ...options, search: '', channel: 'ALL', scope: 'UNCLAIMED' }).map((story) => story.id)).toEqual([c.id]);
  });
  test('story search includes the people and proof named in the Angle Check', async () => {
    const story = await createPitch(store, 'A better lunch line', 'news', student.id, 'The line changed.', {
      affected: 'sixth graders', verification: 'cafeteria timing sheet',
    });
    const base = { stage: 'ALL', channel: 'ALL', scope: 'ALL', actor: student.id, sort: 'DUE' };
    expect(slateQuery([story], { ...base, search: 'sixth' })).toHaveLength(1);
    expect(slateQuery([story], { ...base, search: 'timing sheet' })).toHaveLength(1);
  });
});
