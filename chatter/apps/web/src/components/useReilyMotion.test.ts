// @vitest-environment jsdom
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReilyMotion } from './useReilyMotion.js';

let root: Root; let host: HTMLDivElement;
let media: EventTarget & { matches: boolean };
function Fixture({ parked = false, lowSpec = false }) {
  const ref = useRef<HTMLButtonElement>(null);
  const motion = useReilyMotion(ref, parked, lowSpec);
  return createElement('aside', { className: 'reilly-guide' }, !parked && createElement('button', { ref, 'data-motion': motion }, 'Reily'));
}
const state = () => host.querySelector('button')?.dataset.motion;
async function mount(props = {}) { await act(async () => root.render(createElement(Fixture, props))); }
async function advance(ms: number) { await act(async () => vi.advanceTimersByTime(ms)); }
async function move(x: number, type = 'mouse') {
  await act(async () => { const e = new MouseEvent('pointermove', { clientX: x, clientY: 150 }); Object.defineProperty(e, 'pointerType', { value: type }); window.dispatchEvent(e); });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', () => media); vi.spyOn(Math, 'random').mockReturnValue(.5);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 200, top: 100, bottom: 200 } as DOMRect);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('rests for long pauses and returns to rest after a single blink', async () => {
  await mount(); await advance(16999); expect(state()).toBe('rest');
  await advance(1); expect(state()).toBe('blink'); await advance(280); expect(state()).toBe('rest');
  await advance(29999); expect(state()).toBe('rest'); await advance(1); expect(state()).toBe('blink');
});
it('acknowledges proximity once and does not repeat while the pointer lingers', async () => {
  await mount(); await move(50); expect(state()).toBe('perk'); await advance(900); expect(state()).toBe('rest');
  await move(55); await advance(40000); expect(state()).toBe('rest');
  await move(400); await move(50); expect(state()).toBe('perk');
});
it('does not retrigger rapidly or treat touch as hover, but supports keyboard focus', async () => {
  await mount(); await move(150, 'touch'); expect(state()).toBe('rest');
  await act(async () => host.querySelector('button')!.focus()); expect(state()).toBe('perk');
  await advance(900); await move(400); await move(50); expect(state()).toBe('rest');
});
it('stops immediately for reduced motion and cancels timers when parked or low-spec', async () => {
  await mount(); await move(150); expect(state()).toBe('perk');
  await act(async () => { media.matches = true; media.dispatchEvent(new Event('change')); });
  expect(state()).toBe('rest'); expect(vi.getTimerCount()).toBe(0);
  await mount({ lowSpec: true }); await move(150); expect(state()).toBe('rest');
  await mount({ parked: true }); expect(vi.getTimerCount()).toBe(0);
});
it('pauses while hidden and resumes with a fresh quiet interval', async () => {
  await mount(); await move(150);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(state()).toBe('rest'); expect(vi.getTimerCount()).toBe(0);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  await advance(16999); expect(state()).toBe('rest'); await advance(1); expect(state()).toBe('blink');
});
