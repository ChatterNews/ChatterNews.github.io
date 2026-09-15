/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryStore } from '@chatter/shared';
import { NewsroomCheckIn } from './NewsroomCheckIn.js';

let store: MemoryStore;
vi.mock('../store/StoreProvider.js', () => ({ useStore: () => store }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let captured: Blob[];
const download = vi.fn();

beforeEach(() => {
  store = new MemoryStore('backup-test');
  captured = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => { captured.push(blob); return 'blob:backup-test'; }) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(download);
  download.mockClear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

function button(text: string) {
  return [...container.querySelectorAll('button')].find((item) => item.textContent === text)!;
}
async function openControls() {
  await act(async () => root.render(createElement(MemoryRouter, {}, createElement(NewsroomCheckIn, {
    students: [], advisers: [], onStudentPicked: async () => true, onIdentityChanged() {},
    onAdviserUnlock: async () => true, onEnterDemo() {},
  }))));
  await act(async () => button('Desk controls').click());
}
async function enterPin(pin: string) {
  const input = container.querySelector<HTMLInputElement>('[aria-label="Adviser PIN"]')!;
  expect(input.type).toBe('password');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, pin);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('requires setup and cannot download from a desk without a PIN', async () => {
  await openControls();
  expect(container.querySelector('[role="dialog"]')!.textContent).toContain('Set up adviser access and a PIN');
  expect(button('Save backup').disabled).toBe(true);
  await act(async () => button('Save backup').click());
  expect(captured).toHaveLength(0);
  expect(download).not.toHaveBeenCalled();
});

test('missing and wrong PINs never generate a file; the correct PIN downloads readable records without the PIN', async () => {
  await store.settings.save({ adviserPin: '2468', setupVersion: 1 });
  await store.stories.create({ title: 'Practice story' });
  await openControls();
  expect(button('Save backup').disabled).toBe(true);
  await act(async () => button('Save backup').click());
  expect(captured).toHaveLength(0);
  await enterPin('9999');
  expect(button('Save backup').disabled).toBe(false);
  await act(async () => button('Save backup').click());
  expect(captured).toHaveLength(0);
  expect(download).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"] [role="alert"]')!.textContent).toContain('correct adviser PIN');
  expect(container.querySelector<HTMLInputElement>('[aria-label="Adviser PIN"]')!.value).toBe('');
  await enterPin('2468');
  await act(async () => button('Save backup').click());
  expect(captured).toHaveLength(1);
  expect(download).toHaveBeenCalledTimes(1);
  const text = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(captured[0]!); });
  const file = JSON.parse(text);
  expect(file).toMatchObject({ format: 'chatter-newsroom', version: 1 });
  expect(file.records.stories[0].title).toBe('Practice story');
  expect(file.records.settings[0]).not.toHaveProperty('adviserPin');
  expect(text).not.toContain('2468');
  expect(text).not.toContain('9999');
  expect(container.querySelector<HTMLInputElement>('[aria-label="Adviser PIN"]')!.value).toBe('');
});
