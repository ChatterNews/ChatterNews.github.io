import { describe, expect, it } from 'vitest';
import { atmosphereRoomFromPathname, pointerTrailEnabled } from './room-atmosphere.js';

describe('room atmosphere routing', () => {
  it('keeps nested story routes inside their room atmosphere', () => {
    expect(atmosphereRoomFromPathname('/booth/story-17')).toBe('booth');
    expect(atmosphereRoomFromPathname('/reruns/podcast/episode-3')).toBe('reruns');
  });

  it('uses the Clubhouse atmosphere at the front door and Studio for the old Garage route', () => {
    expect(atmosphereRoomFromPathname('/')).toBe('clubhouse');
    expect(atmosphereRoomFromPathname('/garage?story=demo')).toBe('studio');
  });
});

describe('pointer trail availability', () => {
  it('only enables the trail for a precise hovering pointer without reduced motion', () => {
    expect(pointerTrailEnabled({ finePointer: true, hover: true, reducedMotion: false })).toBe(true);
    expect(pointerTrailEnabled({ finePointer: false, hover: true, reducedMotion: false })).toBe(false);
    expect(pointerTrailEnabled({ finePointer: true, hover: false, reducedMotion: false })).toBe(false);
    expect(pointerTrailEnabled({ finePointer: true, hover: true, reducedMotion: true })).toBe(false);
  });
});
