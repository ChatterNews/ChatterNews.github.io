import { storyRoomPath, type DeliverableRoom } from '@chatter/shared';

type DeliverableLink = { room: DeliverableRoom; storyId?: string; sourceProjectId?: string };

export function deliverableRoomPath(item: DeliverableLink): string {
  if (item.room === 'CHATTERBOX') {
    return item.sourceProjectId ? `/chatterbox?project=${encodeURIComponent(item.sourceProjectId)}` : '/chatterbox';
  }
  const room = item.room === 'GARAGE' ? '/files' : item.room === 'SHOWTIME' ? '/stinger' : `/${item.room.toLowerCase()}`;
  let path = item.storyId ? storyRoomPath(room, item.storyId) : room;
  if ((item.room === 'BLAST' || item.room === 'SHOWTIME' || item.room === 'STINGER') && item.sourceProjectId) {
    path += `${path.includes('?') ? '&' : '?'}${item.room === 'STINGER' ? 'graphic' : 'project'}=${encodeURIComponent(item.sourceProjectId)}`;
  }
  return path;
}
