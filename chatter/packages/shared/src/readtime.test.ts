import { describe, expect, test } from 'vitest';
import { countWords, readTimeSec } from './readtime.js';

describe('readTimeSec', () => {
  test('matches words / 150 * 60 (SPEC S3)', () => {
    expect(readTimeSec(150)).toBe(60);
    expect(readTimeSec(300)).toBe(120);
    expect(readTimeSec(75)).toBe(30);
  });

  test('rounds to whole seconds', () => {
    expect(readTimeSec(10)).toBe(4);
  });

  test('is zero for an empty script', () => {
    expect(readTimeSec(0)).toBe(0);
  });
});

describe('countWords', () => {
  test('counts words in a TipTap document, not characters', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'The taco bar is back' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'and nobody knows why' }] },
      ],
    };
    expect(countWords(doc)).toBe(9);
  });

  test('ignores whitespace-only nodes', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }] };
    expect(countWords(doc)).toBe(0);
  });

  test('counts an empty document as zero', () => {
    expect(countWords({ type: 'doc', content: [] })).toBe(0);
  });
});
