// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReilyHelpPanel from './ReilyHelpPanel.js';
import { ReilyHelpBoundary } from './ReilyHelpBoundary.js';
import type { ReilyHelpContext } from './reily-help-types.js';
let host: HTMLDivElement, root: Root;
const context: ReilyHelpContext = { room: 'blast', role: 'STUDENT', focus: 'blast.text', situation: { room: 'blast', selectedKind: 'TEXT', selectionCount: 1 } };
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
function render(c = context) { act(() => root.render(createElement(ReilyHelpPanel, { context: c, onNavigate: () => undefined }))); }
function search(value: string) { const input = host.querySelector('input')!; act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); }
it('gives ordered instructions for the current selection, without requiring a search', () => { render(); expect(host.querySelector('h3')?.textContent).toBe('Change the words on my page'); expect(host.querySelectorAll('.reily-instructions li').length).toBe(3); });
it('keeps the chosen guide and search while underlying room facts update', () => {
  render(); search('photo cropped');
  act(() => (host.querySelector('.reily-topic-list button') as HTMLButtonElement).click());
  const title = host.querySelector('h3')!.textContent;
  render({ ...context, situation: { ...context.situation!, selectedKind: 'IMAGE', selectionCount: 1 } });
  expect(host.querySelector('input')!.value).toBe('photo cropped'); expect(host.querySelector('h3')!.textContent).toBe(title);
});
it('does not present unrelated instructions for an unknown question', () => { render(); search('flibbertigibbet'); expect(host.querySelector('.reily-instructions')).toBeNull(); expect(host.textContent).toContain('I do not have an exact match'); });
it('does not navigate away from a busy recording', () => {
  const navigate = vi.fn();
  act(() => root.render(createElement(ReilyHelpPanel, { context: { room: 'home', role: 'STUDENT', situation: { room: 'home', busy: true } }, onNavigate: navigate })));
  search('where should I start');
  act(() => (host.querySelector('.reily-topic-list button') as HTMLButtonElement).click());
  expect((host.querySelector('[data-reily-navigation]') as HTMLButtonElement).disabled).toBe(true);
  act(() => (host.querySelector('[data-reily-navigation]') as HTMLButtonElement).click()); expect(navigate).not.toHaveBeenCalled();
});
it('contains a help failure while leaving the editor mounted', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  function FailedHelp(): never { throw new Error('help offline'); }
  act(() => root.render(createElement('div', {}, createElement('textarea', { defaultValue: 'My unfinished story' }), createElement(ReilyHelpBoundary, {}, createElement(FailedHelp)))));
  expect(host.querySelector('textarea')?.value).toBe('My unfinished story'); expect(host.textContent).toContain('Reily’s help could not open');
});
