/**
 * Sync and merge. SPEC S9b.
 *
 * The invariant underneath all of it: NEVER SILENTLY LOSE A STUDENT'S WORK.
 * When two versions genuinely diverge, keep both and surface a human choice.
 */

import type { Status } from './track.js';

/** A scalar field stamped with the Lamport counter that last wrote it. */
export interface Versioned<T> {
  value: T;
  lamport: number;
  deviceId: string;
}

/**
 * Per-field last-write-wins on a Lamport counter, NEVER wall-clock time -
 * school laptops have wrong clocks and a bad clock must not rewrite history.
 * Ties break on deviceId so every device reaches the same answer alone.
 */
export function mergeField<T, V extends Versioned<T>>(a: V, b: V): V {
  if (a.lamport !== b.lamport) return a.lamport > b.lamport ? a : b;
  return a.deviceId > b.deviceId ? a : b;
}

/** On every local write: advance past every counter we have seen. */
export function tickLamport(current: number, incoming: readonly { lamport: number }[]): number {
  return Math.max(current, ...incoming.map((e) => e.lamport)) + 1;
}

export interface ClaimEvent {
  actor: string;
  lamport: number;
  deviceId: string;
  draftId: string;
}

export interface Alternate {
  actor: string;
  draftId: string;
}

export interface Resolution {
  owner: string;
  /** Losing claims are never deleted; each stays a draft on the same story. */
  alternates: Alternate[];
}

/**
 * Rule 1 - claiming a story. The lowest (lamport, deviceId) pair wins.
 * The loser keeps their draft as an alternate: the Slate shows
 * "2 versions, nothing lost" and a human picks. Never auto-merge, never
 * auto-discard.
 */
export function resolveClaim(events: readonly ClaimEvent[]): Resolution {
  const sorted = [...events].sort(
    (a, b) => a.lamport - b.lamport || (a.deviceId < b.deviceId ? -1 : 1),
  );
  const [winner, ...losers] = sorted;
  return {
    owner: winner!.actor,
    alternates: losers.map((l) => ({ actor: l.actor, draftId: l.draftId })),
  };
}

/** A status field also carries whether an adviser gate put it there. */
export interface GatedStatus extends Versioned<Status> {
  gated: boolean;
}

/**
 * Rule 2's one exception: status may not move backwards past an adviser gate.
 * Approval is an adviser-only event, so a student device cannot un-approve a
 * story by holding a higher counter. Enforced on APPLY, not on write.
 */
export function applyStatus(current: GatedStatus, incoming: GatedStatus): GatedStatus {
  if (current.gated && !incoming.gated) return current;
  return mergeField(current, incoming);
}
