import { storyRoomPath } from '@chatter/shared';
import type { ReilyRoom } from './reily-advice.js';
import { SPIRAL_ROOM_PURPOSES } from './spiral-navigation.js';

export const REILY_GOALS = [
  { id: 'record-voice', label: 'Record a voice', room: 'booth' },
  { id: 'plan-project', label: 'Plan a project', room: 'slate' },
  { id: 'write-words', label: 'Write the words', room: 'desk' },
  { id: 'organize-crew', label: 'Organize the crew', room: 'crew' },
  { id: 'make-podcast', label: 'Make a podcast', room: 'chatterbox' },
  { id: 'design-page', label: 'Design a page', room: 'blast' },
  { id: 'screen-graphics', label: 'Build screen graphics', room: 'stinger' },
  { id: 'edit-video', label: 'Edit video', room: 'showtime' },
  { id: 'review-work', label: 'Review work', room: 'greenlight' },
  { id: 'find-files', label: 'Find files', room: 'files' },
  { id: 'finished-work', label: 'See finished work', room: 'reruns' },
] as const satisfies ReadonlyArray<{ id: string; label: string; room: ReilyRoom }>;

export type ReilyGoalId = typeof REILY_GOALS[number]['id'];

export function goalDestination(goalId: ReilyGoalId): ReilyRoom {
  return REILY_GOALS.find((goal) => goal.id === goalId)!.room;
}

export function reilyRoomPath(room: ReilyRoom, storyId?: string): string {
  if (room === 'home') return '/';
  if (room === 'studio') return storyId ? storyRoomPath('files', storyId) : '/files';
  return storyId ? storyRoomPath(room, storyId) : `/${room}`;
}

export function roomOrientation(room: ReilyRoom): string {
  return SPIRAL_ROOM_PURPOSES[room === 'home' ? 'clubhouse' : room] ?? 'Choose the production room you need.';
}
