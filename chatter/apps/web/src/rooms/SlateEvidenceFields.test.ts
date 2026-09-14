import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SlateEvidenceFields } from './SlateEvidenceFields.js';

const source = {
  id: 'source-1', name: 'Club post', role: 'Announcement', reference: '', notes: '', quotes: '',
  state: 'CONTACTED' as const, evidenceType: 'WEB_LEAD' as const,
};

describe('Slate evidence fields', () => {
  it('offers optional source kinds without adding an independent-confirmation form', () => {
    const html = renderToStaticMarkup(createElement(SlateEvidenceFields, { source, onChange: () => undefined }));

    expect(html).toContain('What kind of source is this?');
    expect(html).toContain('Firsthand observation');
    expect(html).toContain('Web lead');
    expect(html).not.toContain('Independent confirmation');
    expect(html).not.toContain('must be checked');
  });

  it('keeps a person source compact without the independent-check field', () => {
    const html = renderToStaticMarkup(createElement(SlateEvidenceFields, {
      source: { ...source, evidenceType: 'PERSON' }, onChange: () => undefined,
    }));

    expect(html).toContain('Someone who knows, made, or experienced this firsthand.');
    expect(html).not.toContain('Independent confirmation');
  });
});
