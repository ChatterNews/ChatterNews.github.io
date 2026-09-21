// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { LoadingStatus } from './LoadingStatus.js';

let root: Root;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render(progress?: number, label = 'Saving story…') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  if (!document.querySelector('#test-root')) { const host = document.createElement('div'); host.id = 'test-root'; document.body.append(host); root = createRoot(host); }
  await act(async () => root.render(createElement(LoadingStatus, { label, progress })));
}
test('unknown work stays indeterminate; measured work exposes its actual fraction', async () => {
  await render();
  expect(document.querySelector('progress')?.hasAttribute('value')).toBe(false);
  expect(document.body.textContent).not.toContain('%');
  await render(.37);
  expect(document.querySelector('progress')?.value).toBe(.37);
  expect(document.body.textContent).toContain('37%');
  await render(Number.NaN);
  expect(document.querySelector('progress')?.hasAttribute('value')).toBe(false);
});
test('long waits explain the delay, reset for the next stage, and clean up on completion', async () => {
  vi.useFakeTimers();
  await render();
  await act(async () => vi.advanceTimersByTime(15000));
  expect(document.body.textContent).toContain('taking a little longer');
  await render(undefined, 'Checking saved files…');
  expect(document.body.textContent).not.toContain('taking a little longer');
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
  expect(document.querySelector('progress')).toBeNull();
});
