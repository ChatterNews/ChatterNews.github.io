import { describe, expect, test } from 'vitest';
import {
  STORY_CREATION_RECIPES, advanceStoryWorkflow, checkReviewItem, claimStory, completeRecipeProduction,
  createPitch, createPodcastProject, createPodcastShow, finishReview, makePodcastClip, publishStory,
  releasePodcast, REVIEW_CHECKS, saveDeliverable, segmentChapters, storyReleaseCard, storyWorkflowStepId,
} from './index.js';
import { MemoryStore } from './store-memory.js';
import type { Deliverable, PodcastProject, Story, StoryCreationRecipeId } from './types.js';

const RECEIPT = { destinations: [{ platform: 'School channel', url: 'https://school.example/chatter/release' }], publishedAt: 1_800_000_000_000 };

const outputFor: Record<StoryCreationRecipeId, { room: Deliverable['room']; kind: Deliverable['kind']; mime: string; fileName: string }> = {
  article: { room: 'DESK', kind: 'DOCUMENT', mime: 'text/plain', fileName: 'story.txt' },
  podcast: { room: 'CHATTERBOX', kind: 'AUDIO', mime: 'audio/wav', fileName: 'episode.wav' },
  video: { room: 'SHOWTIME', kind: 'VIDEO', mime: 'video/webm', fileName: 'story.webm' },
  poster: { room: 'BLAST', kind: 'IMAGE', mime: 'image/png', fileName: 'poster.png' },
  show: { room: 'SHOWTIME', kind: 'VIDEO', mime: 'video/webm', fileName: 'show.webm' },
};

function omitBase<T extends { id: string; createdAt: number; updatedAt: number }>(value: T): Omit<T, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = value; return rest;
}

async function readyStory(store: MemoryStore, creationRecipeId: StoryCreationRecipeId): Promise<{ story: Story; podcast?: PodcastProject; seen: string[] }> {
  const recipe = STORY_CREATION_RECIPES.find((item) => item.id === creationRecipeId)!;
  const user = await store.users.create({ name: 'Ari C.', penName: 'Ari C.', role: 'STUDENT' });
  let story = await createPitch(store, `${recipe.label} project`, 'event', user.id, 'Show what the crew made.', { affected: 'Students and families', verification: 'The project notes and finished file' }, creationRecipeId);
  story = await store.stories.update(story.id, {
    brief: { ...story.brief!, sources: [{ id: 'source-1', name: 'Project log', role: 'crew record', reference: '', notes: 'Checked against the finished work.', quotes: '', state: 'CONFIRMED' }] },
    ...(['article', 'video', 'show'].includes(creationRecipeId) ? { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The Chatter crew finished the project and checked the details.' }] }] } } : {}),
  });
  const seen = [storyWorkflowStepId(story)];
  story = await claimStory(store, story.id, user.id); seen.push(storyWorkflowStepId(story));
  const making = recipe.steps.filter((step) => !['idea', 'report', 'check', 'export', 'out'].includes(step.id));
  for (const step of making) { story = await advanceStoryWorkflow(store, story.id, step.id); seen.push(storyWorkflowStepId(story)); }

  let podcast: PodcastProject | undefined;
  const output = outputFor[creationRecipeId];
  let sourceProjectId: string | undefined;
  if (creationRecipeId === 'podcast') {
    const showDraft = createPodcastShow(); showDraft.coverAssetId = 'crew-cover';
    const show = await store.podcastShows.create(omitBase(showDraft));
    const projectDraft = createPodcastProject(show); projectDraft.storyIds = [story.id]; projectDraft.description = 'A complete school media episode.'; projectDraft.chapters = segmentChapters(projectDraft.segments); projectDraft.clips = [makePodcastClip({ assetId: 'voice-source', trackId: projectDraft.tracks[0]!.id, name: 'Host', durationSec: 8 })]; projectDraft.state = 'REVIEW';
    const savedPodcast = await store.podcastProjects.create(omitBase(projectDraft));
    podcast = savedPodcast;
    sourceProjectId = savedPodcast.id;
  }
  await saveDeliverable(store, { bytes: new Uint8Array([1, 2, 3]), title: `${recipe.label} release`, fileName: output.fileName, kind: output.kind, room: output.room, stage: 'REVIEW', mime: output.mime, storyId: story.id, ...(sourceProjectId ? { sourceProjectId } : {}) });
  story = await completeRecipeProduction(store, story.id, output.room); seen.push(storyWorkflowStepId(story));
  for (const check of REVIEW_CHECKS) await checkReviewItem(store, story.id, check.id, true, user.id);
  await finishReview(store, story.id, user.id); story = (await store.stories.get(story.id))!; seen.push(storyWorkflowStepId(story));
  expect((await storyReleaseCard(store, story.id)).ready).toBe(true);
  return { story, podcast, seen };
}

describe('five complete creation routes', () => {
  test.each(STORY_CREATION_RECIPES.map((recipe) => [recipe.id, recipe.steps.map((step) => step.id)] as const))('%s runs from Idea through Out without a dead end', async (creationRecipeId, expectedSteps) => {
    const store = new MemoryStore(`route-${creationRecipeId}`); await store.open();
    const { story, podcast, seen } = await readyStory(store, creationRecipeId);
    if (creationRecipeId === 'podcast') await releasePodcast(store, podcast!.id, 'adviser', RECEIPT);
    else await publishStory(store, story.id, { actor: 'adviser', role: 'ADVISER', receipt: RECEIPT });
    seen.push(storyWorkflowStepId((await store.stories.get(story.id))!));
    expect(seen).toEqual(expectedSteps);
  });
});
