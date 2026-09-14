/** @vitest-environment jsdom */
import { describe, expect, test } from 'vitest';
import { sanitizedRichText } from './blast-rich-text.js';

const DANGEROUS = /on[a-z]+\s*=|javascript:|<script|<iframe|<svg|<object|<embed|<img/i;

describe('Blast rich text boundary', () => {
  test('keeps supported formatting and prose from ordinary pasted wrappers', () => {
    expect(sanitizedRichText('<p><b>Lunch</b> line <i>doubled</i><br><u>this week</u></p>'))
      .toBe('<b>Lunch</b> line <i>doubled</i><br><u>this week</u>');
  });

  test.each([
    '<p><img src=x onerror="alert(1)"></p>',
    '<article><img src=x onerror="alert(1)"></article>',
    '<figure><svg onload="alert(1)"></svg></figure>',
    '<section><a href="javascript:alert(1)">click</a></section>',
    '<h1><iframe src="javascript:alert(1)"></iframe></h1>',
    '<main><aside><img src=x onerror="alert(1)"></aside></main>',
    '<table><td><img src=x onerror="alert(1)"></td></table>',
    '<div><object data="javascript:alert(1)"></object></div>',
    '<span onclick="alert(1)">hi</span>',
  ])('drops active content from %s', (payload) => {
    expect(sanitizedRichText(payload)).not.toMatch(DANGEROUS);
  });

  test('keeps only the two color styles the editor supports', () => {
    const html = sanitizedRichText('<span style="color:red;background-color:white;position:fixed;inset:0">x</span>');
    expect(html).toContain('color: red');
    expect(html).toContain('background-color: white');
    expect(html).not.toMatch(/position|inset/);
  });

  test('drops script and style contents', () => {
    expect(sanitizedRichText('<div><script>alert(1)</script><style>*{display:none}</style>ok</div>')).toBe('<div>ok</div>');
  });

  test('bounds pathological nesting and is idempotent', () => {
    const deep = '<span>'.repeat(800) + 'words' + '</span>'.repeat(800);
    const once = sanitizedRichText(deep);
    expect(once).toContain('words');
    expect(sanitizedRichText(once)).toBe(once);
  });
});
