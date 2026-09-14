import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { createShowtimeProject, makeShowtimeClip } from '@chatter/shared';
import { ShowtimeCutWorkspace } from './ShowtimeCutWorkspace.js';

describe('Showtime magnetic Cut workspace', () => {
  test('presents source editing, a Program transport, and the standard multitrack lanes', () => {
    const project = createShowtimeProject({ title: 'Morning bulletin' });
    project.clips.push(makeShowtimeClip({ assetId: 'take', name: 'Anchor take', durationSec: 8 }));
    const html = renderToStaticMarkup(createElement(ShowtimeCutWorkspace, {
      project,
      assets: [],
      urls: new Map(),
      assetDurations: new Map(),
      assetFrames: new Map(),
      findings: [],
      onCommit: () => undefined,
      onShoot: () => undefined,
      onNotice: () => undefined,
    }));

    expect(html).toContain('SOURCE');
    expect(html).toContain('PROGRAM');
    expect(html).toContain('Set In');
    expect(html).toContain('Insert');
    expect(html).toContain('Overwrite');
    expect(html).toContain('Place on top');
    expect(html).toContain('Primary story');
    expect(html).toContain('Titles');
    expect(html).toContain('Voice');
    expect(html).toContain('Music');
    expect(html).toContain('Sounds');
    expect(html).toContain('Undo');
    expect(html).toContain('Split');
  });
});
