import { describe, expect, it } from 'vitest';
import { deliverableRoomPath } from './deliverable-navigation.js';

describe('Media Bin workspace links', () => {
  it('returns to the exact saved project when a room exposes project links', () => {
    expect(deliverableRoomPath({ room: 'SHOWTIME', storyId: 'story-1', sourceProjectId: 'video-2' })).toBe('/stinger/story-1?project=video-2');
    expect(deliverableRoomPath({ room: 'STINGER', sourceProjectId: 'kit-3' })).toBe('/stinger?graphic=kit-3');
    expect(deliverableRoomPath({ room: 'BLAST', storyId: 'story-1', sourceProjectId: 'blast-2' })).toBe('/blast?story=story-1&project=blast-2');
    expect(deliverableRoomPath({ room: 'CHATTERBOX', storyId: 'story-1', sourceProjectId: 'pod-3' })).toBe('/chatterbox?project=pod-3');
  });

  it('keeps the story attached when reopening every other production room', () => {
    expect(deliverableRoomPath({ room: 'GARAGE', storyId: 'story-1' })).toBe('/files?story=story-1');
    expect(deliverableRoomPath({ room: 'SHOWTIME', storyId: 'story-1' })).toBe('/stinger/story-1');
    expect(deliverableRoomPath({ room: 'STINGER', storyId: 'story-1' })).toBe('/stinger/story-1');
    expect(deliverableRoomPath({ room: 'DESK' })).toBe('/desk');
  });
});
