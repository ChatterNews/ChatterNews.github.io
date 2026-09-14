import type { Store } from './store.js';
import type { Deliverable, ReleaseException, ReleaseLaneId, Story, StoryReview, Take } from './types.js';
import { countWords } from './readtime.js';
import { openReview, reviewMediaKey, reviewProgress } from './newsroom.js';
import { canPublish } from './publish.js';
import { storyAngleChecks } from './slate.js';
import { storyRoomPath } from './track.js';
import { recipeOutputRequirement } from './recipe-output.js';
import { resolveStoryCreationRecipe, storyRequiresDeskDraft } from './story-recipes.js';

export type ReleaseLaneStatus = 'CLEAR' | 'OPEN' | 'NOT_NEEDED' | 'EXCEPTION';

export interface ReleaseLane {
  id: ReleaseLaneId;
  label: string;
  room: string;
  icon: string;
  status: ReleaseLaneStatus;
  detail: string;
  route?: string;
  actionLabel?: string;
  exceptionAllowed: boolean;
  exception?: ReleaseException;
}

export interface StoryReleaseCard {
  storyId: string;
  lanes: ReleaseLane[];
  ready: boolean;
  openCount: number;
}

interface LaneDraft extends Omit<ReleaseLane, 'status' | 'exception'> { status: Exclude<ReleaseLaneStatus, 'EXCEPTION'> }

function currentCheck(review: StoryReview | undefined, stale: boolean, id: string): boolean {
  return !stale && !!review?.checks[id]?.checked;
}

function preparedTake(story: Story, takes: Take[]): boolean {
  const chosen = takes.find((take) => take.id === story.selectedTakeId);
  if (!chosen) return false;
  return !chosen.edits || (!!chosen.renderedAssetId && chosen.renderedEditKey === JSON.stringify(chosen.edits));
}

function audioOutput(files: Deliverable[]): boolean {
  return files.some((file) => file.kind === 'AUDIO' && (file.room === 'GARAGE' || file.room === 'CHATTERBOX' || file.stage === 'REVIEW' || file.stage === 'FINAL'));
}

function visualOutput(files: Deliverable[]): boolean {
  return files.some((file) => ['IMAGE', 'DESIGN', 'VIDEO'].includes(file.kind) && ['BLAST', 'STINGER', 'SHOWTIME'].includes(file.room));
}

function applyException(lane: LaneDraft, review: StoryReview | undefined, stale: boolean): ReleaseLane {
  const exception = !stale && lane.exceptionAllowed && lane.status === 'OPEN' ? review?.exceptions?.[lane.id] : undefined;
  return exception ? { ...lane, status: 'EXCEPTION', exception } : lane;
}

