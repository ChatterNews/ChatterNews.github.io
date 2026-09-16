import { SPIRAL_ROOMS } from './spiral-navigation.js';

export interface StagePoint {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  depth: number;
  rotate: number;
  distance: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function roomSlugFromPathname(pathname: string): string {
  const slug = pathname.split('?')[0]!.split('/').filter(Boolean)[0] ?? '';
  return slug === 'garage' || slug === 'studio' ? 'files' : slug;
}

export function roomIndexFromSlug(slug: string): number {
  return SPIRAL_ROOMS.findIndex((room) => room.slug === slug);
}

export function progressFromScroll(
  scrollTop: number,
  viewportHeight: number,
  count = SPIRAL_ROOMS.length,
): number {
  if (viewportHeight <= 0 || count <= 1) return 0;
  return clamp(scrollTop / viewportHeight, 0, count - 1);
}

export function stationFromScroll(
  scrollTop: number,
  viewportHeight: number,
  count = SPIRAL_ROOMS.length,
): number {
  return Math.round(progressFromScroll(scrollTop, viewportHeight, count));
}

export function settledRoomNavigation(
  currentSlug: string,
  pendingSlug: string | undefined,
  targetSlug: string,
): string | undefined {
  if (targetSlug === currentSlug || targetSlug === pendingSlug) return undefined;
  return targetSlug;
}

/**
 * Places one room relative to the fractional scroll position. The selected
 * room docks at the aperture; neighbors peel away in opposite directions on
 * an expanding spiral instead of lining up as cards.
 */
export function stagePoint(
  index: number,
  progress: number,
  count = SPIRAL_ROOMS.length,
): StagePoint {
  const boundedProgress = clamp(progress, 0, Math.max(0, count - 1));
  const distance = index - boundedProgress;
  const absoluteDistance = Math.abs(distance);
  const reveal = Math.min(1, absoluteDistance);
  // The extra distance curve prevents far-away rooms from stacking on the
  // same five points. Nearby planets still sweep past the center quickly,
  // while the full newsroom remains readable as one solar system.
  const angle = (-90 + distance * 72 + Math.sign(distance) * absoluteDistance * absoluteDistance * 3) * Math.PI / 180;
  const radiusX = reveal * (43 + Math.min(absoluteDistance, 3) * 4);
  const radiusY = reveal * (27 + Math.min(absoluteDistance, 3) * 3.5);

  return {
    x: 50 + Math.cos(angle) * radiusX,
    y: 50 + Math.sin(angle) * radiusY,
    scale: clamp(1 - absoluteDistance * 0.2, 0.42, 1),
    opacity: clamp(1 - Math.max(0, absoluteDistance - 1.2) * 0.2, 0.34, 1),
    depth: Math.round(100 - Math.min(absoluteDistance, 9) * 8),
    rotate: distance * 9,
    distance,
  };
}
