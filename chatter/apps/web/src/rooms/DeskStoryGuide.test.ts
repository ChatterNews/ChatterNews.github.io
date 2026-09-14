import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeskRoutePicker, DeskStoryCheck } from './DeskStoryGuide.js';

describe('Desk story guide', () => {
  it('shows five concrete routes and identifies the recommendation from Slate', () => {
    const html = renderToStaticMarkup(createElement(DeskRoutePicker, {
      selected: undefined,
      recommended: 'EVENT',
      onChoose: () => undefined,
      disabled: false,
    }));

    expect(html).toContain('STORY ROUTES');
    expect(html).toContain('Quick update');
    expect(html).toContain('Profile');
    expect(html).toContain('Event recap');
    expect(html).toContain('Explainer');
    expect(html).toContain('Investigation');
    expect(html).toContain('Slate pick');
  });

  it('shows the six editorial checks without grading the student', () => {
    const checks = [
      { id: 'HEADLINE' as const, label: 'Headline', hint: 'Name the subject and the news.', complete: true },
      { id: 'LEAD' as const, label: 'Lead', hint: 'Open with the news.', complete: true },
      { id: 'EVIDENCE' as const, label: 'Evidence', hint: 'Add checked detail.', complete: false },
      { id: 'QUOTE' as const, label: 'Quote', hint: 'Use an exact voice.', complete: false },
      { id: 'CONTEXT' as const, label: 'Context', hint: 'Give the background.', complete: false },
      { id: 'CLOSE' as const, label: 'Close', hint: 'Show what comes next.', complete: false },
    ];
    const html = renderToStaticMarkup(createElement(DeskStoryCheck, { checks, hasRoute: true }));

    expect(html).toContain('STORY CHECK');
    expect(html).toContain('2/6');
    expect(html).toContain('in place');
    expect(html).toContain('Evidence');
    expect(html).not.toMatch(/grade|score|bad|weak/i);
  });
});
