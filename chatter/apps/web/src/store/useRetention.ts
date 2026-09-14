import { workspaceStorage } from '../portable/workspace-context.js';
/**
 * Running the retention sweep.
 *
 * SPEC S3 calls it a nightly job. At Tier 0 there is no night - the tab is
 * shut. So it runs when the club opens Chatter, at most once a day, which is
 * the closest honest equivalent: the promise is that expired material does not
 * linger, not that a cron fires at 2am.
 *
 * The result is RECORDED, not just returned. It used to be discarded by the
 * caller, which meant a student's takes could be deleted and no human could
 * ever say which ones or why one was spared. The Front Desk reads it back.
 */
import { useEffect, useState } from 'react';
import { getSettings, runRetention, type Store, type RetentionResult } from '@chatter/shared';

const LAST_RUN_KEY = 'chatter.retentionLastRun';
const A_DAY = 24 * 60 * 60 * 1000;

export function useRetention(store: Store | null): RetentionResult | null {
  const [swept, setSwept] = useState<RetentionResult | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;

    (async () => {
      let lastRun = 0;
      try {
        lastRun = Number(workspaceStorage(window.localStorage).getItem(LAST_RUN_KEY) ?? 0);
      } catch { /* private window: just run it */ }

      if (Date.now() - lastRun < A_DAY) return;

      const settings = await getSettings(store);
      const result = await runRetention(store, { rolloverMonth: settings.rolloverMonth });

      // Keep the receipt even if this tab closes a moment later.
      await store.settings.save({ lastSweep: { at: Date.now(), ...result } });

      try {
        workspaceStorage(window.localStorage).setItem(LAST_RUN_KEY, String(Date.now()));
      } catch { /* nothing to do; it runs again next open */ }

      if (!cancelled && (result.assetsDeleted > 0 || result.usersPurged > 0)) {
        setSwept(result);
      }
    })();

    return () => { cancelled = true; };
  }, [store]);

  return swept;
}
