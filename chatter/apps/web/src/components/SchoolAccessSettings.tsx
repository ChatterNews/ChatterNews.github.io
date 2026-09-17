import { useEffect, useState } from 'react';
import { SCHOOL_HOURS, schoolTime, setStudentAccessException, type StudentAccessException, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import './SchoolAccess.css';

export function SchoolAccessSettings({ adviserId, students }: { adviserId: string; students: User[] }) {
  const store = useStore();
  const [grants, setGrants] = useState<StudentAccessException[]>([]);
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState(schoolTime().date);
  const [through, setThrough] = useState(schoolTime().date);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { void store.settings.get().then(s => setGrants(s.studentAccessExceptions ?? [])).catch(() => setMessage('Exceptions could not load. Reopen this room to retry.')); }, [store]);
  async function change(revokeId?: string) {
    setBusy(true); setMessage('');
    try {
      await setStudentAccessException(store, revokeId ? { userId: revokeId } : { userId, from, through }, code, adviserId);
      setGrants((await store.settings.get()).studentAccessExceptions ?? []);
      setMessage(revokeId ? 'Extra days removed.' : 'Extra days approved for this badge in this browser.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The exception did not save.'); }
    finally { setBusy(false); setCode(''); }
  }
  return <section className="school-access-settings" aria-labelledby="school-hours-title">
    <h2 id="school-hours-title">Newsroom hours & extra days</h2>
    <p>Students: <b>{SCHOOL_HOURS}</b>. Advisers can use every room at any time.</p>
    <p>Extra days allow all-day access, through the end of the last date in Eastern time. Apply this on the student’s browser; badges and approvals do not sync between devices.</p>
    <form onSubmit={event => { event.preventDefault(); void change(); }}>
      <label>Student badge<select aria-label="Student badge" required value={userId} onChange={event => setUserId(event.target.value)}><option value="">Choose a student</option>{students.filter(s => s.active && s.role === 'STUDENT').map(s => <option key={s.id} value={s.id}>{s.penName}</option>)}</select></label>
      <label>From<input type="date" required value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Through<input type="date" required min={from} value={through} onChange={event => setThrough(event.target.value)} /></label>
      <label>Adviser authorization code<input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
      <button className="newsroom-button primary" disabled={busy || !userId || code.length !== 4}>Approve extra days</button>
    </form>
    <ul>{grants.map(g => <li key={g.userId}><b>{students.find(s => s.id === g.userId)?.penName ?? 'Retired badge'}</b>: {g.from} through {g.through}{g.through < schoolTime().date ? ' (expired)' : ''}<button className="newsroom-button" disabled={busy || code.length !== 4} onClick={() => void change(g.userId)}>Revoke</button></li>)}</ul>
    <small>Enter the authorization code above to approve or revoke. These are local classroom controls, not verified student accounts. Changing device data or its clock can bypass them.</small>
    {message && <p role="status">{message}</p>}
  </section>;
}
