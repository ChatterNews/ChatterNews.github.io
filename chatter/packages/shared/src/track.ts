/**
 * The track: the persistent recipe route every story walks.
 * New stories store an authored recipe step; older stories infer one from
 * Story.status until they advance.
 */
import { recipeTrackStepForStory } from './story-recipes.js';
import type { StoryCreationRecipeId } from './types.js';

export type Status = 'PITCH' | 'WORK' | 'BOOTH' | 'REVIEW' | 'HELD' | 'DONE';
export type StepId = 'idea' | 'report' | 'write' | 'record' | 'check' | 'go' | 'out';

export interface TrackStep {
  id: StepId;
  label: string;
  icon: string;
  /** Route of the room that owns this step. */
  room: string;
  /** What is happening now, said the way a nine-year-old reads it. */
  next: string;
  /** Label on the track's Go button. */
  action: string;
}

export const TRACK_STEPS: readonly TrackStep[] = [
  { id: 'idea',   label: 'Idea',   icon: 'ic-bolt',  room: '/slate',
    next: 'Nobody has claimed this one yet.', action: 'Claim it' },
  { id: 'report', label: 'Report', icon: 'ic-crew',  room: '/slate',
    next: 'Go ask people about it and write down what they say.', action: 'Open it' },
  { id: 'write',  label: 'Write',  icon: 'ic-pen',   room: '/desk',
    next: 'Turn your notes into something people can read.', action: 'Go write' },
  { id: 'record', label: 'Record', icon: 'ic-mic',   room: '/booth',
    next: 'Read it out loud in the Booth.', action: 'Go record' },
  { id: 'check',  label: 'Check',  icon: 'ic-eye',   room: '/greenlight',
    next: 'Names, facts, and media are being checked.', action: 'Open review' },
  { id: 'go',     label: 'Go',     icon: 'ic-light', room: '/greenlight',
    next: 'Waiting on somebody to say yes.', action: 'See what is stuck' },
  { id: 'out',    label: 'Out',    icon: 'ic-star',  room: '/reruns',
    next: 'It is out in the world. Go look at it.', action: 'Go see it' },
] as const;

/**
 * Status to bead index. Two beads - Report and Go - are passed through rather
 * than parked on: a story in WORK has already been reported, and a story only
 * sits on Go when an adviser has HELD it.
 */
const INDEX_OF: Record<Status, number> = {
  PITCH: 0, WORK: 2, BOOTH: 3, REVIEW: 4, HELD: 5, DONE: 6,
};

export function trackIndexFor(status: Status): number {
  return INDEX_OF[status];
}

export function trackStepFor(status: Status): StepId {
  return TRACK_STEPS[INDEX_OF[status]]!.id;
}

export function roomForStep(step: StepId): string {
  return TRACK_STEPS.find((s) => s.id === step)!.room;
}

/** The one canonical destination for continuing a particular story. */
export function storyPath(story: { id: string; status: Status; creationRecipeId?: StoryCreationRecipeId; channels?: string[] }): string {
  const room = story.creationRecipeId || story.channels
    ? recipeTrackStepForStory({ ...story, channels: story.channels ?? [] }).room
    : TRACK_STEPS[trackIndexFor(story.status)]!.room;
  return storyRoomPath(room, story.id);
}

/** A route to the same story in a named production room. */
export function storyRoomPath(room: string, storyId: string): string {
  const path = room.startsWith('/') ? room : `/${room}`;
  const encoded = encodeURIComponent(storyId);
  if (['/crew', '/studio', '/blast', '/files', '/chatterbox'].includes(path)) return `${path}?story=${encoded}`;
  if (['/slate', '/desk', '/booth', '/greenlight', '/stinger', '/showtime', '/reruns'].includes(path)) return `${path}/${encoded}`;
  return path;
}
