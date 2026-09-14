import { describe, expect, test } from 'vitest';
import { imagePagesPdf } from './image-pdf.js';

describe('image page PDF', () => {
  test('builds a multi-page PDF with valid object offsets', () => {
    const bytes = imagePagesPdf([
      { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), pixelWidth: 20, pixelHeight: 30, pageWidth: 200, pageHeight: 300 },
      { jpeg: new Uint8Array([0xff, 0xd8, 1, 2, 0xff, 0xd9]), pixelWidth: 40, pixelHeight: 50, pageWidth: 400, pageHeight: 500 },
    ]);
    const source = new TextDecoder('latin1').decode(bytes);
    expect(source.startsWith('%PDF-1.4')).toBe(true);
    expect(source).toContain('/Count 2');
    expect(source.match(/\/Type \/Page\b/g)).toHaveLength(2);
    const startXref = Number(source.match(/startxref\n(\d+)/)?.[1]);
    expect(source.slice(startXref, startXref + 4)).toBe('xref');
  });
});
