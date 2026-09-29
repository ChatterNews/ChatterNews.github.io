// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reily } from './Pip.js';
import { ReilyContextProvider } from './ReilyContextProvider.js';
import type { ReilyContext } from './reily-advice.js';

const context: ReilyContext = {
  room: 'blast',
  role: 'STUDENT',
  previousRoom: 'desk',
};

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function markup(nextContext: ReilyContext = context, open = true, userId = 'student-7') {
  await act(async () => root.render(createElement(
    MemoryRouter,
    {},
    createElement(
      ReilyContextProvider,
      {},
      createElement(Reily, {
        context: nextContext,
        userId,
        lowSpec: true,
        recommendedRoom: 'greenlight',
        onNavigate: () => undefined,
        onRevealRoom: () => undefined,
      }),
    ),
  )));
  if (open) await act(async () => { host.querySelector<HTMLButtonElement>('.reilly-character')!.click(); await import('./ReilyHelpPanel.js'); });
  return host.innerHTML;
}

describe('Reily coach panel', () => {
  it('starts closed, toggles on click, and remembers the introduction per badge', async () => {
    await markup(context, false);
    expect(host.querySelector('.reilly-coach-panel')).toBeNull();
    expect(host.textContent).toContain('Click me');
    const click = () => act(() => host.querySelector<HTMLButtonElement>('.reilly-character')!.click());
    click();
    expect(host.querySelector('.reilly-coach-panel')).not.toBeNull();
    expect(host.textContent).not.toContain('Click me');
    click();
    expect(host.querySelector('.reilly-coach-panel')).toBeNull();
    act(() => root.unmount()); root = createRoot(host);
    await markup(context, false);
    expect(host.textContent).not.toContain('Click me');
    expect(host.querySelector('.reilly-coach-panel')).toBeNull();
    await markup(context, false, 'student-8');
    expect(host.textContent).toContain('Click me');
  });

  it('offers local help and room-finding modes', async () => {
    const html = await markup();

    expect(html).toContain('role="tablist"');
    expect(html).toContain('>Help here<');
    expect(html).toContain('>Find a room<');
    expect(html).toContain('What are you trying to do?');
    expect(html).toContain('Help me improve my work');
  });

  it('names the next and previous destinations', async () => {
    const html = await markup();

    expect(html).toContain('Next stop · Green Light');
    expect(html).toContain('Back to Desk');
    expect(html).toContain('What happens here?');
    expect(html).toContain('I want to…');
  });

  it('uses one right-pointing arrow without a floating Park label', async () => {
    const html = await markup();

    expect(html).toContain('aria-label="Park Reily"');
    expect(html).toContain('class="reilly-park-arrow"');
    expect(html).not.toContain('>Park</b>');
  });

  it('announces available recovery without opening a new toast', async () => {
    const html = await markup({ ...context, recovery: { kind: 'blast.import', workChanged: false } });

    expect(html).toContain('aria-label="Ask Reily about a problem in Blast"');
    expect(html).toContain('class="reilly-recovery-dot"');
  });
});
