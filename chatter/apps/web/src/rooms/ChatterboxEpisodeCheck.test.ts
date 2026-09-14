import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ChatterboxEpisodeCheck } from './ChatterboxEpisodeCheck.js';

describe('Chatterbox Episode Check', () => {
  test('turns episode findings into direct production moves', () => {
    const html = renderToStaticMarkup(createElement(ChatterboxEpisodeCheck, {
      findings: [{ code: 'dead-air', severity: 'ADVISORY', title: 'Long silence at 00:04', message: 'Close the gap or keep it intentionally.', station: 'CUT', atSec: 4 }],
      onFocus: () => undefined,
      onClose: () => undefined,
    }));
    expect(html).toContain('EPISODE CHECK');
    expect(html).toContain('Long silence at 00:04');
    expect(html).toContain('Open Cut');
  });
});
