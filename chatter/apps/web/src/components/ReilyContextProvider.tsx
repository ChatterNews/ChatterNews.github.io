import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ReilyFocus, ReilyRecovery } from './reily-advice.js';
import type { ReilySituation } from './reily-help-types.js';

interface SignalEntry<T> { token: symbol; value: T }
interface ReilyPublishers {
  publishFocus(value?: ReilyFocus): () => void;
  publishRecovery(value?: ReilyRecovery): () => void;
  publishSituation(value?: ReilySituation): () => void;
}
export interface ReilySignals extends ReilyPublishers {
  focus?: ReilyFocus;
  recovery?: ReilyRecovery;
  situations: readonly ReilySituation[];
}
const SignalContext = createContext<ReilySignals | undefined>(undefined);
const PublisherContext = createContext<ReilyPublishers | undefined>(undefined);
function usePublisher<T>() {
  const [entries, setEntries] = useState<SignalEntry<T>[]>([]);
  const publish = useCallback((value?: T) => {
    if (value === undefined) return () => undefined;
    const token = Symbol();
    setEntries(current => [...current, { token, value }]);
    return () => setEntries(current => current.filter(entry => entry.token !== token));
  }, []);
  return [entries, publish] as const;
}
export function ReilyContextProvider({ children }: { children?: ReactNode }) {
  const [focus, publishFocus] = usePublisher<ReilyFocus>();
  const [recovery, publishRecovery] = usePublisher<ReilyRecovery>();
  const [situations, publishSituation] = usePublisher<ReilySituation>();
  // Publishing hooks consume only these stable actions, so a changed fact does
  // not force every room publisher to render again.
  const publishers = useMemo(() => ({ publishFocus, publishRecovery, publishSituation }), [publishFocus, publishRecovery, publishSituation]);
  const value = useMemo<ReilySignals>(() => ({ ...publishers, focus: focus.at(-1)?.value,
    recovery: recovery.at(-1)?.value, situations: situations.map(entry => entry.value),
  }), [publishers, focus, recovery, situations]);
  return <PublisherContext.Provider value={publishers}><SignalContext.Provider value={value}>{children}</SignalContext.Provider></PublisherContext.Provider>;
}
export function useReilySignals(): ReilySignals {
  const value = useContext(SignalContext);
  if (!value) throw new Error('Reily room signals require ReilyContextProvider.');
  return value;
}
function usePublishers() {
  const value = useContext(PublisherContext);
  if (!value) throw new Error('Reily room signals require ReilyContextProvider.');
  return value;
}
export function useReilyFocus(value?: ReilyFocus): void {
  const { publishFocus } = usePublishers();
  useEffect(() => publishFocus(value), [publishFocus, value]);
}
export function useReilyRecovery(value?: ReilyRecovery): void {
  const { publishRecovery } = usePublishers();
  useEffect(() => publishRecovery(value), [publishRecovery, value?.kind, value?.workChanged]);
}
export function useReilySituation(value?: ReilySituation): void {
  const publishSituation = useContext(PublisherContext)?.publishSituation;
  // Fixed, tiny scalar fields. Ignore object identity so typing or playback does
  // not publish the same facts every frame. No media or document inspection.
  const key = JSON.stringify(value);
  useEffect(() => publishSituation?.(value), [publishSituation, key]);
}
