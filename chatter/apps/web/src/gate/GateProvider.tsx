/**
 * Holds the one Gate every room shares.
 *
 * The classifier comes from ModelProvider, and reports `ready` false until the
 * on-device model has answered. While it is false the Gate quarantines
 * pictures rather than approving them - it fails closed. SPEC S9.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Gate, DEFAULT_GATE_CONFIG } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useModels } from '../ml/ModelProvider.js';

interface GateBundle { gate: Gate; classifierReady: boolean }

const GateContext = createContext<GateBundle | null>(null);

export function useGate(): GateBundle {
  const bundle = useContext(GateContext);
  if (!bundle) throw new Error('useGate called outside GateProvider');
  return bundle;
}

export function GateProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { classifier, checkerState } = useModels();

  const bundle = useMemo<GateBundle>(() => ({
    gate: new Gate(store, DEFAULT_GATE_CONFIG, classifier),
    classifierReady: checkerState === 'ready',
  }), [store, classifier, checkerState]);

  return <GateContext.Provider value={bundle}>{children}</GateContext.Provider>;
}
