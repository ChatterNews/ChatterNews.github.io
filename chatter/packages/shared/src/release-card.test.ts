import { beforeEach, describe, expect, test } from 'vitest';
import { MemoryStore } from './store-memory.js';
import type { Store } from './store.js';
import { checkReviewItem, finishReview, REVIEW_CHECKS, reviewMediaKey } from './newsroom.js';
import { approveReleaseException, clearReleaseException, storyReleaseCard } from './release-card.js';
import { saveDeliverable } from './deliverables.js';
import type { Story } from './types.js';

let store: Store;
let story: Story;

beforeEach(async () => {
  store = new MemoryStore('release-card-test');
  await store.open();
  story = await store.stories.create({
    title: 'Solar race', channels: ['web', 'social'],
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The fourth car crossed the line first.' }] }] },
    brief: {
      angle: 'A gear change improved the final run.', audience: 'The school community', angleCheck: { affected: 'The fifth-grade builders', verification: 'Compare the timing sheet and team notebook' },
      priority: 'NORMAL', questions: [], checklist: [], productionNotes: '',
      sources: [{ id: 'source-1', name: 'Timing sheet', role: 'record', reference: '', notes: 'Final run: 8.4 seconds', quotes: '', state: 'CONFIRMED' }],
    },
  });
  for (const check of REVIEW_CHECKS) await checkReviewItem(store, story.id, check.id, true, 'editor');
  await finishReview(store, story.id, 'editor');
});

