import { describe, expect, test } from 'vitest';
import { buildPodcastCoverProject, podcastCoverHandoff } from './podcast-cover.js';

describe('Chatterbox cover handoff', () => {
  test('builds a square Blast document whose art and words remain editable', () => {
    const cover = buildPodcastCoverProject({ showTitle: 'Chatterbox Podcast', episodeTitle: 'Inside the Maker Lab', episodeNumber: 7, artworkAssetId: 'photo-1' });
    expect(cover).toMatchObject({ format: 'SQUARE', width: 1080, height: 1080 });
    const layers = cover.pages[0]!.elements;
    expect(layers.find((item) => item.role === 'PHOTO')).toMatchObject({ kind: 'IMAGE', imageAssetId: 'photo-1' });
    expect(layers.find((item) => item.role === 'HEADLINE')?.text).toBe('Inside the Maker Lab');
    expect(layers.find((item) => item.role === 'KICKER')?.text).toContain('Chatterbox Podcast');
    expect(layers.every((item) => !item.locked)).toBe(true);
  });

  test('uses explicit query keys for selecting Blast work and returning it to the episode', () => {
    expect(podcastCoverHandoff('blast-1', 'podcast-1')).toBe('/blast?project=blast-1&podcastCover=podcast-1');
  });

  test('does not leave a broken photo placeholder when the episode starts without art', () => {
    const cover = buildPodcastCoverProject({ showTitle: 'Chatterbox', episodeTitle: 'New episode' });
    expect(cover.pages[0]!.elements.filter((item) => item.kind === 'IMAGE')).toHaveLength(0);
  });
});
