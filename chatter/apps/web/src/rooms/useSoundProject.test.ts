// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSoundProject, MemoryStore, type SoundProject } from '@chatter/shared';
import { flushSessionCheckpoints } from '../store/session-checkpoint.js';
import { readSoundDraft, useSoundProject } from './useSoundProject.js';

let store: MemoryStore, root: Root, container: HTMLDivElement;
let editor: ReturnType<typeof useSoundProject>;
function Harness() { editor = useSoundProject(store); return createElement('p', { role: 'status' }, editor.status); }
async function mount() { await act(async () => { root.render(createElement(Harness)); }); }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  store = new MemoryStore(); sessionStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T12:00:00Z')); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Foley save queue and recovery', () => {
  it('autosaves the exact edited snapshot and exposes the committed timestamp and revision', async () => {
    const initial = await store.soundProjects.save(makeSoundProject('First cue'), 0); await mount(); await act(async () => editor.open(initial));
    const save = vi.spyOn(store.soundProjects, 'save');
    await act(async () => editor.edit(draft => { draft.name = 'Evening ident'; draft.credits = 'Kai — sound design'; draft.tracks[0]!.pan = -0.4; draft.loopCrossfade = 0.1; }));
    expect(editor.dirty()).toBe(true); expect(readSoundDraft()?.name).toBe('Evening ident');
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    const persisted = (await store.soundProjects.get(initial.id))!;
    expect(persisted).toMatchObject({ name: 'Evening ident', credits: 'Kai — sound design', revision: initial.revision + 1, updatedAt: initial.updatedAt + 250, loopCrossfade: 0.1 });
    expect(persisted.tracks[0]!.pan).toBe(-0.4); expect(editor.project).toEqual(persisted); expect(editor.current.current).toEqual(persisted);
    expect(editor.dirty()).toBe(false); expect(readSoundDraft()).toBeUndefined(); expect(container.textContent).toBe('Saved on this device');
    await act(async () => flushSessionCheckpoints(store)); expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps later edits with the newly committed base revision when the next write fails, then restores and retries', async () => {
    const initial = await store.soundProjects.save(makeSoundProject('First cue'), 0); await mount(); await act(async () => editor.open(initial));
    const first = deferred(); const realSave = store.soundProjects.save.bind(store.soundProjects);
    const save = vi.spyOn(store.soundProjects, 'save').mockImplementationOnce(async (document, revision) => { await first.promise; return realSave(document, revision); }).mockRejectedValueOnce(new Error('Storage quota reached'));
    await act(async () => editor.edit(draft => { draft.name = 'Committed first edit'; }));
    let saving!: Promise<void>; await act(async () => { saving = editor.flush(); void saving.catch(() => undefined); });
    await act(async () => editor.edit(draft => { draft.name = 'Keep the newer edit'; draft.credits = 'Alex — field recording'; }));
    await act(async () => { vi.setSystemTime(new Date('2026-09-21T12:00:01Z')); first.resolve(); await expect(saving).rejects.toThrow('Storage quota reached'); });
    const committed = (await store.soundProjects.get(initial.id))!; const draft = readSoundDraft()!;
    expect(committed.name).toBe('Committed first edit'); expect(committed.revision).toBe(initial.revision + 1);
    expect(draft).toMatchObject({ name: 'Keep the newer edit', credits: 'Alex — field recording', revision: committed.revision, updatedAt: committed.updatedAt });
    expect(editor.project).toEqual(draft); expect(editor.dirty()).toBe(true); expect(container.textContent).toBe('Could not save — Retry');
    expect(save.mock.calls.map(call => call[1])).toEqual([initial.revision, committed.revision]);
    // Recreate the editor from the same recovery document the room sees after reload.
    await act(async () => root.unmount()); root = createRoot(container); await mount();
    save.mockImplementation(realSave); await act(async () => editor.open(draft, true));
    await act(async () => { vi.setSystemTime(new Date('2026-09-21T12:00:02Z')); await editor.flush(); });
    const recovered = (await store.soundProjects.get(initial.id))!;
    expect(recovered).toMatchObject({ name: 'Keep the newer edit', credits: 'Alex — field recording', revision: committed.revision + 1, updatedAt: Date.now() });
    expect(editor.current.current).toEqual(recovered); expect(editor.dirty()).toBe(false); expect(readSoundDraft()).toBeUndefined(); expect(save).toHaveBeenCalledTimes(3);
  });

  it('blocks switching cues after a failed save and succeeds after an explicit retry', async () => {
    const initial = await store.soundProjects.save(makeSoundProject('One'), 0); const other: SoundProject = await store.soundProjects.save(makeSoundProject('Two'), 0);
    await mount(); await act(async () => editor.open(initial)); await act(async () => editor.edit(draft => { draft.name = 'Unsaved title'; }));
    vi.spyOn(store.soundProjects, 'save').mockRejectedValueOnce(new Error('Device full'));
    await act(async () => { await expect(editor.open(other)).rejects.toThrow('Device full'); });
    expect(editor.project?.id).toBe(initial.id); expect(editor.project?.name).toBe('Unsaved title'); expect(readSoundDraft()?.name).toBe('Unsaved title');
    await act(async () => { await editor.flush(); await editor.open(other); });
    expect((await store.soundProjects.get(initial.id))?.name).toBe('Unsaved title'); expect(editor.project?.id).toBe(other.id);
  });
});
