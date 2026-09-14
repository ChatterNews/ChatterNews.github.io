import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { SPIRAL_ROOMS } from './spiral-navigation.js';
import { RoomPreview } from './RoomPreview.js';

describe('Spiral Stage room previews', () => {
  test('gives every newsroom room its own physical preview grammar', () => {
    const previews = SPIRAL_ROOMS.map((room) => renderToStaticMarkup(createElement(RoomPreview, {
      room,
      active: room.slug === 'blast',
      distance: room.slug === 'blast' ? 0 : 1,
      title: 'Book fair',
    })));
    const kinds = previews.map((html) => html.match(/data-preview-kind="([^"]+)/)?.[1]);

    expect(new Set(kinds).size).toBe(SPIRAL_ROOMS.length);
    expect(kinds).toContain('broadcast-lens');
    expect(kinds).toContain('print-carousel');
    expect(kinds).toContain('podcast-reels');
    expect(kinds).toContain('archive-carousel');
  });

  test('shows useful live context only near the aperture', () => {
    const room = SPIRAL_ROOMS.find((item) => item.slug === 'blast')!;
    const near = renderToStaticMarkup(createElement(RoomPreview, {
      room, active: false, distance: 1, title: 'Book fair',
    }));
    const far = renderToStaticMarkup(createElement(RoomPreview, {
      room, active: false, distance: 4, title: 'Book fair',
    }));

    expect(near).toContain('Book fair');
    expect(near).toContain('Print it');
    expect(far).not.toContain('Book fair');
  });

  test('marks the docked room as the live object', () => {
    const room = SPIRAL_ROOMS.find((item) => item.slug === 'studio')!;
    const html = renderToStaticMarkup(createElement(RoomPreview, {
      room, active: true, distance: 0, title: 'Morning show',
    }));

    expect(html).toContain('data-preview-active="true"');
    expect(html).toContain('Studio');
    expect(html).toContain('Morning show');
  });
});
