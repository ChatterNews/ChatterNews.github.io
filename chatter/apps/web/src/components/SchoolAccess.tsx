import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SCHOOL_HOURS, studentAccessAllowed, type Story } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { saveBeforeWebsiteUpdate } from '../portable/website-update.js';
import { ProjectDrive } from './ProjectDrive.js';
import './SchoolAccess.css';

/** Keep mounted drafts/recorders alive until their checkpoint confirms a safe lock. */
export function SchoolAccess({ userId, adviser, stories, onCheckOut, children }: {
  userId: string; adviser: boolean; stories: Story[]; onCheckOut: () => void; children: ReactNode;
}) {
  const store = useStore();
  const [state, setState] = useState<'CHECKING' | 'OPEN' | 'CLOSED' | 'FINISHING'>(adviser ? 'OPEN' : 'CHECKING');
  const [message, setMessage] = useState('');
  const mountedRooms = useRef(false);
  const lastAllowed = useRef(false);
  const rooms = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (adviser) { setState('OPEN'); return; }
    let cancelled = false;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const settings = await store.settings.get();
        if (cancelled) return;
        const allowed = studentAccessAllowed(userId, settings.studentAccessExceptions);
        if (allowed) {
          lastAllowed.current = true;
          setState('OPEN'); setMessage('');
        } else {
          // Never unmount a recorder or a draft just because the clock changed.
          if (lastAllowed.current) {
            setState('CHECKING');
            await saveBeforeWebsiteUpdate(store, () => {});
          }
          if (!cancelled) { lastAllowed.current = false; setState('CLOSED'); setMessage(''); }
        }
      } catch (error) {
        if (!cancelled) {
          setState(lastAllowed.current ? 'FINISHING' : 'CLOSED');
          setMessage(error instanceof Error ? error.message : 'Access could not be checked. Please ask your adviser.');
        }
      } finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 2000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [adviser, store, userId]);
  const closed = state === 'CLOSED' || state === 'CHECKING';
  if (!closed) mountedRooms.current = true;
  useEffect(() => {
    if (rooms.current) rooms.current.inert = closed;
    if (!closed) return;
    window.dispatchEvent(new Event('orbit-school-closed'));
    panel.current?.focus();
    const blockRoomShortcuts = (event: KeyboardEvent) => {
      // Save dialogs are portaled outside the hidden editor and have their own capture handler.
      if ((event.target as Element)?.closest('.project-drive-dialog')) return;
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', blockRoomShortcuts, true);
    return () => window.removeEventListener('keydown', blockRoomShortcuts, true);
  }, [closed]);
  return <>
    {state === 'FINISHING' && <aside className="school-finishing" role="alert"><b>Session time has ended.</b> {message} Finish the current recording or resolve the save, then Orbit will lock automatically.</aside>}
    <div ref={rooms} hidden={closed}>{mountedRooms.current && children}</div>
    {closed && <main className="school-access" ref={panel} tabIndex={-1}>
      <section><span className="checkin-eyebrow">CHATTER NEWSROOM</span>
        <h1>{state === 'CHECKING' ? 'Checking newsroom hours…' : 'See you next session!'}</h1>
        <p>Student hours: <strong>{SCHOOL_HOURS}</strong>.</p>
        <p>Your work stays on this device. An adviser can approve extra days for your badge.</p>
        {message && <p role="alert">{message}</p>}
        {state === 'CLOSED' && <ProjectDrive stories={stories} saveOnly onChanged={() => {}} />}
        <button className="checkin-primary" disabled={state === 'CHECKING'} onClick={onCheckOut}>Back to check-in / Adviser access</button>
      </section>
    </main>}
  </>;
}
