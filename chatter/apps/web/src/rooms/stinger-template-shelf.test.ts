import { describe, expect, it } from 'vitest';
import { isStingerTemplateShelfVisible } from './stinger-template-shelf.js';

describe('Stinger template shelf visibility', () => {
  it('opens over a restored kit when the student asks for templates', () => {
    expect(isStingerTemplateShelfVisible({ hasOpenProject: true, shelfRequested: true })).toBe(true);
  });

  it('stays out of the editor until requested', () => {
    expect(isStingerTemplateShelfVisible({ hasOpenProject: true, shelfRequested: false })).toBe(false);
  });

  it('is the default view when there is no open kit', () => {
    expect(isStingerTemplateShelfVisible({ hasOpenProject: false, shelfRequested: false })).toBe(true);
  });
});
