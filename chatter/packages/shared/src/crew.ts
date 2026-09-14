/**
 * The Crew. SPEC S6: role counts derive from RoleAssign, gradebook export is
 * CSV. Assessment is a query over work that already happened - nobody sits
 * down and types it up at the end.
 */
import type { Store } from './store.js';
import type { RoleAssign, User } from './types.js';

/** The jobs a story needs doing. Order matters: it is the CSV's column order. */
export const CREW_ROLES = ['report', 'write', 'voice', 'edit', 'produce', 'picture'] as const;
export type CrewRole = typeof CREW_ROLES[number];

/** Doing one job this many times running is worth a teacher noticing. */
const RUT_THRESHOLD = 3;

export interface RoleCount {
  userId: string;
  penName: string;
  gradeBand?: string;
  roles: Record<string, number>;
  total: number;
}

export async function roleCounts(store: Store): Promise<RoleCount[]> {
  const [users, assigns] = await Promise.all([
    store.users.list() as Promise<User[]>,
    store.roleAssigns.list() as Promise<RoleAssign[]>,
  ]);

  // The gradebook is about the kids. An adviser's own jobs are not assessed.
  return users.filter((user) => user.role === 'STUDENT').map((user) => {
    const theirs = assigns.filter((a) => a.userId === user.id);
    const roles: Record<string, number> = {};
    for (const role of CREW_ROLES) roles[role] = 0;
    for (const assign of theirs) {
      roles[assign.role] = (roles[assign.role] ?? 0) + 1;
    }
    return {
      userId: user.id,
      penName: user.penName,
      ...(user.gradeBand !== undefined ? { gradeBand: user.gradeBand } : {}),
      roles,
      total: theirs.length,
    };
  });
}

export interface Turn {
  userId: string;
  penName: string;
  /** The job they keep doing, when they keep doing one. */
  overdoing?: string;
  neverTried: boolean;
  say: string;
}

/**
 * Rotation, made visible. "Marcus has voiced four weeks running and has never
 * produced" is the thing a teacher actually wants to know.
 */
export async function whoseTurn(store: Store): Promise<Turn[]> {
  const counts = await roleCounts(store);

  return counts.map((count) => {
    const neverTried = count.total === 0;

    const [topRole, topCount] = Object.entries(count.roles)
      .sort((a, b) => b[1] - a[1])[0] ?? ['', 0];

    // A rut is doing one job a lot AND doing little else.
    const overdoing = topCount >= RUT_THRESHOLD && topCount >= count.total - 1
      ? topRole
      : undefined;

    const say = neverTried
      ? `${count.penName} has not had a turn at anything yet.`
      : overdoing
        ? `${count.penName} has done ${overdoing} ${topCount} times. Somebody should gently swap them onto something else.`
        : `${count.penName} has had a spread of jobs.`;

    return {
      userId: count.userId,
      penName: count.penName,
      ...(overdoing !== undefined ? { overdoing } : {}),
      neverTried,
      say,
    };
  });
}

/** Quote CSV syntax and keep spreadsheet apps from treating data as formulas. */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value.trimStart()) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The gradebook, as a CSV a teacher can open in anything. */
export async function gradebookCsv(store: Store): Promise<string> {
  const counts = await roleCounts(store);
  const header = ['Pen name', 'Grade', 'Total jobs', ...CREW_ROLES].join(',');

  const rows = counts.map((count) => [
    csvField(count.penName),
    csvField(count.gradeBand ?? ''),
    String(count.total),
    ...CREW_ROLES.map((role) => String(count.roles[role] ?? 0)),
  ].join(','));

  return [header, ...rows].join('\n') + '\n';
}
