// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { MemoryStore, type Store } from '@chatter/shared';
import { ReilyContextProvider } from '../components/ReilyContextProvider.js';
import { flushSessionCheckpoints } from '../store/session-checkpoint.js';
import { finishSession } from '../portable/finish-session.js';
import { sessionDownloadDirectory } from '../portable/mobile-session.js';
import { Chatterbox } from './Chatterbox.js';

let store: Store;
// Inject the real store directly; these tests exercise the room and its checkpoint
// without opening a separate IndexedDB workspace or requesting microphone access.
vi.mock('../store/StoreProvider.js', () => ({ useStore: () => store }));
vi.mock('../gate/GateProvider.js', () => ({ useGate: () => ({ gate: {} }) }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  store = new MemoryStore();
  sessionStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open(route = '/chatterbox') {
  await act(async () => root.render(createElement(StrictMode, {}, createElement(MemoryRouter, { initialEntries: [route] },
    createElement(ReilyContextProvider, {}, createElement(Chatterbox, { stories: [] })),
  ))));
}

async function change(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Chatterbox saving during a session', () => {
  it.each(['/chatterbox', '/chatterbox?story=missing'])('leaves an untouched preview out of Finish at %s', async route => {
    await open(route);
    expect(container.querySelector('.chatterbox-hero')).not.toBeNull();
    await act(async () => flushSessionCheckpoints(store));
    expect(await store.podcastProjects.list()).toHaveLength(0);
  });

  it('opens and checkpoints a requested story while parent story props are still loading', async () => {
    const story = await store.stories.create({ title: 'Our robotics team' });
    await open(`/chatterbox?story=${story.id}`);
    await act(async () => flushSessionCheckpoints(store));
    const projects = await store.podcastProjects.list();
    expect(projects).toHaveLength(1);
    expect(projects[0]!.storyIds).toEqual([story.id]);
    expect([...container.querySelectorAll('input')].some(input => input.value === 'Our robotics team')).toBe(true);
  });

  it.each(['title', 'script', 'show name'])('checkpoints a %s-only edit without waiting for autosave', async field => {
    await open();
    const input = field === 'script'
      ? container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Segment 1 script"]')!
      : [...container.querySelectorAll<HTMLInputElement>('input')].find(input => input.parentElement?.textContent?.startsWith(field === 'title' ? 'Episode title' : 'Show name'))!;
    await change(input, 'Keep this first idea');
    await act(async () => flushSessionCheckpoints(store));
    const projects = await store.podcastProjects.list();
    expect(projects).toHaveLength(1);
    expect(projects[0]!.storyIds).toEqual([]);
    if (field === 'title') expect(projects[0]!.title).toBe('Keep this first idea');
    if (field === 'script') expect(projects[0]!.segments[0]!.script).toBe('Keep this first idea');
    if (field === 'show name') expect((await store.podcastShows.get(projects[0]!.showId))!.title).toBe('Keep this first idea');
    expect((await store.podcastShows.get(projects[0]!.showId))!.nextEpisodeNumber).toBe(2);
  });

  it('saves an added break card even when the student immediately leaves the room', async () => {
    await open();
    const button = [...container.querySelectorAll('button')].find(button => button.textContent === 'Break')!;
    expect(button).toBeDefined();
    await act(async () => button.click());
    await act(async () => root.unmount());
    root = createRoot(container);
    expect((await store.podcastProjects.list())[0]!.segments.filter(segment => segment.kind === 'BREAK')).toHaveLength(2);
  });

  it('waits for the real room unmount save before Finish checks for unlinked work', async () => {
    await store.stories.create({ title: 'The story to hand in' });
    await open();
    const title = [...container.querySelectorAll<HTMLInputElement>('input')].find(input => input.parentElement?.textContent?.startsWith('Episode title'))!;
    await change(title, 'My unlinked reporting notes');
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const create = store.podcastProjects.create.bind(store.podcastProjects);
    store.podcastProjects.create = async input => { await blocked; return create(input); };
    await act(async () => root.unmount());
    root = createRoot(container);
    const destination = sessionDownloadDirectory();
    let settled = false;
    const finishing = finishSession(store, destination.directory).finally(() => { settled = true; });
    void finishing.catch(() => undefined);
    try {
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(settled).toBe(false);
      expect(destination.entries.size).toBe(0);
    } finally { release(); }
    await expect(finishing).rejects.toThrow('My unlinked reporting notes');
    expect((await store.podcastProjects.list())[0]!.title).toBe('My unlinked reporting notes');
  });

  it('Undo removes first-added credits and Redo restores them after a failed save', async () => {
    await open();
    const station = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('.chatterbox-stations button')].find(button => button.querySelector('b')?.textContent === label)!;
    await act(async () => station('Package').click());
    const input = container.querySelector<HTMLTextAreaElement>('[aria-label="Episode credits"]')!;
    await change(input, 'Lee — sound design');
    const create = vi.spyOn(store.podcastProjects, 'create').mockRejectedValueOnce(new Error('quota'));
    await act(async () => { await expect(flushSessionCheckpoints(store)).rejects.toThrow('quota'); });
    expect(input.value).toBe('Lee — sound design');
    create.mockRestore();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    await act(async () => station('Cut').click());
    const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label)!;
    await act(async () => button('Undo').click());
    await act(async () => flushSessionCheckpoints(store));
    expect((await store.podcastProjects.list())[0]!.credits).toBeUndefined();
    await act(async () => button('Redo').click());
    await act(async () => flushSessionCheckpoints(store));
    expect((await store.podcastProjects.list())[0]!.credits).toBe('Lee — sound design');
    await act(async () => button('Undo').click());
    await act(async () => flushSessionCheckpoints(store));
    expect((await store.podcastProjects.list())[0]!.credits).toBeUndefined();
  });

  it('drains edits made while the checkpoint save is in flight before declaring completion', async () => {
    await open();
    const input = [...container.querySelectorAll<HTMLInputElement>('input')].find(input => input.parentElement?.textContent?.startsWith('Episode title'))!;
    await change(input, 'First draft');
    let release!: () => void; let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const create = store.podcastProjects.create.bind(store.podcastProjects);
    const spy = vi.spyOn(store.podcastProjects, 'create').mockImplementation(async value => { entered(); await blocked; return create(value); });
    const saving = flushSessionCheckpoints(store);
    try {
      await started;
      await change(input, 'Latest draft while saving');
    } finally { release(); }
    await act(async () => saving);
    spy.mockRestore();
    expect((await store.podcastProjects.list())[0]!.title).toBe('Latest draft while saving');
  });

});
