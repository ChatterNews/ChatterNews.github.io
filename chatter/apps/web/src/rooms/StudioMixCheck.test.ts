import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { StudioMixCheck } from './StudioMixCheck.js';

describe('Studio Mix Check', () => {
  test('shows measured craft checks with a direct next move', () => {
    const html = renderToStaticMarkup(createElement(StudioMixCheck, {
      checks: [
        { id: 'CLIPPING', label: 'Headroom', status: 'FIX', detail: 'Turn the loudest track down.', trackId: 'track-1' },
        { id: 'VOICE_BALANCE', label: 'Voice', status: 'PASS', detail: 'The words stay clear.' },
        { id: 'LOW_END', label: 'Low end', status: 'FIX', detail: 'Try a bass part.', suggestedTrackKind: 'BASS' },
      ],
      measuring: false,
      onMeasure: () => undefined,
      onFocusTrack: () => undefined,
      onAddTrack: () => undefined,
      onClose: () => undefined,
    }));
    expect(html).toContain('MIX CHECK');
    expect(html).toContain('Open track');
    expect(html).toContain('Add bass');
    expect(html).toContain('Check the mix again');
  });
});
