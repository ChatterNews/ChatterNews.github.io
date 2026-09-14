import type { Store } from './store.js';
import type { CrewTask, Story, StoryReview, ReviewNote } from './types.js';
import type { CrewRole } from './crew.js';
import { recordRole } from './roles.js';
import { newId } from './ids.js';
import { countWords } from './readtime.js';
import { advanceStoryWorkflow, storyRequiresDeskDraft } from './story-recipes.js';

export const JOB_GUIDES: Record<CrewRole, {
  title: string; icon: string; color: string; promise: string; room: string;
  steps: { id: string; title: string; help: string }[];
}> = {
  report: { title: 'Story builder', icon: '◎', color: '#FFD21E', promise: 'Collect the people, references, and raw material the project needs.', room: '/slate', steps: [
    { id: 'questions', title: 'Plan three useful questions', help: 'Ask what the audience should understand, notice, or remember.' },
    { id: 'sources', title: 'Gather source material', help: 'Save the names, files, links, observations, and recordings the crew will use.' },
    { id: 'notes', title: 'Leave clear project notes', help: 'Keep exact quotes separate from summaries and label anything unfinished.' },
  ] },
  write: { title: 'Writer', icon: '✎', color: '#22C7E8', promise: 'Turn reporting into a story people want to read.', room: '/desk', steps: [
    { id: 'lead', title: 'Write a clear opening', help: 'Tell the audience the most important news and why it matters.' },
    { id: 'structure', title: 'Build the story with evidence', help: 'Use useful details, attributed quotes, and short paragraphs.' },
    { id: 'read', title: 'Read it aloud once', help: 'Fix awkward sentences, missing context, and names you cannot pronounce.' },
  ] },
  voice: { title: 'Presenter', icon: '◉', color: '#FF3D8B', promise: 'Help the audience hear the story clearly.', room: '/booth', steps: [
    { id: 'rehearse', title: 'Rehearse and check names', help: 'Mark pauses and ask how to pronounce unfamiliar names.' },
    { id: 'levels', title: 'Check the microphone and room', help: 'Watch the input meter, avoid clipping, and listen for background noise.' },
    { id: 'take', title: 'Record and listen to a complete take', help: 'Choose the take you would be happy for the audience to hear.' },
  ] },
  edit: { title: 'Editor', icon: '✓', color: '#9BE015', promise: 'Be the second set of eyes that makes the finished piece work.', room: '/greenlight', steps: [
    { id: 'accuracy', title: 'Check names, details, and credits', help: 'Compare the piece with its project notes and source material.' },
    { id: 'clarity', title: 'Check the message and clarity', help: 'Look for missing context, confusing moments, and hard-to-read choices.' },
    { id: 'handoff', title: 'Leave useful notes and finish the review', help: 'Explain what to fix and why. Resolve notes after the revision is checked.' },
  ] },
  produce: { title: 'Producer', icon: '♫', color: '#8B4DE8', promise: 'Make the pieces work together as a finished production.', room: '/studio', steps: [
    { id: 'plan', title: 'Plan the sound and timing', help: 'Know the length, transitions, and mood before building the mix.' },
    { id: 'mix', title: 'Balance the mix', help: 'Keep speech clear. Music should support the story, not cover it.' },
    { id: 'listen', title: 'Listen from start to finish', help: 'Check the beginning, ending, loudness, and every transition.' },
  ] },
  picture: { title: 'Visual designer', icon: '▧', color: '#FF7A1A', promise: 'Make images and layouts that explain, attract, and inform.', room: '/blast', steps: [
    { id: 'choose', title: 'Choose purposeful visuals', help: 'Use original or properly licensed pictures that add information.' },
    { id: 'design', title: 'Design a clear visual hierarchy', help: 'Make the headline, important details, and next action easy to find.' },
    { id: 'access', title: 'Check captions, credits, and readability', help: 'Use readable type, strong contrast, accurate captions, and proper credit.' },
  ] },
};

