import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { DEFAULT_SAMPLER_SETTINGS } from '@chatter/shared';
import { StudioSamplerWorkbench } from './StudioSamplerWorkbench.js';

describe('Studio sampler workbench', () => {
  test('puts musical shaping and slicing around the real waveform', () => {
    const html = renderToStaticMarkup(createElement(StudioSamplerWorkbench, {
      sampleName: 'school-bell.wav', durationSec: 1.8, waveform: [.1, .7, .4, .9],
      settings: DEFAULT_SAMPLER_SETTINGS,
      onChange: () => undefined,
      onAutoSlice: () => undefined,
      onDetectSlices: () => undefined,
    }));
    expect(html).toContain('Play it');
    expect(html).toContain('Slice it');
    expect(html).toContain('Start');
    expect(html).toContain('End');
    expect(html).toContain('Root note');
    expect(html).toContain('Tune');
    expect(html).toContain('Attack');
    expect(html).toContain('Release');
    expect(html).toContain('Filter');
    expect(html).toContain('One-shot');
  });
});
