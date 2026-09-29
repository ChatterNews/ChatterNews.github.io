// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isLocalReilyHelp } from './reily-local-help.js';

describe('reading help during a protected media operation', () => {
  it('allows help controls while keeping actual room navigation behind the save guard', () => {
    const root = document.createElement('div');
    root.innerHTML = `<aside data-reily-local-help>
      <button id="open"><span>Ask Reily</span></button>
      <button id="search">Show microphone help</button>
      <button id="leave" data-reily-navigation><span>Open Booth</span></button>
    </aside><button id="outside">Open another room</button>`;
    expect(isLocalReilyHelp(root.querySelector('#open span')!)).toBe(true);
    expect(isLocalReilyHelp(root.querySelector('#search')!)).toBe(true);
    expect(isLocalReilyHelp(root.querySelector('#leave')!)).toBe(false);
    expect(isLocalReilyHelp(root.querySelector('#leave span')!)).toBe(false);
    expect(isLocalReilyHelp(root.querySelector('#outside')!)).toBe(false);
  });
  it('allows returning a parked Reily without changing rooms', () => {
    const button = document.createElement('button');
    button.setAttribute('data-reily-local-help', '');
    expect(isLocalReilyHelp(button)).toBe(true);
  });
});