export const REVIEW_CHECKS = [
  { id: 'accuracy', title: 'Names, details & labels', prompt: 'Compare names, dates, numbers, titles, and labels with the project notes.', icon: '◎' },
  { id: 'sources', title: 'Credits & attribution', prompt: 'Name speakers and creators clearly. Check quotes, media credits, and borrowed material.', icon: '“' },
  { id: 'fairness', title: 'Message & context', prompt: 'Does the finished piece give the audience the right idea? Add any context the edit leaves out.', icon: '⚖' },
  { id: 'clarity', title: 'Readability & accessibility', prompt: 'Read it aloud. Check captions, understandable wording, and visual readability.', icon: 'Aa' },
  { id: 'finish', title: 'Final audience check', prompt: 'Preview the whole piece. Check its opening, ending, links, credits, and next action.', icon: '✓' },
] as const;

export function reviewContentKey(story: Story): string {
  return JSON.stringify({
    title: story.title,
    body: story.body,
    channels: story.channels,
    creationRecipeId: story.creationRecipeId,
    bylineIds: story.bylineIds,
    selectedTakeId: story.selectedTakeId,
    reporting: story.brief ? { sources: story.brief.sources } : undefined,
  });
}

/** Include the actual attachments, so replacing a take requires fresh eyes/ears. */
export async function reviewMediaKey(store: Store, storyId: string): Promise<string> {
  const [credits, takes, assets, deliverables] = await Promise.all([store.credits.list(), store.takes.list(), store.assets.list(), store.deliverables.list()]);
  const storyTakes = takes.filter((item) => item.storyId === storyId).sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set([...credits.filter((item) => item.storyId === storyId).map((item) => item.assetId), ...storyTakes.flatMap((item) => [item.assetId, ...(item.renderedAssetId ? [item.renderedAssetId] : [])])]);
  const storyFiles = deliverables.filter((item) => item.storyId === storyId).sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ assets: [...ids].sort().map((id) => { const asset = assets.find((item) => item.id === id); return [id, asset?.sha256, asset?.gateStatus, asset?.creator, asset?.license]; }), takes: storyTakes.map((take) => [take.id, take.edits, take.renderedAssetId, take.transcriptCorrection]), deliverables: storyFiles.map((file) => [file.id, file.blobHash, file.kind, file.room, file.stage]) });
}

export function reviewProgress(review: StoryReview | undefined, story: Story, mediaKey?: string): { checked: number; total: number; openNotes: number; stale: boolean; ready: boolean } {
  const stale = !!review && (review.contentKey !== reviewContentKey(story) || (mediaKey !== undefined && review.mediaKey !== mediaKey));
  const checked = stale ? 0 : REVIEW_CHECKS.filter((check) => review?.checks[check.id]?.checked).length;
  const openNotes = review?.notes.filter((note) => !note.resolved).length ?? 0;
  const mediumReady = !storyRequiresDeskDraft(story) || countWords(story.body) > 0;
  return { checked, total: REVIEW_CHECKS.length, openNotes, stale, ready: checked === REVIEW_CHECKS.length && openNotes === 0 && !stale && mediumReady };
}

export async function openReview(store: Store, storyId: string, reviewerId?: string): Promise<StoryReview> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error('That story is no longer available.');
  const mediaKey = await reviewMediaKey(store, storyId);
  const existing = (await store.reviews.list()).find((review) => review.storyId === storyId);
  if (existing) {
    if (existing.contentKey !== reviewContentKey(story) || existing.mediaKey !== mediaKey) {
      return store.reviews.update(existing.id, { contentKey: reviewContentKey(story), mediaKey, checks: {}, exceptions: {}, state: 'REVIEWING', ...(reviewerId ? { reviewerId } : {}) });
    }
    return reviewerId && !existing.reviewerId ? store.reviews.update(existing.id, { reviewerId }) : existing;
  }
  return store.reviews.create({ storyId, contentKey: reviewContentKey(story), mediaKey, checks: {}, notes: [], state: 'REVIEWING', ...(reviewerId ? { reviewerId } : {}) });
}

export async function checkReviewItem(store: Store, storyId: string, key: string, checked: boolean, actor: string): Promise<StoryReview> {
  if (!REVIEW_CHECKS.some((item) => item.id === key)) throw new Error('Unknown review check.');
  const review = await openReview(store, storyId, actor);
  return store.reviews.update(review.id, { checks: { ...review.checks, [key]: { checked, actor, at: Date.now() } }, state: 'REVIEWING' });
}

