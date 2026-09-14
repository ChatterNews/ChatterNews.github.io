import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const css = readFileSync(new URL('./Showtime.css', import.meta.url), 'utf8');

describe('Showtime studio header', () => {
  test('keeps its eyebrow and title on separate lines without the global double shadow', () => {
    const headingRule = css.match(/\.showtime-head h1\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(headingRule).toContain('display: block');
    expect(headingRule).toContain('text-shadow: none');
    expect(headingRule).toContain('transform: none');
  });
});
