import { describe, expect, test } from 'vitest';
import {
  frontDeskStoryDriveDestination, needsFrontDeskStoryDrive,
} from './FrontDesk.js';

describe('Front Desk Story Drive landing', () => {
  test('appears only when the adviser has no local stories', () => {
    expect(needsFrontDeskStoryDrive([])).toBe(true);
    expect(needsFrontDeskStoryDrive([{ id: 'story-1' }])).toBe(false);
  });

  test('opens an imported story at its Green Light review', () => {
    expect(frontDeskStoryDriveDestination('story-1')).toBe('/greenlight/story-1');
  });
});
