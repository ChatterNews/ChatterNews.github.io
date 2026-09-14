import { describe, expect, it } from 'vitest';
import { contrastRatio, looksLikeStarterCopy, minimumReadableDurationMs } from './creative.js';

describe('creative quality primitives', () => {
  it('calculates WCAG contrast for black and white', () => {
    expect(contrastRatio('#000', '#ffffff')).toBe(21);
  });

  it('recognizes untouched starter copy without flagging real headlines', () => {
    expect(looksLikeStarterCopy('The story starts here')).toBe(true);
    expect(looksLikeStarterCopy('Sixth graders turn creek water into usable data')).toBe(false);
  });

  it('gives longer copy more readable screen time', () => {
    expect(minimumReadableDurationMs('Coming up')).toBe(1800);
    expect(minimumReadableDurationMs('Students measured the creek after three days of summer rain')).toBeGreaterThan(3000);
  });
});
