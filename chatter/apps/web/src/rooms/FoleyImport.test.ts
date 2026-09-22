// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySoundAttribution, MemoryStore, type SoundAttribution, type SoundLibraryItem } from '@chatter/shared';
import { importSoundFile } from '../audio/sound-repository.js';
import { FoleyImport } from './FoleyImport.js';

let store: MemoryStore;
vi.mock('../store/StoreProvider.js', () => ({ useStore: () => store }));
vi.mock('../gate/GateProvider.js', () => ({ useGate: () => ({ gate: {} }) }));
vi.mock('../audio/sound-repository.js', () => ({ importSoundFile: vi.fn() }));
let root: Root, container: HTMLDivElement;
const imported = vi.mocked(importSoundFile);
function item(file: File, attribution: SoundAttribution): SoundLibraryItem {
  return { id: file.name, createdAt: 1, updatedAt: 1, assetId: `asset-${file.name}`, name: file.name, attribution: structuredClone(attribution), tags: [], collectionIds: [], favorite: false, archived: false, duration: 1, peaks: [0.2] };
}
const file = (name: string) => new File([new Uint8Array([1])], name, { type: 'audio/wav' });
function button(text: string, within: ParentNode = container) { const found = [...within.querySelectorAll('button')].find(row => row.textContent === text); if (!found) throw new Error(`Missing button: ${text}`); return found; }
function input(label: string) { const found = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`); if (!found) throw new Error(`Missing input: ${label}`); return found; }
async function change(target: HTMLInputElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value); target.dispatchEvent(new Event('input', { bubbles: true })); }); }
beforeEach(() => {
  store = new MemoryStore(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); imported.mockReset(); imported.mockImplementation(async (_store, _gate, source, credits) => item(source, credits));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Foley batch import', () => {
  it('adds a second drop without replacing the queued file or its batch credits', async () => {
    const first = file('breeze.wav'), second = file('bell.wav'); const saved = vi.fn(); const outerDrop = vi.fn();
    function Workspace() {
      const [files, setFiles] = useState([first]);
      return createElement('main', { onDrop: (event: React.DragEvent) => { outerDrop(); setFiles([...event.dataTransfer.files]); } }, createElement(FoleyImport, { key: files.map(row => row.name).join('|'), initialFiles: files, onSaved: saved, onClose: vi.fn() }));
    }
    await act(async () => root.render(createElement(Workspace))); await change(input('Batch Creator / credit'), 'River club');
    await act(async () => { const event = new Event('drop', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'dataTransfer', { value: { files: [second] } }); container.querySelector('[aria-label="Import sounds"]')!.dispatchEvent(event); });
    expect(outerDrop).not.toHaveBeenCalled(); expect([...container.querySelectorAll('.foley-import-list strong')].map(row => row.textContent)).toEqual(['breeze.wav', 'bell.wav']);
    expect(input('Batch Creator / credit').value).toBe('River club');
    await act(async () => button('Import 2 sounds').click());
    expect(imported.mock.calls.map(call => [call[2].name, call[3].creator])).toEqual([['breeze.wav', 'River club'], ['bell.wav', 'River club']]); expect(saved).toHaveBeenCalledTimes(2);
  });

  it('retries only failed files while preserving completed imports and their status', async () => {
    const saved = vi.fn(); imported.mockImplementationOnce(async (_store, _gate, source, credits) => item(source, credits)).mockRejectedValueOnce(new Error('Storage unavailable'));
    await act(async () => root.render(createElement(FoleyImport, { initialFiles: [file('first.wav'), file('second.wav')], onSaved: saved, onClose: vi.fn() })));
    await act(async () => button('Import 2 sounds').click());
    expect(saved).toHaveBeenCalledTimes(1); expect(container.querySelector('[role="alert"]')?.textContent).toContain('Storage unavailable');
    expect(container.querySelectorAll('.foley-import-list li')[0]?.textContent).toContain('Saved to the library');
    await act(async () => button('Retry unsaved files').click());
    expect(imported.mock.calls.map(call => call[2].name)).toEqual(['first.wav', 'second.wav', 'second.wav']); expect(saved.mock.calls.map(call => call[0].name)).toEqual(['first.wav', 'second.wav']);
    expect([...container.querySelectorAll('.foley-import-list li')].every(row => row.textContent?.includes('Saved to the library'))).toBe(true);
  });

  it('keeps per-file attribution overrides independent when the remaining batch credits change', async () => {
    await act(async () => root.render(createElement(FoleyImport, { initialFiles: [file('solo.wav'), file('group.wav')], onSaved: vi.fn(), onClose: vi.fn() })));
    await change(input('Batch Creator / credit'), 'Original batch');
    await act(async () => button('Different credits', container.querySelectorAll('.foley-import-list li')[0]!).click());
    await change(input('solo.wav Creator / credit'), 'Solo recorder'); await change(input('solo.wav Attribution notes'), 'Credit required: Solo recorder');
    await change(input('Batch Creator / credit'), 'Updated group');
    await act(async () => button('Import 2 sounds').click());
    expect(imported.mock.calls.map(call => call[3])).toEqual([
      { ...emptySoundAttribution(), creator: 'Solo recorder', notes: 'Credit required: Solo recorder' },
      { ...emptySoundAttribution(), creator: 'Updated group' },
    ]);
  });
});
