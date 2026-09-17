/**
 * Who is at the desk.
 *
 * SPEC S1: students need no email and no login, so identity here is a badge a
 * kid picks up off a table, not an account they sign in to. The whole model is
 * a pen name and nothing else - and the reason it collects nothing else is
 * that a legal name it never holds is a legal name that can never reach a
 * byline (rule 5).
 *
 * Before this, `useCurrentUser` resolved the kid seat to a hardcoded "Maya R."
 * and the teacher seat to whichever adviser came first out of the store.
 */
import { requireAdviserAuthorization } from './access.js';
import type { Store } from './store.js';
import type { RoleAssign, User } from './types.js';
import type { Decider } from './quarantine.js';

/** Long enough for "Deshawn T.", short enough to fit on a badge. */
export const MAX_PEN_NAME = 24;

export const GRADE_BANDS = ['5th grade', '6th grade', '7th grade', '8th grade'] as const;

export interface PressBadge {
  userId: string;
  penName: string;
  /** What the badge shows big. "Maya R." -> "MR". */
  initials: string;
  gradeBand?: string;
  jobsDone: number;
  /** Nobody has finished a job yet. Shown as a welcome, never as a lack. */
  isNew: boolean;
}

export function initialsOf(penName: string): string {
  return penName.split(/\s+/).filter(Boolean).map((part) => part[0]!.toUpperCase()).join('').slice(0, 2);
}

async function checkName(store: Store, penName: string): Promise<string> {
  const trimmed = penName.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('Pick a pen name first — it is what goes on your work.');
  if (trimmed.length > MAX_PEN_NAME) {
    throw new Error(`That is a bit long for a badge. Try something shorter than ${MAX_PEN_NAME} letters.`);
  }

  // Two identical pen names would make a byline ambiguous, and the Crew room
  // counts contributions per person.
  const taken = (await store.users.list() as User[])
    .some((user) => user.penName.toLowerCase() === trimmed.toLowerCase());
  if (taken) throw new Error('Somebody already has that name. Add a letter, or use a different one.');

  return trimmed;
}

/**
 * A kid makes their own badge. No adviser needed - a kid who cannot start
 * without finding a teacher is a kid who does not start.
 */
export async function createStudent(
  store: Store, input: { penName: string; gradeBand?: string },
): Promise<User> {
  const penName = await checkName(store, input.penName);

  // `name` takes the pen name deliberately. It is the one field that could
  // hold a legal name, so it is never given the chance to.
  const user = await store.users.create({
    name: penName,
    penName,
    role: 'STUDENT',
    active: true,
    ...(input.gradeBand ? { gradeBand: input.gradeBand } : {}),
  });

  await store.events.append({ action: 'badge.made', target: user.id, payload: { penName } });
  return user;
}

/** A second adviser, a substitute, or next year's teacher. */
export async function createAdviser(store: Store, input: { penName: string; authorizationCode: string }): Promise<User> {
  await requireAdviserAuthorization(input.authorizationCode);
  const penName = await checkName(store, input.penName);
  const user = await store.users.create({ name: penName, penName, role: 'ADVISER', active: true });
  await store.events.append({ action: 'adviser.added', target: user.id, payload: { penName } });
  return user;
}

/** Every badge on the table, in the order a kid would scan them. */
export async function badgeTable(store: Store): Promise<PressBadge[]> {
  const [users, assigns] = await Promise.all([
    store.users.list() as Promise<User[]>,
    store.roleAssigns.list() as Promise<RoleAssign[]>,
  ]);

  return users
    .filter((user) => user.role === 'STUDENT' && user.active)
    .map((user) => {
      const jobsDone = assigns.filter((assign) => assign.userId === user.id).length;
      return {
        userId: user.id,
        penName: user.penName,
        initials: initialsOf(user.penName),
        ...(user.gradeBand ? { gradeBand: user.gradeBand } : {}),
        jobsDone,
        isNew: jobsDone === 0,
      };
    })
    .sort((a, b) => a.penName.localeCompare(b.penName));
}

/**
 * Take a badge off the table. Deactivated, never deleted - their pen name is
 * still attached to work they did, and the year-end purge in `retention.ts` is
 * the thing that actually removes people.
 */
export async function retireBadge(store: Store, userId: string, decider: Decider): Promise<User> {
  if (decider.role && decider.role !== 'ADVISER' && decider.role !== 'ADMIN') {
    throw new Error('Only a teacher can take a badge off the table.');
  }
  const user = await store.users.update(userId, { active: false });
  if (user.role === 'ADVISER') {
    const advisersLeft = (await store.users.list() as User[])
      .some((candidate) => candidate.role === 'ADVISER' && candidate.active);
    if (!advisersLeft) await store.settings.save({ adviserPin: '' });
  }
  await store.events.append({ action: 'badge.retired', target: userId, actor: decider.actor });
  return user;
}
