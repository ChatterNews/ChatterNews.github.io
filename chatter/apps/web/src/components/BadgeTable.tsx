/**
 * The badge table: how a kid gets into Chatter.
 *
 * SPEC S1 - students need no login, so this is a table of press badges you
 * pick yours up from, not a sign-in screen. A kid who has never been here
 * makes their own badge and walks out of it holding a job.
 *
 * Three screens at most, and the third only for somebody new.
 */
import { useEffect, useState } from 'react';
import {
  SCHOOL_HOURS, studentAccessAllowed, CREW_ROLES, GRADE_BANDS, JOB_GUIDES, MAX_PEN_NAME, badgeTable, createStudent,
  type PressBadge, type CrewRole,
} from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { StoryDriveOpen } from './StoryDriveOpen.js';
import './BadgeTable.css';

/** The three a newcomer can start on alone, without waiting on anyone. */
const STARTER_JOBS: CrewRole[] = ['report', 'write', 'picture'];

export function BadgeTable({ onPicked, onBack, onStoryOpened }: {
  onPicked: (userId: string, room?: string) => void;
  onBack?: () => void;
  onStoryOpened?: (storyId: string) => void;
}) {
  const store = useStore();
  const { gate } = useGate();
  const [badges, setBadges] = useState<PressBadge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<'TABLE' | 'MAKE' | 'JOB'>('TABLE');
  const [penName, setPenName] = useState('');
  const [gradeBand, setGradeBand] = useState<string>('');
  const [madeId, setMadeId] = useState<string>();
  const [error, setError] = useState<string>();
  const [driveMessage, setDriveMessage] = useState<{ text: string; error: boolean }>();
  const [regularHours, setRegularHours] = useState(() => studentAccessAllowed(''));
  useEffect(() => { const timer = window.setInterval(() => setRegularHours(studentAccessAllowed('')), 2000); return () => clearInterval(timer); }, []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void badgeTable(store).then((rows) => { setBadges(rows); setLoaded(true); });
  }, [store, screen]);

  async function makeBadge() {
    setError(undefined); setBusy(true);
    try {
      const user = await createStudent(store, { penName, ...(gradeBand ? { gradeBand } : {}) });
      setMadeId(user.id);
      setScreen('JOB');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work. Try again.');
    } finally { setBusy(false); }
  }

  if (screen === 'MAKE') {
    return <div className="badge-room">
      <div className="badge-sheet">
        <p className="badge-eyebrow">NEW BADGE</p>
        <h1>Create your badge</h1>
        <p className="badge-lede">Choose a <b>pen name</b> for bylines and credits. A first name and one letter works well, such as <b>Maya R.</b> Do not use your full legal name.</p>

        <form onSubmit={(event) => { event.preventDefault(); void makeBadge(); }}>
          <label className="badge-field">
            <span>Pen name</span>
            <input
              autoFocus value={penName} maxLength={MAX_PEN_NAME}
              placeholder="Maya R."
              onChange={(event) => { setPenName(event.target.value); setError(undefined); }}
            />
          </label>

          <fieldset className="badge-grades">
            <legend>Grade <small>(you can skip this)</small></legend>
            <div>
              {GRADE_BANDS.map((band) => (
                <button
                  type="button" key={band}
                  className={`badge-grade ${gradeBand === band ? 'on' : ''}`}
                  aria-pressed={gradeBand === band}
                  onClick={() => setGradeBand(gradeBand === band ? '' : band)}
                >{band}</button>
              ))}
            </div>
          </fieldset>

          {error && <p className="badge-error" role="alert">{error}</p>}

          <div className="badge-actions">
            <button type="button" className="badge-button ghost" onClick={() => { setScreen('TABLE'); setError(undefined); }}>Back to the table</button>
            <button type="submit" className="badge-button" disabled={busy || !penName.trim()}>Make my badge</button>
          </div>
        </form>
      </div>
    </div>;
  }

  if (screen === 'JOB') {
    return <div className="badge-room">
      <div className="badge-sheet">
        <p className="badge-eyebrow">FIRST ASSIGNMENT</p>
        <h1>Choose a role</h1>
        <p className="badge-lede">Each role has its own checklist and workspace. You can choose a different role on the next story.</p>

        <div className="badge-jobs">
          {STARTER_JOBS.map((role) => {
            const guide = JOB_GUIDES[role];
            return <button
              key={role} className="badge-job"
              style={{ '--job-color': guide.color } as React.CSSProperties}
              onClick={() => onPicked(madeId!, guide.room)}
            >
              <span className="badge-job-icon">{guide.icon}</span>
              <b>{guide.title}</b>
              <span className="badge-job-promise">{guide.promise}</span>
              <span className="badge-job-first">First task: {guide.steps[0]!.title}</span>
            </button>;
          })}
        </div>

        <div className="badge-actions">
          <button className="badge-button ghost" onClick={() => onPicked(madeId!, '/crew')}>See all roles</button>
          <button className="badge-button" onClick={() => onPicked(madeId!)}>Go to Clubhouse</button>
        </div>
      </div>
    </div>;
  }

  return <div className="badge-room">
    <div className="badge-sheet wide">
      {onBack && <button type="button" className="checkin-back badge-table-back" onClick={onBack}>← Newsroom Check-In</button>}
      <p className="badge-eyebrow">CHATTER NEWSROOM</p>
      <h1>Choose your badge</h1>
      <p className="badge-lede">Select your name to open your assignments and stories.</p>

      {!loaded
        ? <p className="badge-empty">Getting the table ready…</p>
        : badges.length === 0
        ? <p className="badge-empty">Nobody has a badge yet. Make the first one.</p>
        : <div className="badge-grid">
          {badges.map((badge) => (
            <button key={badge.userId} className="badge-card" onClick={() => onPicked(badge.userId)}>
              <span className="badge-clip" aria-hidden="true" />
              <span className="badge-photo">{badge.initials}</span>
              <b>{badge.penName}</b>
              <small>{badge.gradeBand ?? 'Chatter crew'}</small>
              <span className="badge-jobs-done">
                {badge.isNew ? 'First day' : `${badge.jobsDone} job${badge.jobsDone === 1 ? '' : 's'} done`}
              </span>
            </button>
          ))}
        </div>}

      {driveMessage && <div className={`badge-drive-message ${driveMessage.error ? 'error' : ''}`} role={driveMessage.error ? 'alert' : 'status'}><span>{driveMessage.text}</span><button aria-label="Dismiss message" onClick={() => setDriveMessage(undefined)}>×</button></div>}

      {loaded && <div className="badge-actions center badge-entry-actions">
        <StoryDriveOpen
          store={store}
          gate={gate}
          disabled={!regularHours}
          className="badge-button ghost"
          onMessage={setDriveMessage}
          onOpened={(result) => {
            void badgeTable(store).then(setBadges);
            onStoryOpened?.(result.story.id);
          }}
        />
        <button className="badge-button" onClick={() => { setScreen('MAKE'); setPenName(''); setGradeBand(''); }}>
          I don't have one — make me a badge
        </button>
      </div>}

      {!regularHours && <p className="badge-foot">Student hours: {SCHOOL_HOURS}. If your adviser approved extra days, choose your badge first.</p>}
      <p className="badge-foot">{CREW_ROLES.length} production roles are available in Crew.</p>
    </div>
  </div>;
}
