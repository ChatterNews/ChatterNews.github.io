import { RoomIcon } from './RoomIcon.js';
import type { SpiralRoom } from './spiral-navigation.js';

export type RoomPreviewKind =
  | 'table'
  | 'notebook'
  | 'assignment-dial'
  | 'typewriter'
  | 'microphone'
  | 'podcast-reels'
  | 'print-carousel'
  | 'broadcast-lens'
  | 'edit-monitor'
  | 'signal-stack'
  | 'media-wheel'
  | 'archive-carousel';

const PREVIEW_KIND_BY_ROOM: Record<string, RoomPreviewKind> = {
  '': 'table',
  slate: 'notebook',
  crew: 'assignment-dial',
  desk: 'typewriter',
  booth: 'microphone',
  chatterbox: 'podcast-reels',
  blast: 'print-carousel',
  stinger: 'broadcast-lens',
  showtime: 'edit-monitor',
  greenlight: 'signal-stack',
  files: 'media-wheel',
  reruns: 'archive-carousel',
};

export function previewKindForRoom(room: Pick<SpiralRoom, 'slug'>): RoomPreviewKind {
  return PREVIEW_KIND_BY_ROOM[room.slug] ?? 'table';
}

export function RoomPreview({
  room,
  active,
  distance,
  title,
}: {
  room: SpiralRoom;
  active: boolean;
  distance: number;
  title?: string;
}) {
  const kind = previewKindForRoom(room);
  const closeEnoughForContext = active || Math.abs(distance) <= 1.25;

  return (
    <span
      className={`room-preview room-preview-${kind}`}
      data-preview-kind={kind}
      data-preview-active={active ? 'true' : 'false'}
      aria-hidden="true"
    >
      <span className="room-preview-object"><RoomIcon kind={kind} /></span>
      <span className="room-preview-copy">
        <small>{room.verb}</small>
        <b>{room.name}</b>
        {closeEnoughForContext && title && <em>{title}</em>}
      </span>
    </span>
  );
}
