import type { Store } from './store.js';
import type { Story, StoryBrief, StoryCreationRecipeId, User } from './types.js';
import type { Status } from './track.js';
import { newId } from './ids.js';
import { countWords } from './readtime.js';
import { claimCrewTask } from './newsroom.js';
import { advanceStoryWorkflow, resolveStoryCreationRecipe, storyCreationRecipe, storyRequiresDeskDraft } from './story-recipes.js';

export const STORY_TEMPLATES = [
  { id: 'news', title: 'Quick news', icon: '⚡', stamp: 'NEWS WIRE', accent: '#ffd62e', description: 'Pin down a change people need to know now.', channels: ['web'], example: { headline: 'A second lunch line gives sixth grade seven more minutes', angle: 'The new line shortened the average wait; we can time both lines and ask students whether they finish lunch.' }, questions: ['What changed, and when?', 'Who can confirm it firsthand?', 'What happens next?'], checklist: ['Confirm names, dates, and numbers', 'Get a useful quote', 'Choose a clear headline'] },
  { id: 'interview', title: 'One good conversation', icon: '◉', stamp: 'TAPE LOG', accent: '#ff5c9b', description: 'Build a story around what one person knows or lived.', channels: ['pod'], example: { headline: 'Three blade designs later, a student team finds its best spin', angle: 'A student designer explains how repeated testing changed the build; we can compare the versions and check the team log.' }, questions: ['What would you like people to understand?', 'Can you tell me about a specific moment?', 'What could we check after the interview?'], checklist: ['Arrange a time and quiet location', 'Check recording permission with your adviser', 'Record room tone and a clean introduction'] },
  { id: 'event', title: 'Cover an event', icon: '▣', stamp: 'FIELD PASS', accent: '#ff8054', description: 'Choose the moments that show what the event meant.', channels: ['web', 'social'], example: { headline: 'STEM Night through a first-grader’s eyes', angle: 'Follow one first-time visitor from a failed circuit to a working light, using station photos and an organizer check.' }, questions: ['What moment would show why this mattered?', 'What should someone who missed it know?', 'Whose perspective is missing?'], checklist: ['Confirm time and location', 'Make a shot and sound list', 'Capture a participant and organizer perspective'] },
  { id: 'feature', title: 'People & places', icon: '◎', stamp: 'PROFILE FILE', accent: '#8d6ddb', description: 'Reveal something the audience would not notice at first.', channels: ['web', 'pod'], example: { headline: 'How one crossing guard spots the riskiest minute of arrival', angle: 'A familiar morning routine reveals where arrival gets difficult; we can observe traffic and compare the school’s safety notes.' }, questions: ['What makes this person or place worth a closer look?', 'What challenge changed the story?', 'What scene could let the audience see it?'], checklist: ['Find a strong central question', 'Gather firsthand detail', 'Check context with a second source'] },
  { id: 'explainer', title: 'Explain how it works', icon: '↻', stamp: 'BREAK IT DOWN', accent: '#38cbd0', description: 'Turn a tricky idea into a clear answer people can use.', channels: ['web', 'segment'], example: { headline: 'Why changing one blade angle changes the whole turbine', angle: 'The blade angle changes how much wind becomes motion; we can demonstrate three angles and measure the output.' }, questions: ['What is the one idea the audience should understand?', 'Which step is easiest to show?', 'Which word needs a plain-language definition?'], checklist: ['Check the explanation with a knowledgeable source', 'Plan a demonstration or diagram', 'Remove details that do not serve the main idea'] },
  { id: 'experiment', title: 'Test & result', icon: '△', stamp: 'LAB LOG', accent: '#a8e63a', description: 'Report what was tried, measured, changed, and learned.', channels: ['web', 'social'], example: { headline: 'The fourth bridge held twice the weight of the first', angle: 'Changing the center support produced the strongest bridge; we can compare build photos, weights, and the team’s test chart.' }, questions: ['What question did the team test?', 'What changed between attempts?', 'What result can another person verify?'], checklist: ['Keep the original measurements', 'Photograph or record the test', 'Separate the result from what the team thinks it means'] },
] as const;

export type StoryAngleCheckId = 'changed' | 'affected' | 'verifiable';
export interface StoryAngleCheckResult {
  id: StoryAngleCheckId;
  label: string;
  prompt: string;
  value: string;
  complete: boolean;
}

export function storyAngleChecks(brief?: StoryBrief): StoryAngleCheckResult[] {
  const values = {
    changed: brief?.angle?.trim() ?? '',
    affected: brief?.angleCheck?.affected?.trim() ?? '',
    verifiable: brief?.angleCheck?.verification?.trim() ?? '',
  };
  return [
    { id: 'changed', label: 'What’s the focus?', prompt: 'Name the event, idea, person, problem, feeling, or question.', value: values.changed, complete: !!values.changed },
    { id: 'affected', label: 'Who is it for?', prompt: 'Name the audience or the people at the center of the piece.', value: values.affected, complete: !!values.affected },
    { id: 'verifiable', label: 'What can we use?', prompt: 'Name an interview, note, photo, sound, file, observation, or artifact.', value: values.verifiable, complete: !!values.verifiable },
  ];
}