export async function storyReleaseCard(store: Store, storyId: string): Promise<StoryReleaseCard> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error('That story is no longer available.');
  const [reviews, files, takes, mediaKey, verdict] = await Promise.all([
    store.reviews.list(), store.deliverables.list(), store.takes.list(), reviewMediaKey(store, storyId), canPublish(store, storyId),
  ]);
  const review = reviews.find((item) => item.storyId === storyId);
  const progress = reviewProgress(review, story, mediaKey);
  const storyFiles = files.filter((file) => file.storyId === storyId);
  const recipe = resolveStoryCreationRecipe(story);
  const output = recipeOutputRequirement(story, files);
  const storyTakes = takes.filter((take) => take.storyId === storyId);
  const words = countWords(story.body);
  const angleChecks = story.brief ? storyAngleChecks(story.brief) : [];
  const reportingClear = !!story.brief && angleChecks.every((check) => check.complete) && story.brief.sources.some((source) => source.state === 'CONFIRMED');
  const reportingDetail = reportingClear
    ? `${story.brief!.sources.filter((source) => source.state === 'CONFIRMED').length} checked source${story.brief!.sources.filter((source) => source.state === 'CONFIRMED').length === 1 ? '' : 's'} and a complete creative brief.`
    : 'Finish the creative brief and check at least one source, reference, or firsthand note.';
  const wordsNeeded = storyRequiresDeskDraft(story);
  const wordsClear = wordsNeeded && words > 0 && ['accuracy', 'sources', 'fairness', 'clarity'].every((id) => currentCheck(review, progress.stale, id));
  const hasPreparedTake = preparedTake(story, storyTakes);
  const hasAudioOutput = audioOutput(storyFiles);
  const hasVisualOutput = visualOutput(storyFiles);
  const soundNeeded = ['podcast', 'show'].includes(recipe.id) || storyTakes.length > 0 || storyFiles.some((file) => file.kind === 'AUDIO');
  const graphicsNeeded = ['poster', 'video', 'show'].includes(recipe.id) || hasVisualOutput;
  const soundClear = recipe.id === 'podcast' || recipe.id === 'show' ? output.ready : hasPreparedTake || hasAudioOutput;
  const captionsClear = currentCheck(review, progress.stale, 'clarity');

  const channelChecks = story.channels.map((channel) => {
    if (channel === 'web') return { channel, ready: words > 0 && storyFiles.some((file) => file.room === 'DESK' && ['REVIEW', 'FINAL'].includes(file.stage)) };
    if (channel === 'pod' || channel === 'podcast') return { channel, ready: storyFiles.some((file) => file.room === 'CHATTERBOX' && file.kind === 'AUDIO' && ['REVIEW', 'FINAL', 'PUBLISHED'].includes(file.stage)) };
    if (channel === 'social') return { channel, ready: storyFiles.some((file) => file.room === 'BLAST' && ['IMAGE', 'DESIGN', 'DOCUMENT'].includes(file.kind) && ['REVIEW', 'FINAL', 'PUBLISHED'].includes(file.stage)) };
    if (channel === 'segment') return { channel, ready: storyFiles.some((file) => file.room === 'SHOWTIME' && file.kind === 'VIDEO' && ['REVIEW', 'FINAL'].includes(file.stage)) };
    if (channel === 'video') return { channel, ready: storyFiles.some((file) => file.room === 'SHOWTIME' && file.kind === 'VIDEO' && ['REVIEW', 'FINAL', 'PUBLISHED'].includes(file.stage)) };
    return { channel, ready: false };
  });
  const missingChannels = channelChecks.filter((item) => !item.ready).map((item) => item.channel);
  const exportClear = channelChecks.length > 0 && missingChannels.length === 0;

  const lanes: LaneDraft[] = [
    { id: 'REPORTING', label: 'Project notes', room: 'SLATE', icon: '◎', status: reportingClear ? 'CLEAR' : 'OPEN', detail: reportingDetail, route: `/slate/${story.id}`, actionLabel: 'Open project notes', exceptionAllowed: true },
    { id: 'PERMISSIONS', label: 'Permissions', room: 'FRONT DESK', icon: '✓', status: verdict.ok ? 'CLEAR' : 'OPEN', detail: verdict.ok ? 'Media checks and recorded permissions are clear.' : verdict.blockers.map((blocker) => blocker.say).join(' '), route: '/frontdesk', actionLabel: 'Open Front Desk', exceptionAllowed: false },
    { id: 'WORDS', label: 'Words', room: 'DESK', icon: 'Aa', status: !wordsNeeded ? 'NOT_NEEDED' : wordsClear ? 'CLEAR' : 'OPEN', detail: !wordsNeeded ? `The ${recipe.label.toLowerCase()} is reviewed in its production room.` : wordsClear ? `${words} words; accuracy, sourcing, fairness, and clarity checked.` : progress.stale ? 'The story or its files changed. Read the current version and run the checks again.' : 'Finish the written piece and its accuracy, sourcing, fairness, and clarity checks.', route: `/desk/${story.id}`, actionLabel: 'Open story', exceptionAllowed: true },
    { id: 'SOUND', label: 'Sound', room: recipe.id === 'podcast' ? 'CHATTERBOX' : 'BOOTH / STUDIO', icon: '◖))', status: !soundNeeded ? 'NOT_NEEDED' : soundClear ? 'CLEAR' : 'OPEN', detail: !soundNeeded ? 'This release does not use recorded sound.' : soundClear ? 'The audience-ready sound is attached.' : recipe.id === 'podcast' ? 'Build the listening master in Chatterbox.' : 'Choose and prepare the sound the audience should hear.', route: recipe.id === 'podcast' ? output.route : `/booth/${story.id}`, actionLabel: 'Open sound', exceptionAllowed: true },
    { id: 'GRAPHICS', label: 'Graphics', room: 'BLAST / STINGER', icon: '▧', status: !graphicsNeeded ? 'NOT_NEEDED' : hasVisualOutput ? 'CLEAR' : 'OPEN', detail: !graphicsNeeded ? 'This release does not call for a designed visual.' : hasVisualOutput ? 'A finished image, design, or video graphic is in the Media Bin.' : 'Export the graphic the audience should see.', route: storyRoomPath('/blast', story.id), actionLabel: 'Open visuals', exceptionAllowed: true },
    { id: 'CAPTIONS', label: 'Captions', room: 'GREEN LIGHT', icon: 'CC', status: !graphicsNeeded ? 'NOT_NEEDED' : captionsClear ? 'CLEAR' : 'OPEN', detail: !graphicsNeeded ? 'There is no visual to caption in this release.' : captionsClear ? 'Captions and visual readability were included in the clarity check.' : 'Check captions, readable type, and what a viewer needs without sound.', exceptionAllowed: true },
    { id: 'EXPORTS', label: 'Exports', room: 'MEDIA BIN', icon: '⇩', status: exportClear ? 'CLEAR' : 'OPEN', detail: exportClear ? `Files are ready for ${story.channels.join(' + ')}.` : story.channels.length ? `Make the release file for: ${missingChannels.join(', ')}. The route expects a ${output.label}.` : 'Choose at least one release channel and make its file.', route: output.ready ? storyRoomPath('/files', story.id) : output.route, actionLabel: output.ready ? 'Open Media Bin' : `Open ${output.room === 'CHATTERBOX' ? 'Chatterbox' : output.room[0] + output.room.slice(1).toLowerCase()}`, exceptionAllowed: true },
  ];

  const resolved = lanes.map((lane) => applyException(lane, review, progress.stale));
  const openCount = resolved.filter((lane) => lane.status === 'OPEN').length;
  return { storyId, lanes: resolved, ready: openCount === 0, openCount };
}

