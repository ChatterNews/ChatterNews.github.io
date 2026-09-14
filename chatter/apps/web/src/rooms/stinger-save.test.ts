import { describe, expect, it } from 'vitest';
import { isCurrentStingerSave } from './stinger-save.js';

describe('Stinger save generation guard', () => {
  it('accepts only the current package at the current edit revision', () => {
    expect(isCurrentStingerSave('kit-a', 4, 'kit-a', 4)).toBe(true);
    expect(isCurrentStingerSave('kit-a', 5, 'kit-a', 4)).toBe(false);
    expect(isCurrentStingerSave('kit-b', 4, 'kit-a', 4)).toBe(false);
  });
});
