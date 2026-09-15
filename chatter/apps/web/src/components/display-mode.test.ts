/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fullscreenAvailable, isFullscreen, LOW_SPEC_KEY, readLowSpec, saveLowSpec, toggleFullscreen } from './display-mode.js';
beforeEach(() => {
  const data = new Map<string,string>();
  vi.stubGlobal('localStorage', {getItem: vi.fn((key: string) => data.get(key) ?? null),setItem: vi.fn((key: string,value: string) => {data.set(key,value);})});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('remembers low-spec mode without changing project storage', () => {
  window.localStorage.setItem('student-work', 'keep');
  saveLowSpec(true); expect(readLowSpec()).toBe(true);
  saveLowSpec(false); expect(readLowSpec()).toBe(false);
  expect(window.localStorage.getItem('student-work')).toBe('keep');
  expect(window.localStorage.getItem(LOW_SPEC_KEY)).toBe('false');
});
it('survives blocked browser preference storage', () => {
  vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  expect(readLowSpec()).toBe(false); expect(() => saveLowSpec(true)).not.toThrow();
});
it('enters and exits native fullscreen with the correct receiver', async () => {
  const enter=vi.fn(),exit=vi.fn();
  const doc={documentElement:{requestFullscreen:enter},fullscreenEnabled:true,exitFullscreen:exit} as unknown as Document;
  expect(fullscreenAvailable(doc)).toBe(true); await toggleFullscreen(doc);
  expect(enter.mock.instances[0]).toBe(doc.documentElement);
  Object.defineProperty(doc,'fullscreenElement',{value:doc.documentElement});
  expect(isFullscreen(doc)).toBe(true); await toggleFullscreen(doc); expect(exit.mock.instances[0]).toBe(doc);
});
it('uses the prefixed Safari API and propagates browser refusal', async () => {
  const enter=vi.fn(),exit=vi.fn();
  const doc={documentElement:{webkitRequestFullscreen:enter},webkitExitFullscreen:exit} as unknown as Document;
  expect(fullscreenAvailable(doc)).toBe(true); await toggleFullscreen(doc); expect(enter).toHaveBeenCalledOnce();
  Object.defineProperty(doc,'webkitFullscreenElement',{value:doc.documentElement});
  await toggleFullscreen(doc); expect(exit).toHaveBeenCalledOnce();
  exit.mockRejectedValue(new Error('denied'));await expect(toggleFullscreen(doc)).rejects.toThrow('denied');
});
it('does not advertise fullscreen when policy disables it or the API is absent', async () => {
  const doc={documentElement:{requestFullscreen:vi.fn()},fullscreenEnabled:false} as unknown as Document;
  expect(fullscreenAvailable(doc)).toBe(false); await expect(toggleFullscreen(doc)).rejects.toThrow('unavailable');
  expect(fullscreenAvailable({documentElement:{}} as Document)).toBe(false);
});
