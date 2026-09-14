import { useLayoutEffect, useRef } from 'react';
import type { Store } from '@chatter/shared';
import { registerSessionCheckpoint } from './session-checkpoint.js';

export function useSessionCheckpoint(store: Store, save: () => Promise<void>): void {
  const latest = useRef(save);
  useLayoutEffect(() => { latest.current = save; });
  useLayoutEffect(() => registerSessionCheckpoint(store, () => latest.current()), [store]);
}