function requireAdviser(decider: { actor: string; role?: 'STUDENT' | 'ADVISER' | 'ADMIN' }): void {
  if (decider.role !== 'ADVISER' && decider.role !== 'ADMIN') throw new Error('Only a teacher can approve a release exception.');
}

export async function approveReleaseException(store: Store, storyId: string, laneId: ReleaseLaneId, reason: string, decider: { actor: string; role?: 'STUDENT' | 'ADVISER' | 'ADMIN' }): Promise<StoryReview> {
  requireAdviser(decider);
  if (laneId === 'PERMISSIONS') throw new Error('Permissions and media safeguards cannot be an exception. Fix the block before release.');
  const note = reason.trim();
  if (note.length < 12) throw new Error('Explain the exception in one short sentence so the crew can learn from it.');
  const lane = (await storyReleaseCard(store, storyId)).lanes.find((item) => item.id === laneId);
  if (!lane || lane.status !== 'OPEN' || !lane.exceptionAllowed) throw new Error('That release check is not open, so it does not need an exception.');
  const review = await openReview(store, storyId, decider.actor);
  const next = await store.reviews.update(review.id, { exceptions: { ...review.exceptions, [laneId]: { reason: note, actor: decider.actor, at: Date.now() } } });
  await store.events.append({ action: 'review.exception.approved', target: storyId, actor: decider.actor, payload: { laneId, reason: note } });
  return next;
}

export async function clearReleaseException(store: Store, storyId: string, laneId: ReleaseLaneId, decider: { actor: string; role?: 'STUDENT' | 'ADVISER' | 'ADMIN' }): Promise<StoryReview> {
  requireAdviser(decider);
  const review = await openReview(store, storyId, decider.actor);
  const exceptions = { ...review.exceptions }; delete exceptions[laneId];
  const next = await store.reviews.update(review.id, { exceptions });
  await store.events.append({ action: 'review.exception.cleared', target: storyId, actor: decider.actor, payload: { laneId } });
  return next;
}