export function emptyBrief(templateId = 'news'): StoryBrief {
  const template = STORY_TEMPLATES.find((item) => item.id === templateId) ?? STORY_TEMPLATES[0];
  return { angle: '', storyType: template.id, angleCheck: { affected: '', verification: '' }, audience: 'Our school community', priority: 'NORMAL', questions: template.questions.map((text) => ({ id: newId(), text, answered: false })), sources: [], checklist: template.checklist.map((text) => ({ id: newId(), text, done: false })), productionNotes: '' };
}

/** Keep the actor argument for callers; pitches remain unclaimed until claimStory. */
export async function createPitch(
  store: Store, title: string, templateId: string, _actor: string, angle = '',
  angleCheck: NonNullable<StoryBrief['angleCheck']> = { affected: '', verification: '' },
  creationRecipeId?: StoryCreationRecipeId,
): Promise<Story> {
  if (!title.trim()) throw new Error('Give your story a working headline first.');
  const template = STORY_TEMPLATES.find((item) => item.id === templateId) ?? STORY_TEMPLATES[0];
  const recipe = creationRecipeId ? storyCreationRecipe(creationRecipeId) : undefined;
  return store.stories.create({ title: title.trim(), channels: [...(recipe?.channels ?? template.channels)], status: 'PITCH', workflowStepId: 'idea', ...(recipe ? { creationRecipeId: recipe.id } : {}), brief: { ...emptyBrief(template.id), angle: angle.trim(), angleCheck: { affected: angleCheck.affected.trim(), verification: angleCheck.verification.trim() } }, bylineIds: [], ownerId: undefined });
}

export async function claimStory(store: Store, storyId: string, actor: string): Promise<Story> {
  const story = await store.stories.get(storyId);
  if (!story || story.status === 'DONE') throw new Error('Choose a story that is still in production.');
  if (story.ownerId && story.ownerId !== actor) throw new Error('This story already has a lead. Join one of its jobs in Crew.');
  await claimCrewTask(store, storyId, 'report', actor);
  return store.stories.update(storyId, { ownerId: actor, bylineIds: [...new Set([...story.bylineIds, actor])], status: story.status === 'PITCH' ? 'WORK' : story.status, workflowStepId: story.workflowStepId === 'idea' || !story.workflowStepId ? 'report' : story.workflowStepId });
}

export async function moveStory(store: Store, storyId: string, status: Status, actor: User): Promise<Story> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error('That story is no longer available.');
  if (story.status === status) return story;
  if (status === 'DONE' || story.status === 'DONE') throw new Error('Publication happens in Green Light, not by moving a card.');
  if ((status === 'HELD' || story.status === 'HELD') && actor.role === 'STUDENT') throw new Error('An adviser needs to manage this hold. You can keep working on the piece.');
  if (status === 'REVIEW' && storyRequiresDeskDraft(story) && !countWords(story.body)) throw new Error('Write the piece in the Desk before sending it for review.');
  if (!['PITCH', 'WORK', 'BOOTH', 'REVIEW', 'HELD'].includes(status)) throw new Error('Unknown production stage.');
  if (status === 'HELD') return store.stories.update(storyId, { status });
  const recipe = resolveStoryCreationRecipe(story);
  if (status === 'BOOTH' && recipe.boothStep === recipe.workStep) return store.stories.update(storyId, { status: 'BOOTH', workflowStepId: recipe.boothStep });
  const stepId = status === 'PITCH' ? 'idea' : status === 'WORK' ? recipe.workStep : status === 'BOOTH' ? recipe.boothStep : 'check';
  return advanceStoryWorkflow(store, storyId, stepId);
}

export function slateQuery(stories: Story[], options: { search: string; stage: string; channel: string; scope: string; actor?: string; sort: string }): Story[] {
  const query = options.search.trim().toLowerCase();
  return stories.filter((story) => (!query || `${story.title} ${story.brief?.angle ?? ''} ${story.brief?.angleCheck?.affected ?? ''} ${story.brief?.angleCheck?.verification ?? ''}`.toLowerCase().includes(query))
    && (options.stage === 'ALL' || story.status === options.stage)
    && (options.channel === 'ALL' || story.channels.includes(options.channel))
    && (options.scope !== 'MINE' || story.ownerId === options.actor || story.bylineIds.includes(options.actor ?? ''))
    && (options.scope !== 'UNCLAIMED' || (!story.ownerId && story.status !== 'DONE')))
    .sort((a, b) => options.sort === 'TITLE' ? a.title.localeCompare(b.title) : options.sort === 'RECENT' ? b.updatedAt - a.updatedAt : options.sort === 'PRIORITY' ? Number(b.brief?.priority === 'HIGH') - Number(a.brief?.priority === 'HIGH') || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) : (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.title.localeCompare(b.title));
}
