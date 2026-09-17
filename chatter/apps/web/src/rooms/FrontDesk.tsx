import { SchoolAccessSettings } from '../components/SchoolAccessSettings.js';
import { RoomIcon } from '../components/RoomIcon.js';
/**
 * The Front Desk - the adviser's room.
 *
 * One rule shapes all of it: the default view is a to-do list of between zero
 * and five things, and everything else sits below it, collapsed, in the same
 * order every visit. An adviser who opens this on a quiet Tuesday should be
 * able to close it in four seconds.
 *
 * Before this room the adviser's work was three <details> in three rooms, and
 * the two writes the safety model depends on - recording a permission and
 * saying who is identifiable in a picture - did not exist anywhere.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CREW_ROLES, DEFAULT_SETTINGS, JOB_GUIDES, csvField, expireRelease, frontDeskQueue,
  getSettings, gradebookCsv, holdStory, quarantined, recordRelease, refuseRelease,
  newsroomBackup, NewsroomBackupAccessError, roleCounts, runRetention, saveSettings, setAppearance, storyPath,
  type Appearance, type Asset, type Credit, type FrontDeskItem, type LogEvent,
  type NewsroomSettings, type Release, type RetentionResult, type RoleCount,
  type Story, type User,
} from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { QuarantineQueue } from '../components/QuarantineQueue.js';
import { StoryDriveOpen } from '../components/StoryDriveOpen.js';
import './Newsroom.css';
import './FrontDesk.css';

const DAY = 24 * 60 * 60 * 1000;

export function needsFrontDeskStoryDrive(stories: Array<{ id: string }>): boolean {
  return stories.length === 0;
}

export function frontDeskStoryDriveDestination(storyId: string): string {
  return `/greenlight/${storyId}`;
}

/** What a student sees if they wander in. Not a 404, and not a pretend secret. */
function NotYourDesk({ adviserName, stories, me }: { adviserName: string; stories: Story[]; me?: User }) {
  const navigate = useNavigate();
  const live = stories.filter((story) => story.status !== 'DONE');
  // Their own piece first - being sent to somebody else's story is not a nudge.
  const next = live.find((story) => story.ownerId === me?.id || (me && story.bylineIds.includes(me.id)))
    ?? live[0];
  return (
    <section className="view on newsroom-room front-desk-room">
      <div className="newsroom-empty front-desk-closed">
        <h2>This is {adviserName}'s desk.</h2>
        <p>
          {/* The title is quoted: an unquoted one reads as a person, and half
              the newsroom's stories are named after people. */}
          {next
            ? <>Why don't you go work on <b>“{next.title}”</b>?</>
            : <>Why don't you go pitch a story?</>}
        </p>
        <button className="newsroom-button primary" onClick={() => navigate(next ? storyPath(next) : '/slate')}>
          {next ? 'Take me there' : 'Go to the Slate'}
        </button>
      </div>
    </section>
  );
}

export function FrontDesk({ stories, adviser, me, onChanged }: {
  stories: Story[]; adviser: boolean; me?: User; onChanged: () => void;
}) {
  const store = useStore();
  const { gate } = useGate();
  const navigate = useNavigate();

  const [items, setItems] = useState<FrontDeskItem[]>([]);
  const [more, setMore] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [appearances, setAppearances] = useState<Appearance[]>([]);
  const [counts, setCounts] = useState<RoleCount[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const [settings, setSettings] = useState<NewsroomSettings>(DEFAULT_SETTINGS);
  const [log, setLog] = useState<LogEvent[]>([]);
  const [logFilter, setLogFilter] = useState('ALL');
  const [backupPin, setBackupPin] = useState('');
  const [swept, setSwept] = useState<RetentionResult>();
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const decider = useMemo(
    () => ({ actor: me?.id ?? 'adviser', role: 'ADVISER' as const }),
    [me?.id],
  );

  useEffect(() => {
    let live = true;
    void Promise.all([
      frontDeskQueue(store), store.users.list(), store.releases.list(), store.assets.list(),
      store.credits.list(), store.appearances.list(), roleCounts(store), quarantined(store),
      getSettings(store), store.events.all(),
    ]).then(([queue, nextUsers, nextReleases, nextAssets, nextCredits, nextAppearances, nextCounts, nextWaiting, nextSettings, nextLog]) => {
      if (!live) return;
      setItems(queue.items); setMore(queue.more);
      setUsers(nextUsers as User[]); setReleases(nextReleases as Release[]);
      setAssets(nextAssets); setCredits(nextCredits as Credit[]);
      setAppearances(nextAppearances as Appearance[]);
      setCounts(nextCounts); setWaitingCount(nextWaiting.length);
      setSettings(nextSettings);
      setLog(nextLog.slice().reverse());
    }).catch(() => setNotice({ text: 'The Front Desk could not load. Press Refresh to try again.', error: true }));
    return () => { live = false; };
  }, [store, stories, revision]);

  const reload = useCallback(() => { setRevision((value) => value + 1); onChanged(); }, [onChanged]);

  async function action(work: () => Promise<unknown>, success?: string) {
    setNotice(undefined); setBusy(true);
    try {
      await work();
      if (success) setNotice({ text: success, error: false });
      reload();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'That did not finish. Press it again to retry.', error: true });
    } finally { setBusy(false); }
  }

  const adviserName = users.find((user) => user.role === 'ADVISER')?.penName ?? 'the adviser';

  if (!adviser) return <NotYourDesk adviserName={adviserName} stories={stories} me={me} />;

  const studentRoster = users.filter((user) => user.role === 'STUDENT');
  const publishedStories = stories.filter((story) => story.status === 'DONE');

  /** Pictures attached to a story, so the adviser can say who is in them. */
  const storyPictures = credits
    .filter((credit) => credit.storyId)
    .map((credit) => ({ credit, asset: assets.find((asset) => asset.id === credit.assetId) }))
    .filter((row): row is { credit: Credit; asset: Asset } => row.asset?.kind === 'IMAGE');

  function goToItem(item: FrontDeskItem) {
    if (item.route) { navigate(item.route); return; }
    const panel = document.getElementById(`panel-${item.panel}`);
    if (panel instanceof HTMLDetailsElement) {
      panel.open = true;
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const filteredLog = log.filter((event) => logFilter === 'ALL' || event.action.startsWith(logFilter));

  return <section className="view on newsroom-room front-desk-room">
    <header className="newsroom-hero">
      <div className="newsroom-hero-icon"><RoomIcon kind="assignment-dial" /></div>
      <div>
        <div className="newsroom-eyebrow">THE FRONT DESK</div>
        <h1>{items.length === 0 ? 'Nothing needs you right now.' : `${items.length} thing${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} you today.`}</h1>
        <p>Permissions, media checks, and the records you would have to produce later.</p>
      </div>
      <div className="newsroom-hero-stats">
        <b>{waitingCount}<small>media waiting</small></b>
        <b>{studentRoster.filter((user) => {
          const release = releases.find((item) => item.userId === user.id);
          return !(release?.status === 'ON_FILE' && (!release.expiresAt || release.expiresAt > Date.now()));
        }).length}<small>need permission</small></b>
      </div>
    </header>

    <div className="newsroom-room-nav">
      <button className="newsroom-refresh" onClick={() => { setNotice(undefined); setRevision((value) => value + 1); }}>↻ Refresh</button>
    </div>

    {notice && <div className={`newsroom-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}

    {me && <SchoolAccessSettings adviserId={me.id} students={studentRoster} />}

    {needsFrontDeskStoryDrive(stories) && <section className="front-desk-story-drive">
      <div className="front-desk-drive-mark" aria-hidden="true">USB</div>
      <div>
        <div className="newsroom-eyebrow">FIRST STORY ON THIS COMPUTER</div>
        <h2>Open a Story Drive</h2>
        <p>Choose the `.chatter` file from the story's USB. It opens at Green Light with its work and finished files together.</p>
      </div>
      <StoryDriveOpen
        store={store}
        gate={gate}
        className="newsroom-button primary"
        onMessage={setNotice}
        onOpened={(result) => { onChanged(); navigate(frontDeskStoryDriveDestination(result.story.id)); }}
      />
    </section>}

    {/* ---------------------------------------------------------------- Today */}
    <div className="front-desk-today">
      {items.length === 0
        ? <div className="newsroom-empty"><b>You are clear.</b><span>No permissions to chase, no media waiting, nothing blocked.</span></div>
        : items.map((item) => (
          <article className={`front-desk-item kind-${item.kind.toLowerCase()}`} key={item.id}>
            <span className="front-desk-mark" aria-hidden="true">
              {item.kind === 'QUARANTINE' ? '▣' : item.kind === 'BLOCKED' ? '!' : item.kind === 'RELEASE_EXPIRING' ? '⏱' : '✓'}
            </span>
            <div className="front-desk-item-text">
              <b>{item.title}</b>
              <span>{item.detail}</span>
            </div>
            <button className="newsroom-button" onClick={() => goToItem(item)}>{item.actionLabel} →</button>
          </article>
        ))}
      {more > 0 && <p className="front-desk-more">and {more} more below.</p>}
    </div>

    {/* ---------------------------------------------------------- Permissions */}
    <details className="newsroom-adviser front-desk-panel" id="panel-permissions">
      <summary>Permissions <span>{studentRoster.length} students</span></summary>
      <p>A permission slip is the yes from a student's family. Recording one here is what unblocks a piece that has an identifiable kid in it.</p>

      <div className="front-desk-roster">
        {studentRoster.map((user) => {
          const release = releases.find((item) => item.userId === user.id);
          const valid = release?.status === 'ON_FILE' && (!release.expiresAt || release.expiresAt > Date.now());
          const expiresIn = release?.expiresAt ? Math.ceil((release.expiresAt - Date.now()) / DAY) : undefined;
          return <div className="front-desk-roster-row" key={user.id}>
            <div>
              <b>{user.penName}</b>
              <span className={`newsroom-status ${valid ? 'ready' : 'changes'}`}>
                {valid ? 'Permission on file' : release?.status === 'REFUSED' ? 'Family said no' : release?.status === 'EXPIRED' ? 'Ran out' : 'Nothing on file'}
              </span>
              {valid && expiresIn !== undefined && <small>{expiresIn <= 0 ? 'Runs out today' : `${expiresIn} days left`}</small>}
            </div>
            <div className="front-desk-roster-actions">
              <button className="newsroom-button" disabled={busy} onClick={() => void action(
                () => recordRelease(store, user.id, decider, Date.now() + 365 * DAY),
                `${user.penName}'s permission is on file for a year.`,
              )}>Slip on file</button>
              <button className="newsroom-button" disabled={busy} onClick={() => void action(
                () => refuseRelease(store, user.id, decider),
                `Recorded: ${user.penName}'s family said no. That is allowed.`,
              )}>Family said no</button>
              <button className="newsroom-button" disabled={busy || !release || release.status === 'EXPIRED'} onClick={() => void action(
                () => expireRelease(store, user.id, decider),
                `${user.penName}'s permission is retired.`,
              )}>Retire it</button>
            </div>
          </div>;
        })}
      </div>

      <h3 className="front-desk-subhead">Who is in the pictures?</h3>
      <p>Tick a student when you can tell it is them. That is what arms the block — an unticked picture is never checked against a permission.</p>
      {storyPictures.length === 0
        ? <div className="newsroom-empty"><b>No pictures are attached to a story yet.</b></div>
        : <div className="front-desk-pictures">
          {storyPictures.map(({ credit, asset }) => {
            const story = stories.find((item) => item.id === credit.storyId);
            return <div className="front-desk-picture" key={credit.id}>
              <b>{story?.title ?? 'A story'}</b>
              <small>{asset.creator ?? 'Chatter crew'} · {asset.license ?? 'OWN'}</small>
              <div className="front-desk-chips">
                {studentRoster.map((user) => {
                  const marked = appearances.some((item) => item.assetId === asset.id && item.userId === user.id && item.identifiable);
                  return <button
                    key={user.id}
                    className={`front-desk-chip ${marked ? 'on' : ''}`}
                    aria-pressed={marked}
                    disabled={busy}
                    onClick={() => void action(
                      () => setAppearance(store, {
                        assetId: asset.id, userId: user.id, identifiable: !marked,
                        ...(credit.storyId ? { storyId: credit.storyId } : {}),
                      }, decider),
                      marked ? `${user.penName} is no longer marked in that picture.` : `${user.penName} is marked in that picture. It now needs their family's yes.`,
                    )}
                  >{user.penName}</button>;
                })}
              </div>
            </div>;
          })}
        </div>}
    </details>

    {/* ------------------------------------------------------ Media checkpoint */}
    <details className="newsroom-adviser front-desk-panel" id="panel-media">
      <summary>Media checkpoint <span>{waitingCount} waiting</span></summary>
      <p>The checker was not sure about these. Nothing that uses one can publish until you decide.</p>
      {waitingCount === 0
        ? <div className="newsroom-empty"><b>Nothing is waiting.</b><span>Every picture the crew has added is through the checker.</span></div>
        : <QuarantineQueue adviser onChanged={reload} />}
    </details>

    {/* ------------------------------------------------------------------ Crew */}
    <details className="newsroom-adviser front-desk-panel" id="panel-crew">
      <summary>Crew <span>{counts.length} students</span></summary>
      <p>Assessment stays derived from completed work. Nothing here is a grade — it is what each student actually finished.</p>
      <button className="newsroom-button" disabled={busy} onClick={() => void action(async () => {
        const url = URL.createObjectURL(new Blob([await gradebookCsv(store)], { type: 'text/csv' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'chatter-contributions.csv'; link.click();
        URL.revokeObjectURL(url);
      })}>Export contribution CSV</button>
      <div className="crew-report-scroll">
        <table className="front-desk-table">
          <thead><tr><th>Pen name</th>{CREW_ROLES.map((role) => <th key={role}>{JOB_GUIDES[role].title}</th>)}<th>Total</th></tr></thead>
          <tbody>{counts.map((count) => <tr key={count.userId}>
            <td>{count.penName}</td>
            {CREW_ROLES.map((role) => <td key={role}>{count.roles[role] ?? 0}</td>)}
            <td>{count.total}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>

    {/* --------------------------------------------------------------- Records */}
    <details className="newsroom-adviser front-desk-panel" id="panel-records">
      <summary>Records <span>audit log · retention · backup</span></summary>

      <h3 className="front-desk-subhead">Pieces that are out</h3>
      <p>Pulling one back takes it out of public view. The record that it was published stays, because that is the part you may be asked about later.</p>
      {publishedStories.length === 0
        ? <div className="newsroom-empty"><b>Nothing has been published yet.</b></div>
        : <div className="front-desk-published">{publishedStories.map((story) => <div key={story.id}>
          <b>{story.title}</b>
          <button className="newsroom-button" disabled={busy} onClick={() => void action(
            () => holdStory(store, story.id, decider),
            `“${story.title}” is out of public view. The record of it stays.`,
          )}>Pull it back</button>
        </div>)}</div>}

      <h3 className="front-desk-subhead">What the sweep took</h3>
      <p>Raw takes expire after {settings.takeRetentionDays} days. Anything a published piece still needs is spared no matter how old it is.</p>
      {(() => {
        const shown = swept ?? settings.lastSweep;
        if (!shown) return <p className="front-desk-quiet">It runs on its own when the club opens Chatter, at most once a day. Nothing has been swept yet.</p>;
        return <>
          <div className="newsroom-notice">
            Deleted {shown.assetsDeleted} expired {shown.assetsDeleted === 1 ? 'file' : 'files'}. Kept {shown.assetsSpared} that published work still needs.
            {shown.usersPurged > 0 ? ` Cleared ${shown.usersPurged} from last year's roster.` : ''}
          </div>
          {!swept && settings.lastSweep && <p className="front-desk-quiet">Last run {new Date(settings.lastSweep.at).toLocaleString()}.</p>}
        </>;
      })()}
      <button className="newsroom-button" disabled={busy} onClick={() => void action(async () => {
        setSwept(await runRetention(store, { rolloverMonth: settings.rolloverMonth }));
      }, 'Sweep finished.')}>Run the sweep now</button>

      <h3 className="front-desk-subhead">The log</h3>
      <p>Every gate decision, permission, approval and release, in order. This is the record you would produce if somebody asked what happened.</p>
      <div className="front-desk-log-filters" role="group" aria-label="Filter the log">
        {[['ALL', 'Everything'], ['release', 'Permissions'], ['quarantine', 'Media checks'], ['publish', 'Releases'], ['gate', 'The Gate']].map(([value, label]) => (
          <button key={value} aria-pressed={logFilter === value} onClick={() => setLogFilter(value!)}>{label}</button>
        ))}
      </div>
      <div className="front-desk-log">
        {filteredLog.length === 0
          ? <div className="newsroom-empty"><b>Nothing logged in this view yet.</b></div>
          : filteredLog.slice(0, 200).map((event) => <div className="front-desk-log-row" key={event.id}>
            <span className="front-desk-log-when">{new Date(event.wallClock).toLocaleString()}</span>
            <span className="front-desk-log-what">{event.action}</span>
            <span className="front-desk-log-who">{users.find((user) => user.id === event.actor)?.penName ?? event.actor ?? 'the app'}</span>
          </div>)}
      </div>
      {filteredLog.length > 200 && <p className="front-desk-quiet">Showing the most recent 200 of {filteredLog.length}.</p>}
      <button className="newsroom-button" onClick={() => {
        const rows = [['when', 'what', 'who', 'target'], ...filteredLog.map((event) => [
          new Date(event.wallClock).toISOString(), event.action,
          users.find((user) => user.id === event.actor)?.penName ?? event.actor ?? '', event.target,
        ])];
        const csv = rows.map((row) => row.map((cell) => csvField(String(cell))).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'chatter-log.csv'; link.click();
        URL.revokeObjectURL(url);
      }}>Export the log</button>

      <h3 className="front-desk-subhead">Back the newsroom up</h3>
      <p>One file with every story, permission, credit and log line on this computer. Recordings and pictures stay here — a story's own <b>.chatter</b> package is how media travels.</p>
      {settings.adviserPin
        ? <label>Adviser PIN for backup <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={backupPin} onChange={(event) => setBackupPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
        : <p>Set up adviser access and a PIN before saving a whole-newsroom backup.</p>}
      <button className="newsroom-button" disabled={busy || !settings.adviserPin || backupPin.length !== 4} onClick={() => void action(async () => {
        try {
          const backup = await newsroomBackup(store, backupPin);
          const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = `chatter-newsroom-${new Date().toISOString().slice(0, 10)}.json`;
          link.click();
          URL.revokeObjectURL(url);
        } catch (problem) {
          throw problem instanceof NewsroomBackupAccessError ? problem : new Error('The backup did not save. Try again.');
        } finally { setBackupPin(''); }
      }, 'Backup saved to your downloads.')}>Save a backup</button>
    </details>

    {/* -------------------------------------------------------------- Settings */}
    <details className="newsroom-adviser front-desk-panel" id="panel-settings">
      <summary>Newsroom settings <span>retention · school year · PIN</span></summary>
      <div className="front-desk-settings">
        <label>
          <b>Show name</b>
          <input defaultValue={settings.showName} onBlur={(event) => void action(
            () => saveSettings(store, { showName: event.target.value }, decider), 'Saved.',
          )} />
        </label>
        <label>
          <b>Raw takes live for</b>
          <span>Days before a recording nobody published expires. Published work is never swept.</span>
          <input type="number" min={1} defaultValue={settings.takeRetentionDays} onBlur={(event) => void action(
            () => saveSettings(store, { takeRetentionDays: Number(event.target.value) }, decider), 'Saved.',
          )} />
        </label>
        <label>
          <b>School year starts in</b>
          <select defaultValue={settings.rolloverMonth} onChange={(event) => void action(
            () => saveSettings(store, { rolloverMonth: Number(event.target.value) }, decider), 'Saved.',
          )}>
            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
              .map((month, index) => <option key={month} value={index}>{month}</option>)}
          </select>
        </label>
        <label>
          <b>Front Desk PIN</b>
          <span>Four digits, or empty for none. It keeps the room out of the way during class. It is not a lock — anyone who knows the number can open it, and it only applies on this computer.</span>
          <input inputMode="numeric" maxLength={4} defaultValue={settings.adviserPin} onBlur={(event) => void action(
            () => saveSettings(store, { adviserPin: event.target.value }, decider),
            event.target.value ? 'PIN set on this computer.' : 'PIN cleared.',
          )} />
        </label>
      </div>
    </details>

    <p className="newsroom-local-note">
      Everything here happens on this computer. The seat toggle is not a lock — what makes it answerable is that every decision above is written to the log with your name on it.
    </p>
  </section>;
}
