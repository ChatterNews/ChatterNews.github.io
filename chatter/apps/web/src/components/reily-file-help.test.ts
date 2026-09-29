// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import type { Story } from '@chatter/shared';
import type { ReilyHelpContext } from './reily-help-types.js';
const testState = vi.hoisted(() => ({ context: undefined as ReilyHelpContext | undefined, prepare: vi.fn() }));
vi.mock('../store/StoreProvider.js', () => ({ useStore: () => ({}) }));
vi.mock('../gate/GateProvider.js', () => ({ useGate: () => ({ gate: {} }) }));
vi.mock('./StoryDriveOpen.js', () => ({ StoryDriveOpen: () => null }));
vi.mock('../portable/mobile-session.js', () => ({ prepareMobileSession: testState.prepare, downloadMobileFile: vi.fn(), offerMobileFile: vi.fn() }));
vi.mock('./ReilyHelpPanel.js', () => ({ default: ({ context, onNavigate }: { context: ReilyHelpContext; onNavigate: (room: string) => void }) => {
  testState.context = context;
  return createElement('button', { onClick: () => onNavigate('desk'), 'data-reily-navigation': true }, 'Go to my writing');
} }));
import { ProjectDrive } from './ProjectDrive.js';
let root: Root;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); testState.context = undefined; });
const story = { id: 'story-1', title: 'Practice', status: 'WORK', group: { kind: 'main' } } as Story;
function Route() { return createElement('output', { id: 'route' }, useLocation().pathname); }
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function mount(saveOnly = false) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubEnv('VITE_ORBIT_WEB', 'true');
  const container = document.createElement('div'); container.id = 'root'; document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(ProjectDrive, { stories: [story], saveOnly, onChanged: () => {} }), createElement(Route))));
  await click('Files');
}
test('file help is opt-in inside the dialog and returns to the selected story', async () => {
  await mount();
  expect(testState.context).toBeUndefined();
  expect(document.querySelector<HTMLElement>('#root')?.inert).toBe(true);
  await click('Ask Reily about files');
  await vi.waitFor(() => expect(testState.context?.situation?.activeTool).toBe('story-drive'));
  expect(testState.context?.story?.id).toBe(story.id);
  expect(testState.context?.situation?.groupKind).toBe('main');
  expect(document.querySelector('[role="dialog"] [data-reily-local-help]')).not.toBeNull();
  await click('Go to my writing');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('#route')?.textContent).toBe('/desk/story-1');
  expect(document.querySelector<HTMLElement>('#root')?.inert).toBe(false);
});
test('help cannot route around the school-closed save-only drawer', async () => {
  await mount(true);
  await click('Ask Reily about files');
  await vi.waitFor(() => expect(testState.context).toBeDefined());
  await click('Go to my writing');
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector('#route')?.textContent).toBe('/');
});
test('help remains readable during packing but cannot navigate away mid-save', async () => {
  let finish!: (value: { file: File; stories: number }) => void;
  testState.prepare.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount();
  await click('Finish session');
  await click('Ask Reily about files');
  await vi.waitFor(() => expect(testState.context?.situation?.busy).toBe(true));
  await click('Go to my writing');
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector('#route')?.textContent).toBe('/');
  await act(async () => finish({ file: new File(['saved'], 'session.zip'), stories: 1 }));
  await click('Go to my writing');
  expect(document.querySelector('#route')?.textContent).toBe('/desk/story-1');
});