describe('shared Green Light release card', () => {
  test('does not require a journalism Proof Pass to clear a media project', async () => {
    story = await store.stories.update(story.id, { brief: { ...story.brief!, sources: [{ ...story.brief!.sources[0]!, evidenceType: 'WEB_LEAD' }] } });
    const card = await storyReleaseCard(store, story.id);
    expect(card.lanes.find((lane) => lane.id === 'REPORTING')).toMatchObject({
      status: 'CLEAR',
    });
    expect(card.lanes.find((lane) => lane.id === 'REPORTING')?.detail).not.toMatch(/Proof Pass/i);
  });

  test('assembles the reporting, words, graphics, captions, and export proof for the active channels', async () => {
    await saveDeliverable(store, { bytes: new Uint8Array([1]), title: 'Writing copy', fileName: 'copy.txt', kind: 'DOCUMENT', room: 'DESK', stage: 'REVIEW', mime: 'text/plain', storyId: story.id });
    await saveDeliverable(store, { bytes: new Uint8Array([2]), title: 'Social card', fileName: 'card.png', kind: 'IMAGE', room: 'BLAST', stage: 'REVIEW', mime: 'image/png', storyId: story.id });
    for (const check of REVIEW_CHECKS) await checkReviewItem(store, story.id, check.id, true, 'editor');
    await finishReview(store, story.id, 'editor');
    const card = await storyReleaseCard(store, story.id);
    expect(card.lanes.map((lane) => lane.id)).toEqual(['REPORTING', 'PERMISSIONS', 'WORDS', 'SOUND', 'GRAPHICS', 'CAPTIONS', 'EXPORTS']);
    expect(card.lanes.find((lane) => lane.id === 'SOUND')?.status).toBe('NOT_NEEDED');
    expect(card.lanes.every((lane) => lane.status === 'CLEAR' || lane.status === 'NOT_NEEDED')).toBe(true);
    expect(card.ready).toBe(true);
  });

  test('shows exact missing sound and export work for a podcast story', async () => {
    story = await store.stories.update(story.id, { channels: ['pod'] });
    const card = await storyReleaseCard(store, story.id);
    expect(card.lanes.find((lane) => lane.id === 'SOUND')).toMatchObject({ status: 'OPEN', route: `/chatterbox?story=${story.id}` });
    expect(card.lanes.find((lane) => lane.id === 'EXPORTS')).toMatchObject({ status: 'OPEN' });
    expect(card.ready).toBe(false);
  });

  test.each([
    ['poster', ['social'], 'BLAST', 'IMAGE', 'poster.png'],
    ['podcast', ['pod'], 'CHATTERBOX', 'AUDIO', 'episode.wav'],
  ] as const)('clears a %s with its actual reviewed output and no hidden writing requirement', async (creationRecipeId, channels, room, kind, fileName) => {
    const project = await store.stories.create({
      title: creationRecipeId === 'poster' ? 'STEAM night' : 'Field notes',
      creationRecipeId,
      channels: [...channels],
      workflowStepId: 'check',
      body: { type: 'doc', content: [] },
      brief: structuredClone(story.brief),
    });
    await saveDeliverable(store, { bytes: new Uint8Array([7]), title: 'Reviewed release', fileName, kind, room, stage: 'REVIEW', mime: kind === 'AUDIO' ? 'audio/wav' : 'image/png', storyId: project.id });
    for (const check of REVIEW_CHECKS) await checkReviewItem(store, project.id, check.id, true, 'editor');
    await finishReview(store, project.id, 'editor');
    const card = await storyReleaseCard(store, project.id);
    expect(card.lanes.find((lane) => lane.id === 'WORDS')?.status).toBe('NOT_NEEDED');
    expect(card.lanes.find((lane) => lane.id === (creationRecipeId === 'podcast' ? 'SOUND' : 'GRAPHICS'))?.status).toBe('CLEAR');
    expect(card.lanes.find((lane) => lane.id === 'EXPORTS')?.status).toBe('CLEAR');
    expect(card.ready).toBe(true);
  });

  test('does not let unrelated media stand in for the recipe output', async () => {
    const project = await store.stories.create({
      title: 'Morning announcement', creationRecipeId: 'video', channels: ['video'], workflowStepId: 'check',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Good morning from the Chatter crew.' }] }] },
      brief: structuredClone(story.brief),
    });
    await saveDeliverable(store, { bytes: new Uint8Array([8]), title: 'Scratch voice', fileName: 'voice.wav', kind: 'AUDIO', room: 'BOOTH', stage: 'REVIEW', mime: 'audio/wav', storyId: project.id });
    for (const check of REVIEW_CHECKS) await checkReviewItem(store, project.id, check.id, true, 'editor');
    await finishReview(store, project.id, 'editor');
    expect((await storyReleaseCard(store, project.id)).lanes.find((lane) => lane.id === 'EXPORTS')?.status).toBe('OPEN');
    await saveDeliverable(store, { bytes: new Uint8Array([9]), title: 'Final cut', fileName: 'show.webm', kind: 'VIDEO', room: 'SHOWTIME', stage: 'REVIEW', mime: 'video/webm', storyId: project.id });
    for (const check of REVIEW_CHECKS) await checkReviewItem(store, project.id, check.id, true, 'editor');
    await finishReview(store, project.id, 'editor');
    expect((await storyReleaseCard(store, project.id)).lanes.find((lane) => lane.id === 'EXPORTS')?.status).toBe('CLEAR');
  });

  test('adviser exceptions are visible, removable, and never allowed for permission blocks', async () => {
    await expect(approveReleaseException(store, story.id, 'SOUND', 'No audio was planned for this written piece.', { actor: 'teacher', role: 'ADVISER' })).rejects.toThrow(/not open/i);
    story = await store.stories.update(story.id, { channels: ['pod'] });
    await expect(approveReleaseException(store, story.id, 'SOUND', 'short', { actor: 'teacher', role: 'ADVISER' })).rejects.toThrow(/explain/i);
    await expect(approveReleaseException(store, story.id, 'SOUND', 'Recorded live at the assembly; use the camera track.', { actor: 'student', role: 'STUDENT' })).rejects.toThrow(/teacher/i);
    await expect(approveReleaseException(store, story.id, 'PERMISSIONS', 'We know the family.', { actor: 'teacher', role: 'ADVISER' })).rejects.toThrow(/cannot be an exception/i);
    await approveReleaseException(store, story.id, 'SOUND', 'Recorded live at the assembly; use the camera track.', { actor: 'teacher', role: 'ADVISER' });
    expect((await storyReleaseCard(store, story.id)).lanes.find((lane) => lane.id === 'SOUND')).toMatchObject({ status: 'EXCEPTION', exception: { actor: 'teacher' } });
    await clearReleaseException(store, story.id, 'SOUND', { actor: 'teacher', role: 'ADVISER' });
    expect((await storyReleaseCard(store, story.id)).lanes.find((lane) => lane.id === 'SOUND')?.status).toBe('OPEN');
  });

  test('a new export changes the reviewed media version and clears old exceptions', async () => {
    story = await store.stories.update(story.id, { channels: ['pod'] });
    await approveReleaseException(store, story.id, 'SOUND', 'Recorded live at the assembly; use the camera track.', { actor: 'teacher', role: 'ADVISER' });
    const before = await reviewMediaKey(store, story.id);
    await saveDeliverable(store, { bytes: new Uint8Array([9]), title: 'New mix', fileName: 'mix.wav', kind: 'AUDIO', room: 'GARAGE', stage: 'WORKING', mime: 'audio/wav', storyId: story.id });
    expect(await reviewMediaKey(store, story.id)).not.toBe(before);
    const card = await storyReleaseCard(store, story.id);
    expect(card.lanes.find((lane) => lane.id === 'WORDS')?.status).toBe('NOT_NEEDED');
    expect(card.lanes.find((lane) => lane.id === 'SOUND')?.status).toBe('OPEN');
  });
});
