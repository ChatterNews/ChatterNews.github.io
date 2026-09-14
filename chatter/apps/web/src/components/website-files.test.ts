// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import type { Story } from '@chatter/shared';
const handoff = vi.hoisted(() => ({ prepare: vi.fn(), download: vi.fn(), share: vi.fn() }));
vi.mock('../store/StoreProvider.js', () => ({ useStore: () => ({}) }));
vi.mock('../gate/GateProvider.js', () => ({ useGate: () => ({ gate: {} }) }));
vi.mock('./StoryDriveOpen.js', () => ({ StoryDriveOpen: () => null }));
vi.mock('../portable/mobile-session.js', () => ({ prepareMobileSession: handoff.prepare, downloadMobileFile: handoff.download, offerMobileFile: handoff.share }));
import { ProjectDrive } from './ProjectDrive.js';
let root: Root;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(label));
  expect(button, `Button ${label}`).toBeDefined();
  await act(async () => button!.click());
}
test('website Finish session works without a folder picker and only offers an explicit download', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('VITE_ORBIT_WEB', 'true');
  handoff.prepare.mockResolvedValue({ file: new File(['practice'], 'session.zip'), stories: 1 });
  handoff.download.mockReturnValue('download');
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  const story = { id: 'practice', title: 'Practice story', status: 'WORK' } as Story;
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(ProjectDrive, { stories: [story], onChanged: () => {} }))));
  await click('Story drive'); await click('Finish session');
  expect(document.body.textContent).toContain('session.zip');
  expect(document.body.textContent).not.toContain('share sheet');
  expect(handoff.download).not.toHaveBeenCalled();
  await click('Download file');
  expect(handoff.download).toHaveBeenCalledOnce();
  expect(handoff.share).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Download started');
});
