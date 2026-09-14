import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ReilyFocus, ReilyRecovery } from './reily-advice.js';

interface SignalEntry<T> {
  token: symbol;
  value: T;
}

export interface ReilySignals {
  focus?: ReilyFocus;
  recovery?: ReilyRecovery;
  publishFocus(value?: ReilyFocus): () => void;
  publishRecovery(value?: ReilyRecovery): () => void;
}

const ReilySignalContext = createContext<ReilySignals | undefined>(undefined);

export function ReilyContextProvider({ children }: { children?: ReactNode }) {
  const [focusEntry, setFocusEntry] = useState<SignalEntry<ReilyFocus>>();
  const [recoveryEntry, setRecoveryEntry] = useState<SignalEntry<ReilyRecovery>>();

  const publishFocus = useCallback((value?: ReilyFocus) => {
    if (!value) return () => undefined;
    const token = Symbol(value);
    setFocusEntry({ token, value });
    return () => setFocusEntry((current) => current?.token === token ? undefined : current);
  }, []);

  const publishRecovery = useCallback((value?: ReilyRecovery) => {
    if (!value) return () => undefined;
    const token = Symbol(value.kind);
    setRecoveryEntry({ token, value });
    return () => setRecoveryEntry((current) => current?.token === token ? undefined : current);
  }, []);

  const value = useMemo<ReilySignals>(() => ({
    focus: focusEntry?.value,
    recovery: recoveryEntry?.value,
    publishFocus,
    publishRecovery,
  }), [focusEntry, publishFocus, publishRecovery, recoveryEntry]);

  return <ReilySignalContext.Provider value={value}>{children}</ReilySignalContext.Provider>;
}

export function useReilySignals(): ReilySignals {
  const value = useContext(ReilySignalContext);
  if (!value) throw new Error('Reily room signals require ReilyContextProvider.');
  return value;
}

export function useReilyFocus(value?: ReilyFocus): void {
  const { publishFocus } = useReilySignals();
  useEffect(() => publishFocus(value), [publishFocus, value]);
}

export function useReilyRecovery(value?: ReilyRecovery): void {
  const { publishRecovery } = useReilySignals();
  useEffect(() => publishRecovery(value), [publishRecovery, value?.kind, value?.workChanged]);
}
