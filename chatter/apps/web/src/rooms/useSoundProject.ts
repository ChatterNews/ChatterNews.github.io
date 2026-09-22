import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoundProject, Store } from '@chatter/shared';
import { saveSoundProject } from '../audio/sound-repository.js';
import { registerSessionCheckpoint } from '../store/session-checkpoint.js';
import { workspaceStorage } from '../portable/workspace-context.js';

const draftKey = 'foley.recoverable-draft.v1';
export function readSoundDraft(): SoundProject | undefined {
  try { const value = workspaceStorage(sessionStorage).getItem(draftKey); return value ? JSON.parse(value) : undefined; } catch { return undefined; }
}

export function useSoundProject(store: Store) {
  const [project, setProject] = useState<SoundProject>(); const current = useRef<SoundProject>();
  const [status, setStatus] = useState('Saved on this device'); const [error, setError] = useState('');
  const [undo, setUndo] = useState<SoundProject[]>([]); const [redo, setRedo] = useState<SoundProject[]>([]);
  const revision = useRef(0); const generation = useRef(0); const savedGeneration = useRef(0); const queue = useRef<Promise<void>>(); const timer = useRef<number>();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; window.clearTimeout(timer.current); }; }, []);
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (queue.current) { await queue.current; if (generation.current === savedGeneration.current) return; }
    const run = async () => {
      while (current.current && generation.current !== savedGeneration.current) {
        const snapshot = structuredClone(current.current); const savingGeneration = generation.current;
        if (mounted.current) { setStatus('Saving…'); setError(''); }
        try {
          const saved = await saveSoundProject(store, { ...snapshot, revision: revision.current }, revision.current);
          revision.current = saved.revision; savedGeneration.current = savingGeneration;
          if (current.current?.id === snapshot.id) {
            current.current = { ...current.current, revision: saved.revision, updatedAt: saved.updatedAt };
            if (generation.current !== savingGeneration) {
              try { workspaceStorage(sessionStorage).setItem(draftKey, JSON.stringify(current.current)); } catch { /* Keep the in-memory draft; failed persistence remains visible. */ }
            }
            if (mounted.current) setProject(current.current);
          }
          if (generation.current === savingGeneration) {
            workspaceStorage(sessionStorage).removeItem(draftKey);
            if (mounted.current) setStatus('Saved on this device');
          }
        } catch (problem) {
          if (mounted.current) { setStatus('Could not save — Retry'); setError(problem instanceof Error ? problem.message : 'Your changes are still here. Retry saving.'); }
          throw problem;
        }
      }
    };
    const pending = run(); queue.current = pending;
    try { await pending; } finally { if (queue.current === pending) queue.current = undefined; }
  }, [store]);
  useEffect(() => registerSessionCheckpoint(store, flush), [store, flush]);
  const mark = useCallback((next: SoundProject) => {
    current.current = next; generation.current++; setProject(next); setStatus('Saving…'); setError('');
    try { workspaceStorage(sessionStorage).setItem(draftKey, JSON.stringify({ ...next, revision: revision.current })); } catch { setError('The recovery copy could not be written. Keep this tab open until saving finishes.'); }
    window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { void flush().catch(() => undefined); }, 250);
  }, [flush]);
  const open = useCallback(async (next: SoundProject, unsaved = false) => {
    await flush(); revision.current = next.revision; current.current = structuredClone(next); setProject(current.current);
    generation.current = 0; savedGeneration.current = 0; setUndo([]); setRedo([]); setError(''); setStatus('Saved on this device');
    if (unsaved) mark(current.current);
  }, [flush, mark]);
  const edit = useCallback((recipe: (next: SoundProject) => void) => {
    if (!current.current) return;
    const before = structuredClone(current.current); const next = structuredClone(before); recipe(next);
    setUndo(values => [...values.slice(-59), before]); setRedo([]); mark(next);
  }, [mark]);
  function undoEdit() { const previous = undo.at(-1); if (!previous || !current.current) return; setRedo(values => [...values, structuredClone(current.current!)]); setUndo(values => values.slice(0, -1)); mark({ ...previous, revision: revision.current }); }
  function redoEdit() { const next = redo.at(-1); if (!next || !current.current) return; setUndo(values => [...values, structuredClone(current.current!)]); setRedo(values => values.slice(0, -1)); mark({ ...next, revision: revision.current }); }
  useEffect(() => {
    const leaving = (event: BeforeUnloadEvent) => { if (generation.current !== savedGeneration.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leaving); return () => window.removeEventListener('beforeunload', leaving);
  }, []);
  return { project, current, status, error, flush, open, edit, undoEdit, redoEdit, canUndo: !!undo.length, canRedo: !!redo.length, dirty: () => generation.current !== savedGeneration.current };
}
