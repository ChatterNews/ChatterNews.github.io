/**
 * Writing down who did what, as they do it.
 *
 * SPEC build-plan: "Assessment becomes a query. Rotation becomes visible."
 * That only holds if the jobs get written down as a byproduct of working -
 * which is what this is.
 */
import type { Store } from './store.js';
import type { RoleAssign } from './types.js';

export interface RecordRoleInput {
  userId: string;
  storyId: string;
  role: string;
  cycle?: string;
}

/** A stable label for the week a job was done in, for rotation. */
export function currentCycle(now = Date.now()): string {
  const date = new Date(now);
  // Shift to the Monday of this week so a whole school week shares a label.
  const day = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date.getTime() - day * 24 * 60 * 60 * 1000);
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Record that somebody did a job. Idempotent per person, story, job and week:
 * the Desk calls this on every save, and fifty saves is one piece of writing.
 */
export async function recordRole(store: Store, input: RecordRoleInput): Promise<void> {
  const cycle = input.cycle ?? currentCycle();
  const existing = await store.roleAssigns.list() as RoleAssign[];

  const already = existing.some((a) =>
    a.userId === input.userId
    && a.storyId === input.storyId
    && a.role === input.role
    && a.cycle === cycle);

  if (already) return;

  await store.roleAssigns.create({
    userId: input.userId, storyId: input.storyId, role: input.role, cycle,
  });
}
