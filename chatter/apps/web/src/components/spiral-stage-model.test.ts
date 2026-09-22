import { describe, expect, test } from 'vitest';
import { SPIRAL_ROOMS } from './spiral-navigation.js';
import {
  progressFromScroll,
  roomIndexFromSlug,
  roomSlugFromPathname,
  settledRoomNavigation,
  stagePoint,
  stationFromScroll,
} from './spiral-stage-model.js';

describe('Spiral Stage navigation model', () => {
  test('normalizes routed rooms and keeps adviser outside the room sequence', () => {
    expect(roomSlugFromPathname('/')).toBe('');
    expect(roomSlugFromPathname('/studio/story-1')).toBe('files');
    expect(roomSlugFromPathname('/garage')).toBe('files');
    expect(roomIndexFromSlug('frontdesk')).toBe(-1);
    expect(roomIndexFromSlug('blast')).toBe(SPIRAL_ROOMS.findIndex(room => room.slug === 'blast'));
  });

  test('turns native scroll into bounded fractional progress and settled stations', () => {
    expect(progressFromScroll(250, 100, SPIRAL_ROOMS.length)).toBe(2.5);
    expect(progressFromScroll(-50, 100, SPIRAL_ROOMS.length)).toBe(0);
    expect(stationFromScroll(250, 100, SPIRAL_ROOMS.length)).toBe(3);
    expect(stationFromScroll(9999, 100, SPIRAL_ROOMS.length)).toBe(SPIRAL_ROOMS.length - 1);
    expect(stationFromScroll(400, 0, SPIRAL_ROOMS.length)).toBe(0);
  });

  test('moves the selected station into the central aperture', () => {
    const selected = stagePoint(5, 5, SPIRAL_ROOMS.length);
    const previous = stagePoint(4, 5, SPIRAL_ROOMS.length);
    const next = stagePoint(6, 5, SPIRAL_ROOMS.length);

    expect(selected.scale).toBeGreaterThan(next.scale);
    expect(selected.scale).toBeGreaterThan(previous.scale);
    expect(Math.abs(selected.x - 50)).toBeLessThan(1);
    expect(Math.abs(selected.y - 50)).toBeLessThan(1);
    expect(previous.x).not.toBe(next.x);
    expect(previous.x).toBeLessThan(10);
    expect(next.x).toBeGreaterThan(90);
    expect(selected.depth).toBeGreaterThan(next.depth);
  });

  test('interpolates continuously while moving between stations', () => {
    const before = stagePoint(6, 5, SPIRAL_ROOMS.length);
    const halfway = stagePoint(6, 5.5, SPIRAL_ROOMS.length);
    const selected = stagePoint(6, 6, SPIRAL_ROOMS.length);

    expect(halfway.scale).toBeGreaterThan(before.scale);
    expect(halfway.scale).toBeLessThan(selected.scale);
    expect(halfway.x).not.toBe(before.x);
  });

  test('keeps every process planet legible at a distinct point in the system', () => {
    const system = SPIRAL_ROOMS.map((_, index) => stagePoint(index, 5, SPIRAL_ROOMS.length));
    const positions = new Set(system.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`));

    expect(positions).toHaveLength(SPIRAL_ROOMS.length);
    expect(Math.min(...system.map((point) => point.scale))).toBeGreaterThanOrEqual(.4);
    expect(Math.min(...system.map((point) => point.opacity))).toBeGreaterThanOrEqual(.3);
  });

  test('emits one route change for one settled destination', () => {
    expect(settledRoomNavigation('slate', undefined, 'crew')).toBe('crew');
    expect(settledRoomNavigation('slate', 'crew', 'crew')).toBeUndefined();
    expect(settledRoomNavigation('crew', undefined, 'crew')).toBeUndefined();
  });
});
