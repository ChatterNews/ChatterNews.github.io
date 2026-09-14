import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StingerGraphicPalette } from './StingerGraphicPalette.js';

describe('Stinger graphic palette', () => {
  it('starts with newsroom jobs, thumbnails, search, and a secondary basic section', () => {
    const html = renderToStaticMarkup(createElement(StingerGraphicPalette, {
      sceneKind: 'HEADLINE',
      category: 'HEADLINES',
      query: '',
      recentIds: [],
      showAll: false,
      hasImages: true,
      theme: {
        showName: 'Chatter News', primary: '#201535', secondary: '#58C8C0',
        accent: '#F3D33F', paper: '#FFF7DE', ink: '#211829',
        fontDisplay: 'Bricolage Grotesque', fontBody: 'Atkinson Hyperlegible Next',
      },
      onCategory: () => undefined,
      onQuery: () => undefined,
      onToggleAll: () => undefined,
      onAdd: () => undefined,
    }));

    expect(html).toContain('Add graphic');
    expect(html).toContain('Search graphics');
    expect(html).toContain('Headline slab');
    expect(html).toContain('Split headline');
    expect(html).toContain('Basic pieces');
    expect(html).toContain('graphic-preview');
    expect(html).not.toContain('Type something great');
  });
});