export async function addReviewNote(store: Store, storyId: string, actor: string, text: string, category: ReviewNote['category']): Promise<StoryReview> {
  if (!text.trim()) throw new Error('Write what needs attention before adding a note.');
  const review = await openReview(store, storyId, actor);
  return store.reviews.update(review.id, { notes: [...review.notes, { id: newId(), authorId: actor, text: text.trim(), category, resolved: false, createdAt: Date.now() }], state: 'CHANGES_REQUESTED' });
}

export async function finishReview(store: Store, storyId: string, actor: string): Promise<StoryReview> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error('That story is no longer available.');
  if (storyRequiresDeskDraft(story) && !countWords(story.body)) throw new Error('Write the piece in the Desk before finishing its review.');
  const review = await openReview(store, storyId, actor);
  if (!reviewProgress(review, story, await reviewMediaKey(store, storyId)).ready) throw new Error('Finish all five checks and resolve the open notes first.');
  if (story.status !== 'DONE') await advanceStoryWorkflow(store, storyId, 'export');
  if (review.state === 'READY') return review;
  await recordRole(store, { userId: actor, storyId, role: 'edit' });
  return store.reviews.update(review.id, { state: 'READY' });
}

export async function claimCrewTask(store: Store, storyId: string, role: CrewRole, actor: string): Promise<CrewTask> {
  const story = await store.stories.get(storyId);
  if (!story || story.status === 'DONE') throw new Error('Choose a story that is still in production.');
  if (!JOB_GUIDES[role]) throw new Error('Choose one of the six newsroom jobs.');
  const existing = (await store.crewTasks.list()).find((task) => task.storyId === storyId && task.role === role);
  if (existing) {
    if (existing.state === 'DONE') throw new Error('This job is already finished. Read its handoff on the job board.');
    if (existing.assigneeId === actor) return existing;
    throw new Error('Someone already has this job. Pick another role or coordinate with your crew.');
  }
  return store.crewTasks.create({ storyId, role, assigneeId: actor, state: 'CLAIMED', completedSteps: [], handoffNote: '' });
}

export async function finishCrewTask(store: Store, taskId: string, actor: string): Promise<CrewTask> {
  const task = await store.crewTasks.get(taskId);
  if (!task || task.assigneeId !== actor) throw new Error('Only the person doing this job can finish it.');
  if (task.state === 'DONE') return task;
  const guide = JOB_GUIDES[task.role as CrewRole];
  if (!guide || !guide.steps.every((step) => task.completedSteps.includes(step.id))) throw new Error('Finish the three job steps before handing this in.');
  if (!task.handoffNote.trim()) throw new Error('Leave a handoff note so the next person knows what you made and where to find it.');
  await recordRole(store, { userId: actor, storyId: task.storyId, role: task.role });
  return store.crewTasks.update(taskId, { state: 'DONE', completedAt: task.completedAt ?? Date.now() });
}

export async function checkCrewTaskStep(store: Store, taskId: string, stepId: string, checked: boolean, actor: string): Promise<CrewTask> {
  const task = await store.crewTasks.get(taskId);
  if (!task || task.assigneeId !== actor) throw new Error('Only the person doing this job can update its steps.');
  if (task.state === 'DONE') throw new Error('Reopen the job before making another pass.');
  if (!JOB_GUIDES[task.role as CrewRole]?.steps.some((step) => step.id === stepId)) throw new Error('Unknown job step.');
  const steps = new Set(task.completedSteps);
  if (checked) steps.add(stepId); else steps.delete(stepId);
  return store.crewTasks.update(task.id, { completedSteps: [...steps], state: task.state === 'NEEDS_HELP' ? 'NEEDS_HELP' : 'IN_PROGRESS' });
}

export async function reopenCrewTask(store: Store, taskId: string, actor: string): Promise<CrewTask> {
  const task = await store.crewTasks.get(taskId);
  if (!task || task.assigneeId !== actor) throw new Error('Only the person doing this job can reopen it.');
  const story = await store.stories.get(task.storyId);
  if (!story || story.status === 'DONE') throw new Error('This story is no longer in production.');
  return store.crewTasks.update(task.id, { state: 'IN_PROGRESS', completedSteps: [], completedAt: undefined });
}
