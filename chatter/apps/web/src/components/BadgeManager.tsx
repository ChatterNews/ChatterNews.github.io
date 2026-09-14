import { useState } from 'react';
import { initialsOf, type User } from '@chatter/shared';

export function BadgeManager({
  advisers, students, currentAdviserId, onClose, onRemove,
}: {
  advisers: User[];
  students: User[];
  currentAdviserId?: string;
  onClose: () => void;
  onRemove: (userId: string) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState<User>();
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();

  async function remove(user: User) {
    setBusyId(user.id); setError(undefined);
    try {
      const removed = await onRemove(user.id);
      if (!removed) setError(`${user.penName}'s badge stayed on the rack. Try again.`);
      else setConfirming(undefined);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : `${user.penName}'s badge stayed on the rack. Try again.`);
    } finally { setBusyId(undefined); }
  }

  function rack(title: string, people: User[]) {
    return <section className="badge-manager-group" aria-labelledby={`badge-rack-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <h3 id={`badge-rack-${title.toLowerCase().replace(/\s/g, '-')}`}>{title}</h3>
      {people.length === 0
        ? <p className="badge-manager-empty">No badges on this rack.</p>
        : <div className="badge-manager-list">{people.map((user) => <div
          className={`badge-manager-row${confirming?.id === user.id ? ' confirming' : ''}`}
          key={user.id}
        >
          <span className="face small">{initialsOf(user.penName)}</span>
          <span className="badge-manager-name"><b>{user.penName}</b>{user.id === currentAdviserId && <small>You</small>}</span>
          <button
            type="button"
            aria-pressed={confirming?.id === user.id}
            onClick={() => { setConfirming(user); setError(undefined); }}
          >Remove badge</button>
        </div>)}</div>}
    </section>;
  }

  return <section className="badge-manager" role="dialog" aria-labelledby="badge-manager-title">
    <header>
      <div><span>STAFF DRAWER</span><h2 id="badge-manager-title">Badge rack</h2></div>
      <button type="button" aria-label="Close badge manager" onClick={onClose}>×</button>
    </header>
    <p className="badge-manager-note">Removing a badge takes it off check-in. Its bylines, credits, and finished work stay put.</p>
    <div className="badge-manager-racks" aria-label="Badge racks">
      {rack('Adviser badges', advisers)}
      {rack('Student badges', students)}
    </div>
    {error && <p className="who-am-i-error badge-manager-error" role="alert">{error}</p>}
    {confirming && <div className="badge-manager-confirm" role="alertdialog" aria-labelledby="badge-remove-title">
      <b id="badge-remove-title">Take {confirming.penName}'s badge off the rack?</b>
      <p>{confirming.id === currentAdviserId ? 'This checks you out of the adviser desk.' : 'Their previous work will still show their name.'}</p>
      <div>
        <button type="button" onClick={() => setConfirming(undefined)} disabled={!!busyId}>Keep badge</button>
        <button type="button" className="remove" onClick={() => void remove(confirming)} disabled={!!busyId}>
          {busyId ? 'Removing…' : 'Remove badge'}
        </button>
      </div>
    </div>}
  </section>;
}
