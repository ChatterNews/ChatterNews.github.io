import { describe, expect, it } from 'vitest';
import { sourceQuoteContent } from './desk-proof.js';

const source = {
  id: 'source-1', name: 'Ms. Rivera', role: 'Librarian', reference: 'Interview 01:14', notes: '',
  quotes: 'The new shelves arrive Friday.', state: 'CONFIRMED' as const, evidenceType: 'PERSON' as const,
};

describe('Desk source helpers', () => {
  it('keeps an inserted quote linked to its reporting source', () => {
    const content = sourceQuoteContent(source);
    expect(content[0]).toMatchObject({
      type: 'blockquote',
      attrs: { proofSourceId: source.id },
    });
    expect(content[1]).toMatchObject({ type: 'paragraph', content: [{ type: 'text', text: '— Ms. Rivera' }] });
  });
});
