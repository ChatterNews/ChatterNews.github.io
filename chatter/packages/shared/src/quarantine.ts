/**
 * The adviser queue. SPEC S4: a score between the thresholds quarantines
 * rather than approving or rejecting, and a person decides.
 *
 * Without this the Gate has a dead end - a quarantined picture blocks
 * publishing and nobody can do anything about it.
 */
import type { Store } from './store.js';
import type { Asset } from './types.js';

export interface Decider {
  actor: string;
  role?: 'STUDENT' | 'ADVISER' | 'ADMIN';
}

/** Everything waiting for a teacher to look at it, oldest first. */
export async function quarantined(store: Store): Promise<Asset[]> {
  const assets = await store.assets.list();
  return assets
    .filter((a) => a.gateStatus === 'QUARANTINED')
    .sort((a, b) => a.createdAt - b.createdAt);
}

function mustBeAdviser(decider: Decider): void {
  if (decider.role && decider.role !== 'ADVISER' && decider.role !== 'ADMIN') {
    throw new Error('Only a teacher can decide about this one.');
  }
}

async function stillWaiting(store: Store, assetId: string): Promise<Asset> {
  const asset = await store.assets.get(assetId);
  if (!asset) throw new Error(`no asset ${assetId}`);
  if (asset.gateStatus !== 'QUARANTINED') {
    throw new Error('Somebody has already decided about this one.');
  }
  return asset;
}

/** Let it through. The bytes were already frozen locally when it arrived. */
export async function releaseFromQuarantine(
  store: Store, assetId: string, decider: Decider,
): Promise<void> {
  mustBeAdviser(decider);
  await stillWaiting(store, assetId);

  await store.assets.update(assetId, { gateStatus: 'APPROVED' });
  await store.events.append({
    action: 'quarantine.released',
    target: assetId,
    actor: decider.actor,
  });
}

/**
 * Throw it out. The bytes go, the same way a Gate rejection discards them -
 * but the Asset row and the audit event stay, so the decision is answerable
 * later even though the picture is gone.
 */
export async function rejectFromQuarantine(
  store: Store, assetId: string, decider: Decider,
): Promise<void> {
  mustBeAdviser(decider);
  const asset = await stillWaiting(store, assetId);

  await store.blobs.remove(asset.sha256);
  await store.assets.update(assetId, { gateStatus: 'REJECTED' });
  await store.events.append({
    action: 'quarantine.rejected',
    target: assetId,
    actor: decider.actor,
    payload: { sha256: asset.sha256 },
  });
}
