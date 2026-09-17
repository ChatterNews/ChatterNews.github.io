/** Local classroom guardrails, not server authentication. No student data leaves the device. */
import { sha256 } from './ids.js';
import type { Store } from './store.js';

export const SCHOOL_TIME_ZONE = 'America/New_York';
export const SCHOOL_HOURS = 'Monday–Friday, 3–6 p.m. Eastern';
// A digest avoids printing the authorization code in UI/exports. Four digits are
// still guessable and a public client can be modified; this is not a secret vault.
const AUTHORIZATION_DIGEST = 'sha256:5932cb6e58ef979208d6b91fcfe0d47c278d78451e733978d35f8b14db88c305';
export async function verifyAdviserAuthorization(code: string): Promise<boolean> {
  return /^\d{4}$/.test(code) && await sha256(new TextEncoder().encode(code)) === AUTHORIZATION_DIGEST;
}
export async function requireAdviserAuthorization(code = ''): Promise<void> {
  if (!await verifyAdviserAuthorization(code)) throw new Error('Enter the correct adviser authorization code.');
}

export interface StudentAccessException { userId: string; from: string; through: string }
const schoolClock = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHOOL_TIME_ZONE, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});
export function schoolTime(now = Date.now()) {
  const parts = Object.fromEntries(schoolClock.formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday, hour: Number(parts.hour) };
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function studentAccessAllowed(userId: string, exceptions: StudentAccessException[] = [], now = Date.now()): boolean {
  if (!Number.isFinite(now)) return false;
  const time = schoolTime(now);
  if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(time.weekday!) && time.hour >= 15 && time.hour < 18) return true;
  return exceptions.some(e => e.userId === userId && validDate(e.from) && validDate(e.through) && e.from <= time.date && e.through >= time.date);
}

/** Authorize inside the operation, before any changes. One dated exception per local badge. */
export async function setStudentAccessException(store: Store, input: StudentAccessException | { userId: string }, code: string, adviserId: string) {
  await requireAdviserAuthorization(code);
  const adviser = await store.users.get(adviserId);
  if (!adviser?.active || adviser.role !== 'ADVISER') throw new Error('Choose an active adviser badge.');
  const student = await store.users.get(input.userId);
  if (!student?.active || student.role !== 'STUDENT') throw new Error('Choose an active student badge.');
  if ('from' in input && (!validDate(input.from) || !validDate(input.through) || input.from > input.through || input.through < schoolTime().date)) {
    throw new Error('Choose a valid date range ending today or later.');
  }
  const settings = await store.settings.get();
  const next = (settings.studentAccessExceptions ?? []).filter(e => e.userId !== input.userId);
  if ('from' in input) next.push({ userId: input.userId, from: input.from, through: input.through });
  await store.settings.save({ studentAccessExceptions: next });
  await store.events.append({ action: 'student.access.changed', target: input.userId, actor: adviserId,
    payload: 'from' in input ? { from: input.from, through: input.through } : { revoked: true } });
}
