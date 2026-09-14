import { describe, expect, test } from 'vitest';
import type { ShowtimeProject } from '@chatter/shared';
import { showtimeWorkingAssetIds } from './showtime-working-set.js';

const project = {
  clips: [
    { assetId: 'cut-a' },
    { assetId: 'cut-b' },
    { assetId: 'cut-a' },
  ],
} as ShowtimeProject;

describe('Showtime media working set', () => {
  test('hydrates only cut media, the source selection, and live asset sources', () => {
    const ids = showtimeWorkingAssetIds(project, 'source-c', 'ASSET:live-d', 'ASSET:program-e');
    expect([...ids].sort()).toEqual(['cut-a', 'cut-b', 'live-d', 'program-e', 'source-c']);
  });

  test('does not turn cameras, screens, or black into asset ids', () => {
    expect([...showtimeWorkingAssetIds(undefined, undefined, 'CAMERA', 'BLACK')]).toEqual([]);
    expect([...showtimeWorkingAssetIds(undefined, undefined, 'SCREEN', 'CAMERA')]).toEqual([]);
  });
});
