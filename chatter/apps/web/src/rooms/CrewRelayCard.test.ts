import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Story } from '@chatter/shared';
import { CrewRelayCard } from './CrewRelayCard.js';

const story: Story = {
  id: 'book-fair', createdAt: 1, updatedAt: 1, slug: 'book-fair', title: 'Book fair',
  channels: ['web'], status: 'WORK', body: { type: 'doc', content: [] }, readTimeSec: 0, bylineIds: [],
  brief: {
    angle: 'The fair added student-run recommendation tables.',
    angleCheck: { affected: 'Students choosing their next book', verification: 'Count the tables and ask the librarian' },
    audience: 'Our school community', priority: 'NORMAL', questions: [], sources: [], checklist: [], productionNotes: '',
  },
};

describe('Crew relay card', () => {
  it('shows a role-and-story example next to the three handoff fields', () => {
    const html = renderToStaticMarkup(createElement(CrewRelayCard, {
      role: 'picture', story, value: { finished: '', location: '', next: '' }, onChange: () => undefined,
    }));

    expect(html).toContain('A strong visual designer handoff');
    expect(html).toContain('Made a headline graphic and square social card for “Book fair.”');
    expect(html).toContain('What I finished');
    expect(html).toContain('Where to find it');
    expect(html).toContain('What to check next');
    expect(html).toContain('aria-label="0 of 3 handoff parts ready"');
  });

  it('marks a complete handoff without grading creative taste', () => {
    const html = renderToStaticMarkup(createElement(CrewRelayCard, {
      role: 'report', story,
      value: { finished: 'Logged two interviews.', location: 'Slate reporting file.', next: 'Confirm the table count.' },
      onChange: () => undefined,
    }));

    expect(html).toContain('aria-label="3 of 3 handoff parts ready"');
    expect(html).toContain('Ready to relay');
    expect(html).not.toMatch(/bad|weak|grade/i);
  });
});
