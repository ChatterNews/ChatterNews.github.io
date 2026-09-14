/**
 * The name in the top right corner, and the menu behind it.
 *
 * An adviser uses it to say which adviser they are - a club can have two, or a
 * substitute, and before this the app simply took whichever adviser came out
 * of the store first. A student uses it to put their badge back and let the
 * next kid pick theirs up, which is what sharing one classroom laptop means.
 */
import { useEffect, useRef, useState } from 'react';
import { createAdviser, initialsOf, retireBadge, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { BadgeManager } from './BadgeManager.js';
import './WhoAmI.css';

export function WhoAmI({ me, choices, students, adviser, onChoose, onChanged, onHandBack }: {
  me?: User;
  choices: User[];
  students: User[];
  adviser: boolean;
  onChoose: (userId: string) => void | Promise<boolean>;
  onChanged: () => void;
  onHandBack: () => void;
}) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [penName, setPenName] = useState('');
  const [error, setError] = useState<string>();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function away(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) { setOpen(false); setAdding(false); setManaging(false); setError(undefined); }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); setAdding(false); setManaging(false); setError(undefined); }
    }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', escape); };
  }, [open]);

  const penNameShown = me?.penName ?? (adviser ? 'Pick your name' : 'Pick a badge');

  async function add() {
    setError(undefined);
    try {
      const user = await createAdviser(store, { penName });
      onChanged();
      await onChoose(user.id);
      setAdding(false); setPenName(''); setOpen(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work.');
    }
  }

  async function remove(userId: string): Promise<boolean> {
    if (!adviser || !me) return false;
    await retireBadge(store, userId, { actor: me.id, role: 'ADVISER' });
    onChanged();
    if (userId === me.id) {
      setOpen(false); setManaging(false); onHandBack();
    }
    return true;
  }

  return (
    <div className="who-am-i" ref={wrap}>
      <button
        className="me who-am-i-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={adviser ? 'Change who the adviser is' : 'Put your badge back'}
      >
        <div className="face">{me ? initialsOf(me.penName) : '?'}</div>
        <div>
          <div className="nm">{penNameShown}</div>
          <div className="rl">{adviser ? 'Adviser' : me?.gradeBand ?? 'Chatter crew'}</div>
        </div>
        <span className="who-am-i-caret" aria-hidden="true">▾</span>
      </button>

      {open && adviser && managing
        ? <div className="who-am-i-menu badge-manager-menu"><BadgeManager
          advisers={choices}
          students={students}
          currentAdviserId={me?.id}
          onClose={() => setManaging(false)}
          onRemove={remove}
        /></div>
        : open && <div className="who-am-i-menu" role="menu">
        {adviser ? <>
          <p className="who-am-i-label">Who is the adviser today?</p>
          {choices.map((user) => (
            <button
              key={user.id} role="menuitem"
              className={`who-am-i-option ${user.id === me?.id ? 'on' : ''}`}
              onClick={() => { void onChoose(user.id); setOpen(false); }}
            >
              <span className="face small">{initialsOf(user.penName)}</span>
              <b>{user.penName}</b>
              {user.id === me?.id && <span className="who-am-i-tick">✓</span>}
            </button>
          ))}

          {adding ? <form className="who-am-i-add" onSubmit={(event) => { event.preventDefault(); void add(); }}>
            <input
              autoFocus value={penName} placeholder="Mr. Alvarez"
              aria-label="New adviser name"
              onChange={(event) => { setPenName(event.target.value); setError(undefined); }}
            />
            <button type="submit" disabled={!penName.trim()}>Add</button>
          </form> : <button className="who-am-i-option add" role="menuitem" onClick={() => setAdding(true)}>
            + Add another adviser
          </button>}

          {error && <p className="who-am-i-error" role="alert">{error}</p>}
          <button className="who-am-i-option manage" role="menuitem" onClick={() => { setAdding(false); setManaging(true); }}>
            Manage badges
          </button>
          <button className="who-am-i-option checkout" role="menuitem" onClick={() => { setOpen(false); onHandBack(); }}>
            Check out of adviser desk
          </button>
        </> : <>
          <p className="who-am-i-label">{me ? `Signed in as ${me.penName}` : 'Nobody has picked a badge'}</p>
          <button className="who-am-i-option add" role="menuitem" onClick={() => { setOpen(false); onHandBack(); }}>
            Put my badge back
          </button>
          <p className="who-am-i-foot">The next person picks theirs up off the table. Your work stays where it is.</p>
        </>}
      </div>}
    </div>
  );
}
