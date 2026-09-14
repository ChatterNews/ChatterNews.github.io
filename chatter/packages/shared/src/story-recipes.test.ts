import { describe, expect, test } from 'vitest';
import {
  STORY_CREATION_RECIPES,
  advanceStoryWorkflow,
  completeRecipeProduction,
  recipeTrackIndex,
  recipeTrackStepForStory,
  resolveStoryCreationRecipe,
  storyRequiresDeskDraft,
  storyWorkflowStepId,
} from './story-recipes.js';
import { MemoryStore } from './store-memory.js';

describe('story creation recipes', () => {
  test('frames the shared route as media production rather than a hard-news proof process', () => {
    const copy = STORY_CREATION_RECIPES.flatMap((recipe) => [recipe.description, ...recipe.steps.flatMap((step) => [step.label, step.next])]).join(' ');
    expect(copy).not.toMatch(/people, proof|reported video/i);
    expect(STORY_CREATION_RECIPES.every((recipe) => recipe.steps.some((step) => step.label === 'Gather'))).toBe(true);
  });
  test('offers five clear primary things a newsroom can make', () => {
    expect(STORY_CREATION_RECIPES.map((recipe) => recipe.id)).toEqual([
      'article', 'podcast', 'video', 'poster', 'show',
    ]);
    for (const recipe of STORY_CREATION_RECIPES) {
      expect(recipe.steps.length).toBeGreaterThanOrEqual(6);
      expect(recipe.steps.length).toBeLessThanOrEqual(7);
      expect(recipe.steps[0]?.id).toBe('idea');
      expect(recipe.steps.at(-1)?.id).toBe('out');
    }
  });

  test('uses an explicit recipe before existing channel inference', () => {
    expect(resolveStoryCreationRecipe({ creationRecipeId: 'poster', channels: ['pod'] }).id).toBe('poster');
  });

  test('gives existing stories a useful recipe without migrating stored rows', () => {
    expect(resolveStoryCreationRecipe({ channels: ['pod'] }).id).toBe('podcast');
    expect(resolveStoryCreationRecipe({ channels: ['video'] }).id).toBe('video');
    expect(resolveStoryCreationRecipe({ channels: ['segment'] }).id).toBe('show');
    expect(resolveStoryCreationRecipe({ channels: ['social'] }).id).toBe('poster');
    expect(resolveStoryCreationRecipe({ channels: ['web'] }).id).toBe('article');
    expect(resolveStoryCreationRecipe({ channels: [] }).id).toBe('article');
  });

  test('maps editorial status onto the chosen production route', () => {
    const podcast = { creationRecipeId: 'podcast' as const, channels: ['pod'], status: 'WORK' as const };
    const poster = { creationRecipeId: 'poster' as const, channels: ['social'], status: 'WORK' as const };
    expect(recipeTrackStepForStory(podcast)).toMatchObject({ id: 'record', room: '/booth' });
    expect(recipeTrackStepForStory(poster)).toMatchObject({ id: 'design', room: '/blast' });
    expect(recipeTrackIndex({ ...podcast, status: 'DONE' })).toBe(6);
    expect(recipeTrackStepForStory({ ...poster, status: 'REVIEW' }).id).toBe('check');
  });

  test('lets every authored bead become the real current step', async () => {
    const store = new MemoryStore(); await store.open();
    const story = await store.stories.create({ title: 'Book fair', creationRecipeId: 'poster', channels: ['social'], status: 'WORK', workflowStepId: 'report' });
    expect(storyWorkflowStepId(story)).toBe('report');
    expect(recipeTrackIndex(story)).toBe(1);
    const exported = await advanceStoryWorkflow(store, story.id, 'export');
    expect(exported).toMatchObject({ workflowStepId: 'export', status: 'REVIEW' });
    expect(recipeTrackStepForStory(exported)).toMatchObject({ id: 'export', room: '/files' });
  });

  test('rejects a step that does not belong to the chosen recipe', async () => {
    const store = new MemoryStore(); await store.open();
    const story = await store.stories.create({ title: 'Book fair', creationRecipeId: 'poster', channels: ['social'], workflowStepId: 'idea' });
    await expect(advanceStoryWorkflow(store, story.id, 'edit')).rejects.toThrow(/poster/i);
    expect((await store.stories.get(story.id))?.workflowStepId).toBe('idea');
  });

  test.each([
    ['article', ['web'], 'write', 'DESK'],
    ['podcast', ['pod'], 'edit', 'CHATTERBOX'],
    ['video', ['video'], 'cut', 'SHOWTIME'],
    ['poster', ['social'], 'design', 'BLAST'],
    ['show', ['segment'], 'produce', 'SHOWTIME'],
  ] as const)('only a saved %s output from its finishing room advances to Check', async (creationRecipeId, channels, workflowStepId, room) => {
    const store = new MemoryStore(); await store.open();
    const story = await store.stories.create({ title: `${creationRecipeId} project`, creationRecipeId, channels: [...channels], workflowStepId });
    await expect(completeRecipeProduction(store, story.id, room === 'BLAST' ? 'SHOWTIME' : 'BLAST')).rejects.toThrow(/finishing room/i);
    expect(await completeRecipeProduction(store, story.id, room)).toMatchObject({ workflowStepId: 'check', status: 'REVIEW' });
  });

  test('keeps legacy status inference and defines which recipes truly need Desk copy', () => {
    expect(storyWorkflowStepId({ creationRecipeId: 'podcast', channels: ['pod'], status: 'BOOTH' })).toBe('edit');
    expect(storyWorkflowStepId({ creationRecipeId: 'poster', channels: ['social'], status: 'REVIEW' })).toBe('check');
    expect(storyRequiresDeskDraft({ creationRecipeId: 'article', channels: ['web'] })).toBe(true);
    expect(storyRequiresDeskDraft({ creationRecipeId: 'video', channels: ['video'] })).toBe(true);
    expect(storyRequiresDeskDraft({ creationRecipeId: 'show', channels: ['segment'] })).toBe(true);
    expect(storyRequiresDeskDraft({ creationRecipeId: 'poster', channels: ['social'] })).toBe(false);
    expect(storyRequiresDeskDraft({ creationRecipeId: 'podcast', channels: ['pod'] })).toBe(false);
  });
});
