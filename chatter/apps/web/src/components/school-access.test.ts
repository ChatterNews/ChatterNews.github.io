// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryStore, type Store } from '@chatter/shared';
import { SchoolAccess } from './SchoolAccess.js';
import { registerSessionCheckpoint } from '../store/session-checkpoint.js';
let store: Store;
vi.mock('../store/StoreProvider.js', () => ({ useStore: () => store }));
vi.mock('./ProjectDrive.js', () => ({ ProjectDrive: ({ saveOnly }: { saveOnly: boolean }) => createElement('button', {}, saveOnly ? 'Finish session only' : 'Full files') }));
let root: Root, container: HTMLDivElement;
let mounted = 0, removed = 0;
function Draft() {
  useEffect(() => { mounted++; return () => { removed++; }; }, []);
  return createElement('textarea', { defaultValue: 'Keep this draft', 'aria-label': 'Draft' });
}
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-18T21:59:00Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  store = new MemoryStore(); await store.open(); mounted = 0; removed = 0;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function open(adviser = false) {
  await act(async () => root.render(createElement(SchoolAccess, { userId: 'maya', adviser, stories: [], onCheckOut() {}, children: createElement(Draft) })));
}
async function tick(date: string) {
  vi.setSystemTime(new Date(date));
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
}
test('outside hours never mounts an editor, including direct room routes', async () => {
  vi.setSystemTime(new Date('2026-09-19T16:00:00Z')); await open();
  expect(mounted).toBe(0); expect(container.textContent).toContain('See you next session');
  expect(container.textContent).toContain('Finish session only');
});
test('adviser access is available at night and on weekends', async () => {
  vi.setSystemTime(new Date('2026-09-20T02:00:00Z')); await open(true);
  expect(mounted).toBe(1); expect(container.querySelector('.school-access')).toBeNull();
});
test('closing flushes drafts, preserves the mounted editor and blocks shortcuts', async () => {
  const save = vi.fn(async () => {}); registerSessionCheckpoint(store, save);
  await open(); const editor = container.querySelector('textarea');
  await tick('2026-09-18T22:00:00Z');
  expect(save).toHaveBeenCalledOnce(); expect(removed).toBe(0);
  expect(container.querySelector('textarea')).toBe(editor);
  expect(editor?.parentElement?.hidden).toBe(true);
  const shortcut = vi.fn(); window.addEventListener('keydown', shortcut);
  container.querySelector('main')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  window.removeEventListener('keydown', shortcut); expect(shortcut).not.toHaveBeenCalled();
  await tick('2026-09-21T19:00:00Z');
  expect(editor?.parentElement?.hidden).toBe(false); expect(mounted).toBe(1);
});
test('a recording or failed save keeps its controls available, then locks after successful save', async () => {
  let busy = true;
  registerSessionCheckpoint(store, async () => { if (busy) throw new Error('Stop and save the take.'); });
  await open(); await tick('2026-09-18T22:00:00Z');
  expect(container.textContent).toContain('Stop and save the take'); expect(removed).toBe(0);
  expect(container.querySelector('textarea')?.parentElement?.hidden).toBe(false);
  busy = false; await tick('2026-09-18T22:01:00Z');
  expect(container.textContent).toContain('See you next session'); expect(removed).toBe(0);
});
test('grants open only the selected local badge and revocation locks it again', async () => {
  vi.setSystemTime(new Date('2026-09-19T16:00:00Z')); await open();
  await store.settings.save({ studentAccessExceptions: [{ userId: 'other', from: '2026-09-19', through: '2026-09-20' }] });
  await tick('2026-09-19T16:01:00Z'); expect(mounted).toBe(0);
  await store.settings.save({ studentAccessExceptions: [{ userId: 'maya', from: '2026-09-19', through: '2026-09-20' }] });
  await tick('2026-09-19T16:02:00Z'); expect(mounted).toBe(1);
  await store.settings.save({ studentAccessExceptions: [] });
  await tick('2026-09-19T16:03:00Z'); expect(container.querySelector('.school-access')).not.toBeNull();
});
