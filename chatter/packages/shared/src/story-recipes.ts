import type { Story, StoryCreationRecipeId } from './types.js';
import type { Store } from './store.js';

export interface StoryRecipeStep {
  id: string;
  label: string;
  icon: string;
  room: string;
  next: string;
  action: string;
}

export interface StoryCreationRecipe {
  id: StoryCreationRecipeId;
  label: string;
  shortLabel: string;
  mark: string;
  accent: string;
  description: string;
  channels: string[];
  steps: readonly StoryRecipeStep[];
  /** WORK and BOOTH are the two making states in the established editorial lifecycle. */
  workStep: string;
  boothStep: string;
}

const common = {
  idea: { id: 'idea', label: 'Idea', icon: 'ic-slate', room: '/slate', next: 'Shape the idea and decide what the audience needs.', action: 'Open the plan' },
  report: { id: 'report', label: 'Gather', icon: 'ic-crew', room: '/slate', next: 'Collect the people, notes, sounds, pictures, and details the project needs.', action: 'Open project notes' },
  check: { id: 'check', label: 'Check', icon: 'ic-eye', room: '/greenlight', next: 'Check the facts, permissions, credits, and finished work.', action: 'Open review' },
  export: { id: 'export', label: 'Export', icon: 'ic-mail', room: '/files', next: 'Collect the finished files the adviser will upload.', action: 'Open Media Bin' },
  out: { id: 'out', label: 'Out', icon: 'ic-star', room: '/reruns', next: 'See the published edition and leave notes for next time.', action: 'Open Reruns' },
} satisfies Record<string, StoryRecipeStep>;

export const STORY_CREATION_RECIPES: readonly StoryCreationRecipe[] = [
  {
    id: 'article', label: 'Article', shortLabel: 'READ', mark: 'Aa', accent: '#ffd62e',
    description: 'A written story for the school site, paper, or newsletter.', channels: ['web'],
    steps: [common.idea, common.report, { id: 'write', label: 'Write', icon: 'ic-pen', room: '/desk', next: 'Build the draft from the reporting you gathered.', action: 'Open Desk' }, common.check, common.export, common.out],
    workStep: 'write', boothStep: 'write',
  },
  {
    id: 'podcast', label: 'Podcast episode', shortLabel: 'LISTEN', mark: '((●))', accent: '#ff5c9b',
    description: 'A voiced episode with a rundown, edited takes, music, and a listening master.', channels: ['pod'],
    steps: [common.idea, common.report, { id: 'record', label: 'Record', icon: 'ic-mic', room: '/booth', next: 'Record the voices and moments the episode needs.', action: 'Open Booth' }, { id: 'edit', label: 'Edit', icon: 'ic-note', room: '/chatterbox', next: 'Arrange the voices, music, and story cards into an episode.', action: 'Open Chatterbox' }, common.check, common.export, common.out],
    workStep: 'record', boothStep: 'edit',
  },
  {
    id: 'video', label: 'Video story', shortLabel: 'WATCH', mark: '▶', accent: '#ff8054',
    description: 'A video story with a script, footage, titles, sound, and a final cut.', channels: ['video'],
    steps: [common.idea, common.report, { id: 'script', label: 'Script', icon: 'ic-pen', room: '/desk', next: 'Write the words and picture plan for the edit.', action: 'Open Desk' }, { id: 'cut', label: 'Cut', icon: 'ic-tv', room: '/stinger', next: 'Build the picture, sound, and titles on the timeline.', action: 'Open Stinger' }, common.check, common.export, common.out],
    workStep: 'script', boothStep: 'cut',
  },
  {
    id: 'poster', label: 'Poster or social post', shortLabel: 'SEE', mark: '▧', accent: '#38cbd0',
    description: 'A designed page, flyer, handout, or social graphic people can scan quickly.', channels: ['social'],
    steps: [common.idea, common.report, { id: 'design', label: 'Design', icon: 'ic-mail', room: '/blast', next: 'Turn the strongest words and pictures into a clear page.', action: 'Open Blast' }, common.check, common.export, common.out],
    workStep: 'design', boothStep: 'design',
  },
  {
    id: 'show', label: 'News show', shortLabel: 'AIR', mark: 'TV', accent: '#8d6ddb',
    description: 'A complete bulletin or program with a rundown, segments, graphics, and a master.', channels: ['segment'],
    steps: [common.idea, common.report, { id: 'rundown', label: 'Rundown', icon: 'ic-pen', room: '/desk', next: 'Write the order, timing, and words that hold the show together.', action: 'Open Desk' }, { id: 'produce', label: 'Produce', icon: 'ic-tv', room: '/stinger', next: 'Assemble the program, sound, and screen graphics.', action: 'Open Stinger' }, common.check, common.export, common.out],
    workStep: 'rundown', boothStep: 'produce',
  },
] as const;

