import { LoadingStatus } from '../components/LoadingStatus.js';
/**
 * Opens the local store once and hands it to the rooms.
 *
 * Tier 0: this is the whole product. Nothing here waits on a server, so a kid
 * can open the tab with nothing else switched on. SPEC S9.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Store } from '@chatter/shared';
import { IdbStore } from './store-idb.js';
import { useRetention } from './useRetention.js';

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore called outside StoreProvider');
  return store;
}

export function StoreProvider({ children, dbName = 'chatter' }: { children: ReactNode; dbName?: string }) {
  const [store, setStore] = useState<Store | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let next: IdbStore | undefined;
    (async () => {
      try {
        next = new IdbStore(dbName);
        await next.open();
        if (cancelled) next.close();
        else setStore(next);
      } catch (error) {
        // Say what happened in plain language rather than showing a blank page.
        if (!cancelled) setFailed(String((error as Error).message ?? error));
      }
    })();
    return () => { cancelled = true; next?.close(); };
  }, [dbName]);

  // Sweep expired material once the store is open. SPEC S3.
  useRetention(store);

  if (failed) {
    return (
      <div className="wrap" style={{ padding: 40 }}>
        <h1>Chatter could not open its files</h1>
        <p className="sub">
          The newsroom could not open its work files. Try Chatter in a normal window instead of a private one.
        </p>
        <p className="note">{failed}</p>
      </div>
    );
  }

  if (!store) {
    return (
      <LoadingStatus screen label="Opening your saved work…" detail="Connecting to this device’s newsroom." />
    );
  }

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
