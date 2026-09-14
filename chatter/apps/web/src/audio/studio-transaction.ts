import type { GarageProject, Store } from '@chatter/shared';
import { reconcileStudioProject, type StudioSyncEngine } from './studio-reconcile.js';
import { restoreStudioProject, type StudioRestoreEngine } from './studio-restore.js';

export type StudioTransactionEngine = StudioSyncEngine & StudioRestoreEngine & {
  terminate(): void;
  boot(): Promise<void>;
};

export type StudioTransactionResult =
  | { ok: true; project: GarageProject }
  | { ok: false; project: GarageProject; error: Error };

/** Apply one song edit, rebuilding the prior complete song if OpenDAW mutates only partway. */
export async function applyStudioTransaction(
  store: Store,
  engine: StudioTransactionEngine,
  previous: GarageProject,
  target: GarageProject,
  source: (assetId: string) => Promise<Blob>,
  live: () => boolean,
): Promise<StudioTransactionResult> {
  try {
    return { ok: true, project: await reconcileStudioProject(engine, previous, target, source) };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    if (!live()) return { ok: false, project: previous, error };
    engine.terminate();
    await engine.boot();
    const recovered = await restoreStudioProject(store, engine, previous, live);
    return { ok: false, project: recovered, error };
  }
}
