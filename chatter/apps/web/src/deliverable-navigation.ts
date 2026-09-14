import { storyRoomPath, type DeliverableRoom } from '@chatter/shared';

type DeliverableLink = { room: DeliverableRoom; storyId?: string; sourceProjectId?: string };

export function deliverableRoomPath(item: DeliverableLink): string {
  if (item.room === 'CHATTERBOX') {
    return item.sourceProjectId ? `/chatterbox?project=${encodeURIComponent(item.sourceProjectId)}` : '/chatterbox';
  }
  const room = item.room === 'GARAGE' ? '/studio' : `/${item.room.toLowerCase()}`;
  let path = item.storyId ? storyRoomPath(room, item.storyId) : room;
  if (item.room === 'BLAST' && item.sourceProjectId) {
    path += `${path.includes('?') ? '&' : '?'}project=${encodeURIComponent(item.sourceProjectId)}`;
  }
  return path;
}
