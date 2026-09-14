import { describe, expect, test } from 'vitest';
import { keptPodcastRanges } from './podcast-audio.js';
import type { PodcastClip } from '@chatter/shared';

const clip: PodcastClip = { id: 'c', assetId: 'a', trackId: 't', name: 'voice', startSec: 0, trimInSec: 2, trimOutSec: 12, sourceDurationSec: 15, gainDb: 0, fadeInSec: .1, fadeOutSec: .1, muted: false, omittedRanges: [] };

describe('podcast audio decisions', () => {
  test('turns overlapping transcript cuts into the kept source ranges', () => {
    expect(keptPodcastRanges({ ...clip, omittedRanges: [{ start: 3, end: 5 }, { start: 4, end: 7 }, { start: 10, end: 20 }] })).toEqual([{ start: 2, end: 3 }, { start: 7, end: 10 }]);
  });
  test('keeps the full trim when no transcript words are removed', () => { expect(keptPodcastRanges(clip)).toEqual([{ start: 2, end: 12 }]); });
});
