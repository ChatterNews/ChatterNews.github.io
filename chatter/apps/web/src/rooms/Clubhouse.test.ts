import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ClubhouseRoomRacks } from './Clubhouse.js';

describe('Clubhouse room racks', () => {
  test('groups every room by the job it does instead of rendering identical tiles', () => {
    const html = renderToStaticMarkup(createElement(ClubhouseRoomRacks, {
      counts: { slate: 3, crew: 2, greenlight: 1 },
      trackedStoryId: 'story one',
      activeRooms: new Set(['/blast']),
      onNavigate: () => undefined,
    }));
    expect(html).toContain('Plan');
    expect(html).toContain('Make');
    expect(html).toContain('Finish');
    expect(html).not.toContain('Studio');
    expect(html).not.toContain('/studio');
    for (const room of ['Slate', 'Crew', 'Desk', 'Booth', 'Chatterbox', 'Blast', 'Stinger', 'Showtime', 'Green Light', 'Media Bin', 'Reruns']) {
      expect(html).toContain(room);
    }
    expect(html).toContain('3 active stories');
    expect(html).toContain('2 open assignments');
    expect(html).toContain('On this route');
    expect(html).toContain('/blast?story=story%20one');
  });
});
