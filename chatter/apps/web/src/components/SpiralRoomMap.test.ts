/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { SpiralRoomMap } from './SpiralRoomMap.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Spiral room map reveal', () => {
  it('opens and highlights the destination Reily chose until the student confirms', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let selected = -1;

    act(() => root.render(createElement(SpiralRoomMap, {
      currentRoom: 'desk',
      recommendedRoom: 'greenlight',
      revealRequest: { id: 2, room: 'blast' },
      onSelect: (index: number) => { selected = index; },
    })));

    const details = container.querySelector('details')!;
    const blast = container.querySelector<HTMLButtonElement>('[data-map-station="blast"]')!;
    expect(details.open).toBe(true);
    expect(blast.dataset.reilyTarget).toBe('true');
    expect(blast.getAttribute('aria-label')).toContain('Chosen with Reily');

    act(() => blast.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(selected).toBeGreaterThan(0);
    expect(details.open).toBe(false);

    act(() => root.unmount());
    container.remove();
  });
});
