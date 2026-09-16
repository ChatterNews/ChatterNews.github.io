/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AFTER_HOURS_KEY, applyAfterHours, readAfterHours, saveAfterHours, fullscreenAvailable, isFullscreen, LOW_SPEC_KEY, readLowSpec, saveLowSpec, toggleFullscreen } from './display-mode.js';
beforeEach(() => {
  const data = new Map<string,string>();
  vi.stubGlobal('localStorage', {getItem: vi.fn((key: string) => data.get(key) ?? null),setItem: vi.fn((key: string,value: string) => {data.set(key,value);})});
});
afterEach(() => { delete document.body.dataset.afterHours; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('starts in Space Lab and remembers After Hours separately from student work and low-spec mode', () => {
  expect(readAfterHours()).toBe(false);
  window.localStorage.setItem('student-work', 'keep');
  saveLowSpec(true);
  saveAfterHours(true); applyAfterHours(readAfterHours());
  expect(document.body.dataset.afterHours).toBe('true');
  expect(readLowSpec()).toBe(true);
  expect(window.localStorage.getItem('student-work')).toBe('keep');
  saveAfterHours(false); applyAfterHours(readAfterHours());
  expect(document.body.dataset.afterHours).toBe('false');
  window.localStorage.setItem(AFTER_HOURS_KEY, 'unknown');
  expect(readAfterHours()).toBe(false);
});
it('can change the appearance when browser preference storage is blocked', () => {
  vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  expect(readAfterHours()).toBe(false);
  expect(() => saveAfterHours(true)).not.toThrow();
  applyAfterHours(true);
  expect(document.body.dataset.afterHours).toBe('true');
});
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
