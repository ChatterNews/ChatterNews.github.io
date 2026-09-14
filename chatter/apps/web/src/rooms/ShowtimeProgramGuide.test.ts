import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { applyShowtimeRecipe, createShowtimeProject, makeShowtimeClip, showtimeCutCheck } from '@chatter/shared';
import { ShowtimeCutCheck, ShowtimeRecipePicker, ShowtimeRundownRail } from './ShowtimeProgramGuide.js';

describe('Showtime program guide', () => {
  test('presents the five recipes as program shapes, not finished content', () => {
    const html = renderToStaticMarkup(createElement(ShowtimeRecipePicker, { onChoose: () => undefined }));
    expect(html).toContain('PROGRAM RECIPES');
    expect(html).toContain('60-second bulletin');
    expect(html).toContain('3-minute package');
    expect(html).toContain('Interview profile');
    expect(html).toContain('Event recap');
    expect(html).toContain('Vertical social report');
    expect(html).not.toMatch(/lorem|generated script|sample quote/i);
  });

  test('shows the intended rundown beside actual running time', () => {
    const project = applyShowtimeRecipe(createShowtimeProject(), 'BULLETIN_60');
    project.clips.push(makeShowtimeClip({ assetId: 'clip', name: 'Opening', durationSec: 12 }));
    const html = renderToStaticMarkup(createElement(ShowtimeRundownRail, { project, onChangeRecipe: () => undefined }));
    expect(html).toContain('PROGRAM BOARD');
    expect(html).toContain('00:12 / 01:00');
    expect(html).toContain('Lead story');
    expect(html).toContain('Quick hits');
  });

  test('turns cut findings into buttons that can take a student to the exact edit', () => {
    const project = applyShowtimeRecipe(createShowtimeProject(), 'BULLETIN_60');
    const clip = makeShowtimeClip({ assetId: 'clip', name: 'Vertical phone clip', durationSec: 12, width: 1080, height: 1920 });
    project.clips.push(clip);
    const findings = showtimeCutCheck(project, { availableAssetIds: new Set(['clip']), transcripts: [] });
    const html = renderToStaticMarkup(createElement(ShowtimeCutCheck, { findings, onSelect: () => undefined }));
    expect(html).toContain('CUT CHECK');
    expect(html).toContain('Frame shape');
    expect(html).toContain('Planned ending');
    expect(html).toContain('button');
  });
});
