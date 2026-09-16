import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { SpiralStage } from './SpiralStage.js';

function markup(room = 'blast', storyControl: ReactNode = createElement('span', {}, 'Story route')) {
  return renderToStaticMarkup(createElement(SpiralStage, {
    currentRoom: room,
    recommendedRoom: 'greenlight',
    storyTitle: 'Book fair',
    onNavigate: () => undefined,
    storyControl,
    driveControl: createElement('span', {}, 'Story drive'),
    identityControl: createElement('span', {}, 'Badge'),
    mediaControl: createElement('button', {}, 'Files'),
    adviserControl: null,
    children: createElement('main', {}, 'Blast editor'),
  }));
}

describe('Spiral Stage shell', () => {
  test('renders a live center frame, twelve snap stations, and utility satellites', () => {
    const html = markup();

    expect(html).toContain('data-navigation-world="newsroom-solar-system"');
    expect(html).toContain('spiral-center-frame');
    expect(html.match(/data-snap-station=/g)).toHaveLength(12);
    expect(html.match(/data-process-planet=/g)).toHaveLength(12);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Blast editor');
    expect(html).toContain('Story route');
    expect(html).toContain('Story drive');
    expect(html).toContain('Badge');
    expect(html).toContain('Files');
  });

  test('uses native scroll semantics and exposes direct keyboard navigation', () => {
    const html = markup('chatterbox');

    expect(html).toContain('aria-label="Travel the newsroom solar system"');
    expect(html).toContain('data-stage-scroll="native-snap"');
    expect(html).toContain('aria-label="Open room map"');
    expect(html).toContain('aria-label="Room map"');
    expect(html.match(/data-map-station=/g)).toHaveLength(12);
    expect(html.match(/data-orbit-band=/g)).toHaveLength(3);
    expect(html).toContain('Plan &amp; report');
    expect(html).toContain('Create');
    expect(html).toContain('Finish &amp; publish');
    expect(html).toContain('data-recommended="true"');
    expect(html).toContain('Use arrow keys to travel one room at a time');
    expect(html).toContain('data-stage-near="true"');
  });

  test('keeps one visible work-view control on the center frame', () => {
    const html = markup('showtime');

    expect(html).toContain('data-work-view="false"');
    expect(html.match(/data-frame-control="workspace-mode"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Expand room workspace"');
    expect(html).toContain('Showtime');
    expect(html).toContain('Work view');
    expect(html).toContain('data-frame-slot="left-progress"');
    expect(html).toContain('data-frame-slot="right-room"');
  });

  test('does not reserve a workflow dock when no story is being tracked', () => {
    const html = markup('slate', null);

    expect(html).not.toContain('data-frame-slot="left-progress"');
    expect(html).toContain('data-frame-slot="right-room"');
  });

  test('builds the route controls and room as one continuous window', () => {
    const html = markup('crew');

    expect(html).toContain('class="spiral-window-shell"');
    expect(html).toContain('class="spiral-window-toolbar"');
    expect(html).toMatch(/spiral-window-shell[^>]*><header[^>]*spiral-window-toolbar[\s\S]*data-frame-slot="left-progress"[\s\S]*data-frame-slot="right-room"[\s\S]*spiral-center-room/);
  });

  test('keeps Front Desk outside the room sequence while preserving the live frame', () => {
    const html = markup('frontdesk');

    expect(html).toContain('data-active-room="frontdesk"');
    expect(html).not.toContain('aria-current="page"');
    expect(html).toContain('Blast editor');
  });
});
