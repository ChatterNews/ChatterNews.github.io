import type { SpiralRoom } from './spiral-navigation.js';

export type RoomPreviewKind =
  | 'table'
  | 'notebook'
  | 'assignment-dial'
  | 'typewriter'
  | 'microphone'
  | 'record'
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
  studio: 'record',
  chatterbox: 'podcast-reels',
  blast: 'print-carousel',
  stinger: 'broadcast-lens',
  showtime: 'edit-monitor',
  greenlight: 'signal-stack',
  files: 'media-wheel',
  reruns: 'archive-carousel',
};

export function previewKindForRoom(room: SpiralRoom): RoomPreviewKind {
  return PREVIEW_KIND_BY_ROOM[room.slug] ?? 'table';
}

function PhysicalObject({ kind }: { kind: RoomPreviewKind }) {
  switch (kind) {
    case 'table':
      return <span className="preview-table"><i /><i /><i /><i /><b>CN</b></span>;
    case 'notebook':
      return <span className="preview-notebook"><i /><i /><i /><b>ANGLE</b></span>;
    case 'assignment-dial':
      return <span className="preview-assignment"><i /><i /><i /><b /></span>;
    case 'typewriter':
      return <span className="preview-typewriter"><i /><i /><b>STORY</b><em /></span>;
    case 'microphone':
      return <span className="preview-microphone"><i /><i /><b /><em /></span>;
    case 'record':
      return <span className="preview-record"><i /><b /><em>33</em></span>;
    case 'podcast-reels':
      return <span className="preview-podcast"><i /><i /><b>ON AIR</b><em /></span>;
    case 'print-carousel':
      return <span className="preview-print"><i /><i /><i /><b>PRINT</b></span>;
    case 'broadcast-lens':
      return <span className="preview-lens"><i /><i /><b>SAFE</b><em /></span>;
    case 'edit-monitor':
      return <span className="preview-monitor"><i /><b /><b /><b /><em /></span>;
    case 'signal-stack':
      return <span className="preview-signal"><i /><i /><i /><b>CHECK</b></span>;
    case 'media-wheel':
      return <span className="preview-media"><i /><b /><em>FILES</em></span>;
    case 'archive-carousel':
      return <span className="preview-archive"><i /><i /><i /><b>PLAY</b></span>;
  }
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
      <span className="room-preview-object"><PhysicalObject kind={kind} /></span>
      <span className="room-preview-copy">
        <small>{room.verb}</small>
        <b>{room.name}</b>
        {closeEnoughForContext && title && <em>{title}</em>}
      </span>
    </span>
  );
}
