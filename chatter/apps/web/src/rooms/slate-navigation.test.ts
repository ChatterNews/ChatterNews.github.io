import { describe, expect, it } from 'vitest';
import { slateDossierPath } from './slate-navigation.js';

describe('Slate story navigation', () => {
  it('keeps an opened story in the URL and returns to the board when closed', () => {
    expect(slateDossierPath('story-42')).toBe('/slate/story-42');
    expect(slateDossierPath()).toBe('/slate');
  });
});
