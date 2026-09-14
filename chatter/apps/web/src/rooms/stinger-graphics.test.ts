import { describe, expect, it } from 'vitest';
import type { MotionTheme } from '@chatter/shared';
import {
  STINGER_GRAPHIC_CATEGORIES,
  STINGER_GRAPHICS,
  buildStingerGraphic,
  filterStingerGraphics,
  insertStingerGraphicElements,
  makeStingerKeyframeAtPlayhead,
  moveStingerGraphicGroup,
} from './stinger-graphics.js';

const theme: MotionTheme = {
  showName: 'Chatter News',
  primary: '#201535',
  secondary: '#58C8C0',
  accent: '#F3D33F',
  paper: '#FFF7DE',
  ink: '#211829',
  fontDisplay: 'Bricolage Grotesque',
  fontBody: 'Atkinson Hyperlegible Next',
};

describe('Stinger Add Graphic palette', () => {
  it('covers newsroom graphics before basic pieces', () => {
    expect(STINGER_GRAPHIC_CATEGORIES.map((item) => item.id)).toEqual([
      'HEADLINES', 'LOWER_THIRDS', 'QUOTES', 'SCORES', 'TICKERS', 'BADGES',
      'PHOTO_FRAMES', 'LOGO_MOMENTS', 'TRANSITIONS', 'BACKGROUNDS', 'BASIC',
    ]);
    expect(new Set(STINGER_GRAPHICS.map((item) => item.id)).size).toBe(STINGER_GRAPHICS.length);
    expect(STINGER_GRAPHICS.filter((item) => item.category !== 'BASIC').length).toBeGreaterThanOrEqual(14);
    expect(STINGER_GRAPHICS.filter((item) => item.category !== 'BASIC').every((item) => item.sceneKinds?.length)).toBe(true);
  });

  it('builds one coordinated, editable lower-third group inside title safe', () => {
    const elements = buildStingerGraphic('reporter-lower-third', {
      width: 1920,
      height: 1080,
      durationMs: 5200,
      theme,
    });

    expect(elements.length).toBeGreaterThanOrEqual(3);
    expect(new Set(elements.map((item) => item.groupId)).size).toBe(1);
    expect(elements.every((item) => !item.locked && !item.recipeOwned)).toBe(true);
    expect(elements.some((item) => item.role === 'BYLINE')).toBe(true);
    expect(elements.some((item) => item.binding === 'BYLINE')).toBe(true);
    expect(elements.every((item) => item.x >= 96 && item.y >= 54)).toBe(true);
    expect(elements.every((item) => item.x + item.width <= 1824 && item.y + item.height <= 1026)).toBe(true);
    expect(elements.map((item) => item.text).filter(Boolean).join(' ')).not.toMatch(/type something great/i);
  });

  it('filters by job, search, scene compatibility, and recent use', () => {
    expect(filterStingerGraphics({ category: 'SCORES', sceneKind: 'STAT' }).every((item) => item.category === 'SCORES')).toBe(true);
    expect(filterStingerGraphics({ query: 'name bar', sceneKind: 'LOWER_THIRD' }).map((item) => item.id)).toContain('reporter-lower-third');
    expect(filterStingerGraphics({ query: '', sceneKind: 'HEADLINE' }).map((item) => item.id)).not.toContain('signal-wipe');
    expect(filterStingerGraphics({ category: 'RECENT', sceneKind: 'HEADLINE', recentIds: ['news-ticker', 'headline-slab'] }).map((item) => item.id)).toEqual(['news-ticker', 'headline-slab']);
    expect(filterStingerGraphics({ category: 'RECENT', query: 'ticker', sceneKind: 'HEADLINE', recentIds: ['news-ticker', 'headline-slab'] }).map((item) => item.id)).toEqual(['news-ticker']);
  });

  it('adapts a photo frame to the active package and keeps the media replaceable', () => {
    const elements = buildStingerGraphic('portrait-window', {
      width: 1080,
      height: 1920,
      durationMs: 6000,
      theme,
      imageAssetId: 'asset-123',
    });
    const photo = elements.find((item) => item.kind === 'IMAGE');

    expect(photo).toMatchObject({ role: 'PHOTO', imageAssetId: 'asset-123', locked: false });
    expect(elements.some((item) => item.fill === theme.accent || item.stroke === theme.accent)).toBe(true);
    expect(elements.every((item) => item.x >= 54 && item.x + item.width <= 1026)).toBe(true);
  });

  it('builds background systems edge to edge', () => {
    const elements = buildStingerGraphic('split-signal', {
      width: 1920,
      height: 1080,
      durationMs: 5200,
      theme,
    });

    expect(elements[0]).toMatchObject({ x: 0, y: 0, height: 1080 });
    expect(elements.some((item) => item.x + item.width === 1920)).toBe(true);
    const oldBackground = buildStingerGraphic('grid-wall', { width: 1920, height: 1080, durationMs: 5200, theme }).map((item) => ({ ...item, backgroundGroup: undefined }));
    const foreground = { ...elements[0]!, id: 'old-foreground', groupId: 'foreground-group', name: 'Headline slab', backgroundGroup: false };
    const replaced = insertStingerGraphicElements([...oldBackground, foreground], elements, 'BACKGROUNDS');
    expect(replaced.at(-1)?.id).toBe('old-foreground');
    expect(replaced.some((item) => item.groupId === oldBackground[0]!.groupId)).toBe(false);
    expect(replaced.slice(0, elements.length).every((item) => item.backgroundGroup)).toBe(true);
  });

  it('starts transition motion at its first keyframe without flashing on canvas', () => {
    const elements = buildStingerGraphic('signal-wipe', {
      width: 1920,
      height: 1080,
      durationMs: 1500,
      theme,
    });

    expect(elements.every((item) => item.x === item.keyframes[0]?.x)).toBe(true);
  });

  it('keeps a circle circular in a vertical package', () => {
    const [circle] = buildStingerGraphic('basic-circle', {
      width: 1080,
      height: 1920,
      durationMs: 5200,
      theme,
    });

    expect(circle?.width).toBe(circle?.height);
  });

  it('moves every layer in an inserted graphic while keeping other layers still', () => {
    const group = buildStingerGraphic('reporter-lower-third', {
      width: 1920,
      height: 1080,
      durationMs: 5200,
      theme,
    });
    const locked = { ...group[1]!, locked: true };
    const outsider = { ...group[0]!, id: 'outside', groupId: 'another-group', x: 10, y: 20 };
    const moved = moveStingerGraphicGroup([group[0]!, locked, ...group.slice(2), outsider], group[2]!.id, 30, -10);

    expect(moved[0]).toMatchObject({ x: group[0]!.x + 30, y: group[0]!.y - 10 });
    expect(moved[1]).toMatchObject({ x: locked.x, y: locked.y, locked: true });
    expect(moved.slice(2, group.length).every((item, index) => item.x === group[index + 2]!.x + 30 && item.y === group[index + 2]!.y - 10)).toBe(true);
    expect(moved.at(-1)).toMatchObject({ id: 'outside', x: 10, y: 20 });
  });

  it('moves an inserted transition together with its animation path', () => {
    const group = buildStingerGraphic('signal-wipe', {
      width: 1920,
      height: 1080,
      durationMs: 1500,
      theme,
    });
    const moved = moveStingerGraphicGroup(group, group[0]!.id, 40, 25);

    expect(moved[0]!.keyframes.map((item) => item.x)).toEqual(group[0]!.keyframes.map((item) => (item.x ?? 0) + 40));
    expect(moved[0]!.keyframes.map((item) => item.y)).toEqual(group[0]!.keyframes.map((item) => item.y === undefined ? undefined : item.y + 25));
  });

  it('adds a keyframe at the animated playhead position instead of the off-screen base', () => {
    const [wipe] = buildStingerGraphic('signal-wipe', { width: 1920, height: 1080, durationMs: 1500, theme });
    const scene = { id: 'scene', name: 'Transition', kind: 'TRANSITION' as const, durationMs: 1500, background: 'transparent', elements: [wipe!] };
    const frame = makeStingerKeyframeAtPlayhead(wipe!, 500, scene);

    expect(frame.x).toBe(96);
    expect(frame.x).not.toBe(wipe!.x);
  });
});
