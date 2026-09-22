// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter, MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoundNavigation } from './useSoundNavigation.js';

let root: Root, container: HTMLDivElement, navigate: NavigateFunction, permit: (action: () => void) => void;
let state: { dirty: boolean; blocked: boolean }; let flush: ReturnType<typeof vi.fn<() => Promise<void>>>; let error: ReturnType<typeof vi.fn<(message: string) => void>>;
function deferred() { let resolve!: () => void; let reject!: (reason: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function Harness() {
  navigate = useNavigate(); const location = useLocation();
  permit = useSoundNavigation({ dirty: () => state.dirty, blocked: () => state.blocked, flush: () => flush(), onError: message => error(message) });
  return createElement('output', {}, location.pathname);
}
const path = () => container.querySelector('output')?.textContent;
async function memory() { await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/desk', '/foley'], initialIndex: 1 }, createElement(Harness)))); }
async function native() {
  window.history.replaceState({ idx: 0 }, '', '/desk'); window.history.pushState({ idx: 1 }, '', '/foley');
  await act(async () => root.render(createElement(BrowserRouter, {}, createElement(Harness))));
}
async function settleHistory() { await new Promise(resolve => setTimeout(resolve, 35)); }
beforeEach(() => {
  state = { dirty: false, blocked: false }; flush = vi.fn(async () => { state.dirty = false; }); error = vi.fn();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Foley guarded navigation', () => {
  it('waits for the current draft before moving Back through memory history', async () => {
    await memory(); state.dirty = true; const writing = deferred(); flush.mockImplementation(async () => { await writing.promise; state.dirty = false; });
    await act(async () => navigate(-1)); expect(path()).toBe('/foley'); expect(flush).toHaveBeenCalledOnce();
    await act(async () => { writing.resolve(); await writing.promise; }); expect(path()).toBe('/desk');
  });
  it('keeps dirty work on a rejected save and supports a later retry', async () => {
    await memory(); state.dirty = true; flush.mockRejectedValueOnce(new Error('Device storage is full'));
    await act(async () => navigate(-1)); expect(path()).toBe('/foley'); expect(error).toHaveBeenLastCalledWith('Device storage is full');
    await act(async () => navigate(-1)); expect(path()).toBe('/desk'); expect(flush).toHaveBeenCalledTimes(2);
  });
  it('blocks Back, push and replace while a recording or sound job is active', async () => {
    await memory(); state.blocked = true;
    await act(async () => { navigate(-1); navigate('/blast'); navigate('/chatterbox', { replace: true }); });
    expect(path()).toBe('/foley'); expect(flush).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledTimes(3);
    await act(async () => permit(() => navigate('/blast'))); expect(path()).toBe('/blast');
  });
  it('rechecks a recording that starts while an earlier navigation waits for saving', async () => {
    await memory(); state.dirty = true; const writing = deferred(); flush.mockImplementation(async () => { await writing.promise; state.dirty = false; });
    await act(async () => navigate('/blast')); state.blocked = true;
    await act(async () => { writing.resolve(); await writing.promise; });
    expect(path()).toBe('/foley'); expect(error).toHaveBeenLastCalledWith(expect.stringContaining('Finish the sound job'));
    state.blocked = false; await act(async () => navigate('/blast')); expect(path()).toBe('/blast');
  });
  it('restores a native browser Back before exposing another room when a job blocks navigation', async () => {
    await native(); state.blocked = true;
    await act(async () => { window.history.back(); await settleHistory(); });
    expect(path()).toBe('/foley'); expect(window.location.pathname).toBe('/foley'); expect(window.history.state.idx).toBe(1);
    expect(error).toHaveBeenCalledOnce(); expect(flush).not.toHaveBeenCalled();
  });
  it('holds native Back at the cue until saving completes, then replays the intended step', async () => {
    await native(); state.dirty = true; const writing = deferred(); flush.mockImplementation(async () => { await writing.promise; state.dirty = false; });
    await act(async () => { window.history.back(); await settleHistory(); });
    expect(path()).toBe('/foley'); expect(window.location.pathname).toBe('/foley'); expect(flush).toHaveBeenCalledOnce();
    await act(async () => { writing.resolve(); await writing.promise; await settleHistory(); });
    expect(path()).toBe('/desk'); expect(window.location.pathname).toBe('/desk');
  });
});
