import { describe, expect, it } from 'vitest';
import { goalDestination, REILY_GOALS, reilyRoomPath, roomOrientation } from './reily-navigation.js';

describe('Reily goal navigation', () => {
  it('maps student intentions to production rooms', () => {
    expect(REILY_GOALS.map(({ id, room }) => [id, room])).toEqual([
      ['record-voice', 'booth'],
      ['plan-project', 'slate'],
      ['write-words', 'desk'],
      ['organize-crew', 'crew'],
      ['make-podcast', 'chatterbox'],
      ['design-page', 'blast'],
      ['screen-graphics', 'stinger'],
      ['edit-video', 'showtime'],
      ['review-work', 'greenlight'],
      ['find-files', 'files'],
      ['finished-work', 'reruns'],
    ]);
    expect(goalDestination('design-page')).toBe('blast');
  });

  it('preserves story identity using each room canonical route shape', () => {
    expect(reilyRoomPath('booth', 'story 9')).toBe('/booth/story%209');
    expect(reilyRoomPath('studio', 'story 9')).toBe('/files?story=story%209');
    expect(reilyRoomPath('home', 'story 9')).toBe('/');
    expect(reilyRoomPath('booth')).toBe('/booth');
  });

  it('uses the shared room description for orientation', () => {
    expect(roomOrientation('blast')).toBe('Design pages, flyers, and covers.');
    expect(roomOrientation('home')).toBe('Choose a story and see its route.');
  });
});
