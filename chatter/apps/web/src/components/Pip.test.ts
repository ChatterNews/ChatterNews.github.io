import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Reily } from './Pip.js';
import { ReilyContextProvider } from './ReilyContextProvider.js';
import type { ReilyContext } from './reily-advice.js';

const context: ReilyContext = {
  room: 'blast',
  role: 'STUDENT',
  previousRoom: 'desk',
};

function markup(nextContext: ReilyContext = context) {
  return renderToStaticMarkup(createElement(
    MemoryRouter,
    {},
    createElement(
      ReilyContextProvider,
      {},
      createElement(Reily, {
        context: nextContext,
        userId: 'student-7',
        recommendedRoom: 'greenlight',
        onNavigate: () => undefined,
        onRevealRoom: () => undefined,
      }),
    ),
  ));
}

describe('Reily coach panel', () => {
  it('offers local help and room-finding modes', () => {
    const html = markup();

    expect(html).toContain('role="tablist"');
    expect(html).toContain('>Help here<');
    expect(html).toContain('>Find a room<');
    expect(html).toContain('Another tip');
  });

  it('names the next and previous destinations', () => {
    const html = markup();

    expect(html).toContain('Next stop · Green Light');
    expect(html).toContain('Back to Desk');
    expect(html).toContain('What happens here?');
    expect(html).toContain('I want to…');
  });

  it('uses one right-pointing arrow without a floating Park label', () => {
    const html = markup();

    expect(html).toContain('aria-label="Park Reily"');
    expect(html).toContain('class="reilly-park-arrow"');
    expect(html).not.toContain('>Park</b>');
  });

  it('announces available recovery without opening a new toast', () => {
    const html = markup({ ...context, recovery: { kind: 'blast.import', workChanged: false } });

    expect(html).toContain('aria-label="Ask Reily about a problem in Blast"');
    expect(html).toContain('class="reilly-recovery-dot"');
  });
});
