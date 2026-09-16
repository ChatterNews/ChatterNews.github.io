/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { MemoryStore, emptyProject } from '@chatter/shared';
import { SavedStudioProjects } from './SavedStudioProjects.js';
import { exportPortableStory } from '../portable/portable-project.js';
const state = vi.hoisted(() => ({ store: undefined as unknown }));
vi.mock('../store/StoreProvider.js', () => ({ useStore: () => state.store }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('a fresh newsroom has no Studio archive controls', async () => {
  state.store = new MemoryStore();
  const host = document.createElement('div'); const root = createRoot(host);
  try { await act(async () => root.render(createElement(SavedStudioProjects, { stories: [] }))); expect(host.textContent).toBe(''); }
  finally { await act(async () => root.unmount()); }
});

test('an older standalone song can be linked and packed without the DAW', async () => {
  const store = new MemoryStore(); state.store = store;
  const story = await store.stories.create({ title: 'Morning bulletin' });
  const song = emptyProject('Saved song');
  await store.studioProjects.create({ project: song });
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SavedStudioProjects, { stories: [story] })));
    expect(host.textContent).toContain('Saved song');
    const select = host.querySelector('select')!;
    await act(async () => { select.value = story.id; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => host.querySelector('button')!.click());
    expect(host.textContent).toContain('Saved with Morning bulletin');
    expect((await store.studioProjects.list())[0]!.project).toEqual(song);
    const packed = await exportPortableStory(store, story);
    expect(packed.project.studioProjects![0]!.project).toEqual(song);
  } finally { await act(async () => root.unmount()); }
});