export function storyCreationRecipe(id?: StoryCreationRecipeId): StoryCreationRecipe {
  return STORY_CREATION_RECIPES.find((recipe) => recipe.id === id) ?? STORY_CREATION_RECIPES[0]!;
}

export function resolveStoryCreationRecipe(story: Pick<Story, 'creationRecipeId' | 'channels'>): StoryCreationRecipe {
  if (story.creationRecipeId) return storyCreationRecipe(story.creationRecipeId);
  if (story.channels.includes('pod')) return storyCreationRecipe('podcast');
  if (story.channels.includes('video')) return storyCreationRecipe('video');
  if (story.channels.includes('segment')) return storyCreationRecipe('show');
  if (story.channels.includes('social') && !story.channels.includes('web')) return storyCreationRecipe('poster');
  return storyCreationRecipe('article');
}

type StoryWorkflowInput = Pick<Story, 'creationRecipeId' | 'channels' | 'status' | 'workflowStepId'>;

function legacyWorkflowStepId(story: Pick<Story, 'creationRecipeId' | 'channels' | 'status'>): string {
  const recipe = resolveStoryCreationRecipe(story);
  if (story.status === 'PITCH') return 'idea';
  if (story.status === 'WORK') return recipe.workStep;
  if (story.status === 'BOOTH') return recipe.boothStep;
  if (story.status === 'DONE') return 'out';
  return 'check';
}

export function storyWorkflowStepId(story: StoryWorkflowInput): string {
  const recipe = resolveStoryCreationRecipe(story);
  return story.workflowStepId && recipe.steps.some((step) => step.id === story.workflowStepId)
    ? story.workflowStepId
    : legacyWorkflowStepId(story);
}

export function recipeTrackIndex(story: StoryWorkflowInput): number {
  const recipe = resolveStoryCreationRecipe(story);
  return Math.max(0, recipe.steps.findIndex((step) => step.id === storyWorkflowStepId(story)));
}

export function recipeTrackStepForStory(story: StoryWorkflowInput): StoryRecipeStep {
  const recipe = resolveStoryCreationRecipe(story);
  return recipe.steps[recipeTrackIndex(story)]!;
}

export function storyRequiresDeskDraft(story: Pick<Story, 'creationRecipeId' | 'channels'>): boolean {
  return ['article', 'video', 'show'].includes(resolveStoryCreationRecipe(story).id);
}

function broadStatusForStep(recipe: StoryCreationRecipe, stepId: string): Story['status'] {
  if (stepId === 'idea') return 'PITCH';
  if (stepId === 'check' || stepId === 'export') return 'REVIEW';
  if (stepId === recipe.boothStep && recipe.boothStep !== recipe.workStep) return 'BOOTH';
  return 'WORK';
}

export async function advanceStoryWorkflow(store: Store, storyId: string, stepId: string): Promise<Story> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error('That story is no longer available.');
  const recipe = resolveStoryCreationRecipe(story);
  if (!recipe.steps.some((step) => step.id === stepId)) throw new Error(`${stepId} is not part of the ${recipe.label} route.`);
  if (stepId === 'out') throw new Error('Publication happens in Green Light, not by moving the progress track.');
  return store.stories.update(story.id, { workflowStepId: stepId, status: broadStatusForStep(recipe, stepId) });
}

/** Advance only after the audience-facing artifact has saved in the recipe's last making room. */
export async function completeRecipeProduction(store: Store, storyId: string, room: string): Promise<Story> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error('That story is no longer available.');
  const recipe = resolveStoryCreationRecipe(story);
  const checkIndex = recipe.steps.findIndex((step) => step.id === 'check');
  const finishingStep = recipe.steps[checkIndex - 1];
  const requestedRoom = `/${room.replace(/^\//, '').toLowerCase()}`;
  // Saved video records retain their SHOWTIME room for compatibility.
  const normalizedRoom = requestedRoom === '/showtime' ? '/stinger' : requestedRoom;
  if (!finishingStep || finishingStep.room !== normalizedRoom) throw new Error(`${room} is not the ${recipe.label} finishing room.`);
  return advanceStoryWorkflow(store, storyId, 'check');
}
