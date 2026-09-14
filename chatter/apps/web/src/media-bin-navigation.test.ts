import { describe, expect, it } from 'vitest';
import { mediaBinDestination, newsroomLocation } from './media-bin-navigation.js';

describe('Media Bin navigation', () => {
  it('keeps the complete room route so a story workspace can be restored', () => {
    expect(newsroomLocation({ pathname: '/crew', search: '?story=story-17', hash: '#assignments' })).toBe('/crew?story=story-17#assignments');
  });

  it('opens the Media Bin from a room and returns to the last exact room route', () => {
    expect(mediaBinDestination('/stinger/story-17', '/desk/story-2')).toBe('/files');
    expect(mediaBinDestination('/blast?story=story-17', '/desk/story-2', 'story-17')).toBe('/files?story=story-17');
    expect(mediaBinDestination('/files', '/stinger/story-17')).toBe('/stinger/story-17');
  });

  it('falls back to Clubhouse when no safe return route is known', () => {
    expect(mediaBinDestination('/files', null)).toBe('/');
    expect(mediaBinDestination('/files', '/files')).toBe('/');
  });
});
