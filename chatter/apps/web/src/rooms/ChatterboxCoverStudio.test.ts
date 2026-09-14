import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ChatterboxCoverStudio } from './ChatterboxCoverStudio.js';

describe('Chatterbox cover studio', () => {
  test('offers the show cover, episode choices, upload, and full Blast editing', () => {
    const html = renderToStaticMarkup(createElement(ChatterboxCoverStudio, {
      showTitle: 'Chatterbox Podcast', episodeTitle: 'Maker Lab', episodeNumber: 4,
      artworkMode: 'SHOW', showCoverId: 'show-art', episodeCoverId: 'episode-art', effectiveCoverId: 'show-art',
      choices: [{ assetId: 'show-art', title: 'Show cover', source: 'Blast' }], urls: new Map([['show-art', 'blob:show']]),
      onUseShow: () => undefined, onUseEpisode: () => undefined, onSetShow: () => undefined,
      onChoose: () => undefined, onUpload: () => undefined, onEditBlast: () => undefined, onClose: () => undefined,
    }));
    expect(html).toContain('COVER STUDIO');
    expect(html).toContain('Use show cover');
    expect(html).toContain('Upload cover');
    expect(html).toContain('Choose from Media Bin');
    expect(html).toContain('Edit in Blast');
  });
});
