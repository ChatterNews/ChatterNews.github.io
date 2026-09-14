import { workspaceStorage } from '../portable/workspace-context.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  completeDeviceSetup, firstRunState, getSettings, newsroomBackup, resetDeviceCheckIn,
  setupAdviser,
  type FirstRunState, type User,
} from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { eraseNewsroomWithPin, IdbStore } from '../store/store-idb.js';
import { seedDemoNewsroom } from '../store/seed.js';
import { BadgeTable } from './BadgeTable.js';
import { AdviserBadgeEntry, type AdviserSetupInput } from './AdviserBadgeEntry.js';
import './NewsroomCheckIn.css';

export function NewsroomCheckInView({
  firstRun, busy = false, notice, onStudent, onAdviser, onDemo, onOpenControls,
}: {
  firstRun: FirstRunState;
  busy?: boolean;
  notice?: { text: string; error: boolean };
  onStudent: () => void;
  onAdviser: () => void;
  onDemo: () => void;
  onOpenControls: () => void;
}) {
  return <main className="checkin-room">
    <div className="checkin-orbits" aria-hidden="true"><i /><i /><i /></div>
    <section className="checkin-counter" aria-labelledby="checkin-title">
      <header className="checkin-console-head">
        <div className="checkin-station-mark" aria-hidden="true"><i>CN</i><span>ON AIR</span></div>
        <div className="checkin-title"><span>Chatter newsroom</span><h1 id="checkin-title">Choose your desk</h1><p>Your badge opens the controls you need.</p></div>
        <div className="checkin-signal" aria-label="Newsroom ready"><span>Signal ready</span><i /><i /><i /><i /><i /></div>
      </header>
      {notice && <div className={`checkin-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
      <div className="checkin-deck">
        <div className="checkin-entrances">
          <button type="button" className="checkin-entrance student" onClick={onStudent}>
            <span className="checkin-device student-kit" aria-hidden="true">
              <svg viewBox="0 0 120 120"><rect x="51" y="15" width="26" height="57" rx="13"/><path d="M42 56v8c0 13 10 23 22 23s22-10 22-23v-8M64 87v17M48 104h32"/><path d="M17 32h25v52H17zM22 42h15M22 52h15M22 62h10"/></svg>
            </span>
            <span><small>Make, report, record</small><b>Student desk</b><em>Pick up your badge and open your story.</em></span>
            <strong><span>Open badge table</span><i aria-hidden="true">↗</i></strong>
          </button>
          <button type="button" className="checkin-entrance adviser" onClick={onAdviser}>
            <span className="checkin-device adviser-console" aria-hidden="true">
              <svg viewBox="0 0 120 120"><path d="M19 22h82v70H19z"/><path d="M30 37l7 7 12-14M30 59l7 7 12-14M58 39h29M58 61h29"/><circle cx="83" cy="82" r="18"/><path d="M75 82l6 6 11-14"/></svg>
            </span>
            <span><small>Review, release, manage</small><b>Adviser desk</b><em>Check work, handle files, and record where it went.</em></span>
            <strong><span>Open staff badges</span><i aria-hidden="true">↗</i></strong>
          </button>
        </div>
        <button type="button" className="checkin-demo" disabled={busy} onClick={onDemo}>
          <span className="demo-monitor" aria-hidden="true"><i>CN</i><b /><b /><b /></span>
          <span><small>Test transmission</small><b>Demo desk</b><em>Practice without changing this newsroom.</em></span>
          <strong>{busy ? 'Opening…' : 'Tune in'} <i aria-hidden="true">▶</i></strong>
        </button>
      </div>
      <footer>
        <span><i aria-hidden="true" />{firstRun === 'LEGACY' ? 'Existing work found. Choose a desk to reconnect it.' : firstRun === 'CONFIGURED' ? 'This newsroom is ready.' : 'New desk. Nothing has been set up yet.'}</span>
        <button type="button" onClick={onOpenControls}>Desk controls</button>
      </footer>
    </section>
  </main>;
}

export function NewsroomDeskControls({
  firstRun, hasPin, pin, confirmReset, confirmErase, busy, onPinChange, onClose, onBackup,
  onAskReset, onCancelReset, onReset, onAskErase, onCancelErase, onErase, onSetUpAdviser,
}: {
  firstRun: FirstRunState;
  hasPin: boolean;
  pin: string;
  confirmReset: boolean;
  confirmErase: boolean;
  busy: boolean;
  onPinChange: (pin: string) => void;
  onClose: () => void;
  onBackup: () => void;
  onAskReset: () => void;
  onCancelReset: () => void;
  onReset: () => void;
  onAskErase: () => void;
  onCancelErase: () => void;
  onErase: () => void;
  onSetUpAdviser: () => void;
}) {
  const resetLocked = busy || (hasPin ? pin.length !== 4 : firstRun === 'EMPTY');
  const eraseLocked = busy || !hasPin || pin.length !== 4;
  const status = hasPin
    ? { tone: 'locked', label: 'Adviser lock active', detail: 'Enter the adviser PIN to change this newsroom.' }
    : firstRun === 'LEGACY'
      ? { tone: 'legacy', label: 'Older newsroom found', detail: 'Your work is here. This desk was made before adviser setup.' }
      : firstRun === 'CONFIGURED'
        ? { tone: 'student', label: 'Student desk ready', detail: 'This newsroom does not have adviser access yet.' }
        : { tone: 'empty', label: 'New newsroom', detail: 'There is nothing to reset or erase yet.' };
  return <div className="desk-controls-shade" role="presentation">
    <section className="desk-controls" role="dialog" aria-modal="true" aria-labelledby="desk-controls-title">
      <header>
        <div className="desk-controls-brand"><span className="desk-controls-dial" aria-hidden="true"><i /><i /><b>CN</b></span><div><span>Newsroom maintenance</span><h2 id="desk-controls-title">Desk controls</h2></div></div>
        <button type="button" aria-label="Close desk controls" onClick={onClose}>×</button>
      </header>
      <div className="desk-controls-body">
        <section className={`desk-status ${status.tone}`} aria-label="Newsroom status">
          <div className="desk-status-lamps" aria-hidden="true"><i /><i /><i /></div>
          <div><span>Current readout</span><h3>{status.label}</h3><p>{status.detail}</p></div>
          <strong>{hasPin ? 'LOCKED' : firstRun === 'LEGACY' ? 'RECOVERY' : firstRun === 'EMPTY' ? 'CLEAR' : 'OPEN'}</strong>
        </section>

        <div className="desk-controls-grid">
          <div className="desk-controls-support">
            <article className="desk-control backup">
              <span className="desk-control-object backup-disk" aria-hidden="true"><i>CN</i><b /></span>
              <div><h3>Save a backup</h3><p>Download the newsroom record before making a big change.</p></div>
              <button type="button" disabled={busy} onClick={onBackup}>Save backup</button>
            </article>

            <section className={`desk-access ${hasPin ? 'has-pin' : 'no-pin'}`}>
              <div className="desk-access-key" aria-hidden="true"><i /><b /></div>
              <div><span>Adviser access</span><h3>{hasPin ? 'PIN required' : 'No PIN on this desk'}</h3></div>
              {hasPin
                ? <label><span>Enter PIN</span><input aria-label="Adviser PIN" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(event) => onPinChange(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" /></label>
                : <><p>{firstRun === 'LEGACY' ? 'Reset is available because it keeps all existing work.' : 'Set up an adviser badge to unlock permanent erase.'}</p><button type="button" onClick={onSetUpAdviser}>Set up adviser access</button></>}
            </section>
          </div>

          <div className="desk-controls-actions">
            <article className={`desk-control reset ${confirmReset ? 'confirming' : ''}`}>
              <span className="desk-control-object reset-knob" aria-hidden="true"><i>↺</i></span>
              <div><span className="desk-action-tag">Keeps all work</span><h3>Reset check-in</h3><p>Keeps every badge, story, and media file. Clears the desk choice and adviser unlock.</p></div>
              {confirmReset
                ? <div className="desk-action-confirm"><b>Return to first-time setup?</b><button type="button" disabled={resetLocked} onClick={onReset}>Yes, reset check-in</button><button type="button" onClick={onCancelReset}>Go back</button></div>
                : <button type="button" disabled={resetLocked} onClick={onAskReset}>Reset check-in</button>}
            </article>

            <article className={`desk-control erase ${confirmErase ? 'confirming' : ''}`}>
              <span className="desk-control-object erase-cover" aria-hidden="true"><i>!</i></span>
              <div><span className="desk-action-tag">Permanent</span><h3>Erase this newsroom</h3><p>Deletes every badge, story, draft, review, and media file in this newsroom.</p></div>
              {confirmErase
                ? <div className="desk-action-confirm"><b>This cannot be undone.</b><button type="button" disabled={eraseLocked} onClick={onErase}>Erase everything</button><button type="button" onClick={onCancelErase}>Keep newsroom</button></div>
                : <button type="button" disabled={eraseLocked} onClick={onAskErase}>Erase this newsroom</button>}
              {!hasPin && <small>Set up adviser access first.</small>}
            </article>
          </div>
        </div>
        <footer><i aria-hidden="true" /> Back up first. Reset keeps the work; erase removes it.</footer>
      </div>
    </section>
  </div>;
}

export function NewsroomCheckIn({
  students, advisers, preferredAdviserId, onStudentPicked, onIdentityChanged,
  onAdviserUnlock, onEnterDemo, demoMode = false,
}: {
  students: User[];
  advisers: User[];
  preferredAdviserId?: string;
  onStudentPicked: (userId: string, room?: string) => Promise<boolean>;
  onIdentityChanged: () => void;
  onAdviserUnlock: (userId: string, pin: string) => Promise<boolean>;
  onEnterDemo: () => void;
  demoMode?: boolean;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<'COUNTER' | 'STUDENT' | 'ADVISER'>('COUNTER');
  const [state, setState] = useState<FirstRunState>('EMPTY');
  const [hasPin, setHasPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [openedStoryId, setOpenedStoryId] = useState<string>();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [controlPin, setControlPin] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const openingDemo = useRef(false);

  useEffect(() => {
    let active = true;
    void Promise.all([firstRunState(store), getSettings(store)]).then(([nextState, settings]) => {
      if (!active) return;
      setState(nextState); setHasPin(!!settings.adviserPin);
    });
    return () => { active = false; };
  }, [store, students.length, advisers.length]);

  useEffect(() => {
    if (!demoMode || openingDemo.current) return;
    openingDemo.current = true;
    let active = true;
    setBusy(true); setNotice(undefined);
    void (async () => {
      try {
        await seedDemoNewsroom(store);
        await completeDeviceSetup(store, 'STUDENT');
        const demoStudent = ((await store.users.list()) as User[]).find((user) => user.role === 'STUDENT' && user.active);
        if (!demoStudent) throw new Error('The demo badge table did not open.');
        onIdentityChanged();
        await onStudentPicked(demoStudent.id, '/');
      } catch (problem) {
        if (active) setNotice({ text: problem instanceof Error ? problem.message : 'The demo newsroom did not open. Return to the live newsroom and try again.', error: true });
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [demoMode, onIdentityChanged, onStudentPicked, store]);

  async function saveBackup() {
    setBusy(true); setNotice(undefined);
    try {
      const backup = await newsroomBackup(store);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `chatter-newsroom-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      URL.revokeObjectURL(url);
      setNotice({ text: 'Newsroom record saved to Downloads.', error: false });
    } catch (problem) {
      setNotice({ text: problem instanceof Error ? problem.message : 'The backup did not save. Press the button to try again.', error: true });
    } finally { setBusy(false); }
  }

  async function resetCheckIn() {
    setBusy(true); setNotice(undefined);
    try {
      await resetDeviceCheckIn(store, controlPin || undefined);
      setState('LEGACY'); setHasPin(false); setControlPin(''); setControlsOpen(false);
      setNotice({ text: 'Check-in reset. Every badge, story, and file is still here.', error: false });
    } catch (problem) {
      setNotice({ text: problem instanceof Error ? problem.message : 'Check-in did not reset. Press the button to try again.', error: true });
    } finally { setBusy(false); }
  }

  async function eraseNewsroom() {
    setBusy(true); setNotice(undefined);
    try {
      if (!(store instanceof IdbStore)) throw new Error('This newsroom cannot be erased from this screen.');
      await eraseNewsroomWithPin(store, controlPin);
      try { workspaceStorage(window.localStorage).removeItem('chatter.preferredAdviser.v1'); } catch { /* optional preference */ }
      window.location.reload();
    } catch (problem) {
      setConfirmErase(false);
      setNotice({ text: problem instanceof Error ? problem.message : 'The newsroom was not erased. Press the button to try again.', error: true });
      setBusy(false);
    }
  }

  async function adviserSetup(input: AdviserSetupInput): Promise<boolean> {
    const adviser = await setupAdviser(store, input);
    onIdentityChanged();
    setHasPin(true);
    const unlocked = await onAdviserUnlock(adviser.id, input.pin);
    if (unlocked) navigate('/frontdesk');
    return unlocked;
  }

  async function adviserUnlock(userId: string, pin: string): Promise<boolean> {
    const unlocked = await onAdviserUnlock(userId, pin);
    if (unlocked) navigate('/frontdesk');
    return unlocked;
  }

  if (screen === 'STUDENT') return <BadgeTable
    onBack={() => setScreen('COUNTER')}
    onStoryOpened={(storyId) => setOpenedStoryId(storyId)}
    onPicked={async (userId, room) => {
      await completeDeviceSetup(store, 'STUDENT');
      await onStudentPicked(userId, room ?? (openedStoryId ? `/?story=${openedStoryId}` : undefined));
    }}
  />;

  if (screen === 'ADVISER') return <main className="checkin-room"><AdviserBadgeEntry
    advisers={advisers}
    hasPin={hasPin}
    preferredAdviserId={preferredAdviserId}
    onBack={() => setScreen('COUNTER')}
    onSetup={adviserSetup}
    onUnlock={adviserUnlock}
  /></main>;

  return <>
    <NewsroomCheckInView
      firstRun={state}
      busy={busy}
      notice={notice}
      onStudent={() => setScreen('STUDENT')}
      onAdviser={() => setScreen('ADVISER')}
      onDemo={onEnterDemo}
      onOpenControls={() => { setConfirmReset(false); setConfirmErase(false); setControlsOpen(true); }}
    />
    {controlsOpen && <NewsroomDeskControls
      firstRun={state}
      hasPin={hasPin}
      pin={controlPin}
      confirmReset={confirmReset}
      confirmErase={confirmErase}
      busy={busy}
      onPinChange={setControlPin}
      onClose={() => { setControlsOpen(false); setConfirmReset(false); setConfirmErase(false); }}
      onBackup={() => void saveBackup()}
      onAskReset={() => { setConfirmErase(false); setConfirmReset(true); }}
      onCancelReset={() => setConfirmReset(false)}
      onReset={() => void resetCheckIn()}
      onAskErase={() => { setConfirmReset(false); setConfirmErase(true); }}
      onCancelErase={() => setConfirmErase(false)}
      onErase={() => void eraseNewsroom()}
      onSetUpAdviser={() => { setControlsOpen(false); setScreen('ADVISER'); }}
    />}
  </>;
}
