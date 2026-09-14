import type { Store } from '@chatter/shared';

const checkpoints = new WeakMap<Store, Set<() => Promise<void>>>();

export function registerSessionCheckpoint(store: Store, save: () => Promise<void>): () => void {
  const callbacks = checkpoints.get(store) ?? new Set();
  checkpoints.set(store, callbacks);
  callbacks.add(save);
  return () => { callbacks.delete(save); };
}

/** Flush mounted editors before reading the portable snapshot. Failures block handoff. */
export async function flushSessionCheckpoints(store: Store): Promise<void> {
  for (const save of checkpoints.get(store) ?? []) await save();
}
