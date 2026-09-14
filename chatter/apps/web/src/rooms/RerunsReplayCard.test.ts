import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RerunsReplayCard } from './RerunsReplayCard.js';

describe('Reruns Replay Notes', () => {
  it('shows three concrete reflection prompts and the next-story handoff', () => {
    const html = renderToStaticMarkup(createElement(RerunsReplayCard, {
      editionTitle: 'Solar race',
      value: { worked: '', audience: '', change: '' },
      onChange: () => undefined,
      onSave: () => undefined,
      onNext: () => undefined,
      nextLabel: 'Start the next story',
    }));

    expect(html).toContain('Replay notes');
    expect(html).toContain('What held up?');
    expect(html).toContain('What did people notice?');
    expect(html).toContain('What would we change?');
    expect(html).toContain('aria-label="0 of 3 replay notes ready"');
    expect(html).toContain('Start the next story');
  });

  it('marks a complete reflection without scoring the published work', () => {
    const html = renderToStaticMarkup(createElement(RerunsReplayCard, {
      editionTitle: 'Solar race',
      value: { worked: 'Clear opening.', audience: 'Asked about charging.', change: 'Show the workshop.' },
      onChange: () => undefined,
      onSave: () => undefined,
      onNext: () => undefined,
      nextLabel: 'Start the next story',
    }));

    expect(html).toContain('aria-label="3 of 3 replay notes ready"');
    expect(html).toContain('3/3');
    expect(html).toContain('logged');
    expect(html).not.toMatch(/grade|score|bad|weak/i);
  });
});
