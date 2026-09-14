import { useSessionCheckpoint } from '../store/useSessionCheckpoint.js';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  checkCrewTaskStep, claimCrewTask, crewHandoffProgress, CREW_ROLES, finishCrewTask, formatCrewHandoff, JOB_GUIDES, parseCrewHandoff, reopenCrewTask, roleCounts, storyRoomPath,
  type CrewHandoffParts, type CrewRole, type CrewTask, type RoleCount, type Story, type User,
} from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { CrewHandoffReceipt, CrewRelayCard } from './CrewRelayCard.js';
import './Newsroom.css';

type CrewTab = 'MY' | 'JOBS' | 'SKILLS' | 'TEAM';

function roleRoute(role: CrewRole, storyId: string): string {
  return storyRoomPath(JOB_GUIDES[role].room, storyId);
}

function rolesForStory(story: Story): CrewRole[] {
  const roles: CrewRole[] = ['report', 'write', 'edit'];
  if (story.channels.some((channel) => ['pod', 'segment', 'video'].includes(channel))) roles.push('voice', 'produce');
  if (story.channels.some((channel) => ['web', 'social', 'video'].includes(channel))) roles.push('picture');
  return roles;
}

export function Crew({ stories, adviser, me }: { stories: Story[]; adviser: boolean; me?: User }) {
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<CrewTab>(params.get('story') ? 'JOBS' : 'MY');
  const [tasks, setTasks] = useState<CrewTask[]>([]);
  const [counts, setCounts] = useState<RoleCount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roleFilter, setRoleFilter] = useState<CrewRole | 'ALL'>('ALL');
  const [storyFilter, setStoryFilter] = useState(params.get('story') ?? 'ALL');
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [handoff, setHandoff] = useState<CrewHandoffParts>({ finished: '', location: '', next: '' });
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    void Promise.all([store.crewTasks.list(), roleCounts(store), store.users.list()]).then(([nextTasks, nextCounts, nextUsers]) => {
      if (!live) return;
      setTasks(nextTasks); setCounts(nextCounts); setUsers(nextUsers);
    }).catch(() => setNotice({ text: 'The Crew board could not load. Press Refresh to retry.', error: true }));
    return () => { live = false; };
  }, [store, revision]);

  const mine = tasks.filter((task) => task.assigneeId === me?.id);
  const activeMine = mine.filter((task) => task.state !== 'DONE');
  const myCount = counts.find((count) => count.userId === me?.id);
  const explored = CREW_ROLES.filter((role) => (myCount?.roles[role] ?? 0) > 0).length;
  const activeStories = stories.filter((story) => story.status !== 'DONE');
  const selectedTask = activeMine.find((task) => task.id === selectedTaskId) ?? activeMine[0];
  const selectedStory = stories.find((story) => story.id === selectedTask?.storyId);
  const selectedGuide = selectedTask ? JOB_GUIDES[selectedTask.role as CrewRole] : undefined;
  const suggestedRole = [...CREW_ROLES].sort((a, b) => (myCount?.roles[a] ?? 0) - (myCount?.roles[b] ?? 0))[0]!;
  const opportunities = activeStories.flatMap((story) => rolesForStory(story).map((role) => ({ story, role, task: tasks.find((task) => task.storyId === story.id && task.role === role) })))
    .filter(({ story, role }) => (roleFilter === 'ALL' || roleFilter === role) && (storyFilter === 'ALL' || story.id === storyFilter));

  useEffect(() => { setHandoff(parseCrewHandoff(selectedTask?.handoffNote ?? '')); }, [selectedTask?.id, selectedTask?.handoffNote]);
  useSessionCheckpoint(store, async () => {
    if (busy) throw new Error('Wait for the Crew card to save, then retry.');
    if (selectedTask && formatCrewHandoff(handoff) !== (selectedTask.handoffNote ?? '') && crewHandoffProgress(handoff) > 0) {
      await store.crewTasks.update(selectedTask.id, { handoffNote: formatCrewHandoff(handoff) });
    }
  });

  const handoffNote = formatCrewHandoff(handoff);
  const handoffReady = crewHandoffProgress(handoff) === 3;

  async function action(work: () => Promise<unknown>, success?: string) {
    setNotice(undefined); setBusy(true);
    try { await work(); if (success) setNotice({ text: success, error: false }); setRevision((value) => value + 1); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'That action did not finish. Press it again to retry.', error: true }); }
    finally { setBusy(false); }
  }

  async function takeJob(story: Story, role: CrewRole) {
    if (!me) return;
    await action(async () => { const task = await claimCrewTask(store, story.id, role, me.id); setSelectedTaskId(task.id); setTab('MY'); }, `You are the ${JOB_GUIDES[role].title.toLowerCase()} for ${story.title}. Your job brief is ready.`);
  }

  return <section className="view on newsroom-room crew-room">
    <header className="newsroom-hero"><div className="newsroom-hero-icon orange">✦</div><div><div className="newsroom-eyebrow">CREW</div><h1>Assignments</h1><p>Choose a role, complete its checklist, and leave a handoff.</p></div><div className="newsroom-hero-stats"><b>{activeMine.length}<small>active</small></b><b>{explored}/6<small>roles completed</small></b></div></header>
    <div className="newsroom-room-nav">{([['MY', 'My work'], ['JOBS', 'Assignments'], ['SKILLS', 'Work history'], ['TEAM', 'Crew list']] as const).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}{key === 'MY' && <span>{activeMine.length}</span>}</button>)}<button className="newsroom-refresh" onClick={() => { setNotice(undefined); setRevision((value) => value + 1); }}>↻ Refresh</button></div>
    {notice && <div className={`newsroom-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}

    {tab === 'MY' && <>
      <div className="crew-welcome"><div><span className="newsroom-eyebrow">{me?.penName.toUpperCase() ?? 'CREW MEMBER'}</span><h2>{activeMine.length ? 'Active assignments' : 'No active assignments'}</h2><p>{activeMine.length ? 'Open an assignment to see its brief, checklist, room, and handoff.' : 'Choose an open assignment from the board.'}</p></div><button className="newsroom-button primary" onClick={() => setTab('JOBS')}>Assignment board ↗</button></div>
      {activeMine.length ? <div className="crew-workspace"><aside className="crew-task-list">{activeMine.map((task) => { const guide = JOB_GUIDES[task.role as CrewRole]; const itemStory = stories.find((story) => story.id === task.storyId); return <button key={task.id} aria-current={selectedTask?.id === task.id} onClick={() => setSelectedTaskId(task.id)}><span className="crew-role-icon" style={{ background: guide.color }}>{guide.icon}</span><span><small>{guide.title}</small><b>{itemStory?.title ?? 'Untitled story'}</b><em>{task.state === 'NEEDS_HELP' ? 'Hand raised · needs help' : `${task.completedSteps.length}/3 steps finished`}</em></span></button>; })}</aside>
        {selectedTask && selectedGuide && <article className="crew-job-detail"><div className="crew-job-header"><span className="crew-role-icon large" style={{ background: selectedGuide.color }}>{selectedGuide.icon}</span><div><span className="newsroom-eyebrow">YOUR JOB BRIEF</span><h2>{selectedGuide.title} · {selectedStory?.title}</h2><p>{selectedGuide.promise}</p></div></div><button className="newsroom-button dark" onClick={() => navigate(roleRoute(selectedTask.role as CrewRole, selectedTask.storyId))}>Open {selectedGuide.room.slice(1) === 'greenlight' ? 'Green Light' : selectedGuide.room.slice(1)} ↗</button>
          <h3>What done looks like</h3><div className="crew-job-steps">{selectedGuide.steps.map((step, index) => <label key={step.id} className={selectedTask.completedSteps.includes(step.id) ? 'checked' : ''}><input type="checkbox" checked={selectedTask.completedSteps.includes(step.id)} disabled={busy || !me} onChange={(event) => void action(() => checkCrewTaskStep(store, selectedTask.id, step.id, event.target.checked, me!.id))} /><span>{index + 1}</span><div><b>{step.title}</b><p>{step.help}</p></div></label>)}</div>
          {selectedStory && <div className="crew-handoff"><CrewRelayCard role={selectedTask.role as CrewRole} story={selectedStory} value={handoff} onChange={setHandoff} disabled={busy} /><small>Finish the three job steps and all three relay-card parts. The card saves when you press Save, Request help, or Finish.</small><div className="crew-handoff-actions"><button className="newsroom-button" disabled={busy || crewHandoffProgress(handoff) === 0} onClick={() => void action(() => store.crewTasks.update(selectedTask.id, { handoffNote }), 'Relay card saved.')}>Save card</button><button className="newsroom-button" disabled={busy} onClick={() => void action(() => store.crewTasks.update(selectedTask.id, { handoffNote, state: selectedTask.state === 'NEEDS_HELP' ? 'IN_PROGRESS' : 'NEEDS_HELP' }), selectedTask.state === 'NEEDS_HELP' ? 'Help request cleared.' : 'Help requested. The crew can see your relay card.')} >{selectedTask.state === 'NEEDS_HELP' ? 'Clear help request' : 'Request help'}</button><button className="newsroom-button primary" disabled={busy || !selectedGuide.steps.every((step) => selectedTask.completedSteps.includes(step.id)) || !handoffReady || !me} onClick={() => void action(async () => { await store.crewTasks.update(selectedTask.id, { handoffNote }); await finishCrewTask(store, selectedTask.id, me!.id); }, 'Assignment finished. The relay card is waiting for the next crew member.')}>✓ Finish & hand off</button></div></div>}
          {tasks.some((task) => task.storyId === selectedTask.storyId && task.state === 'DONE') && <section className="crew-context"><h3>Relay cards already on this story</h3>{tasks.filter((task) => task.storyId === selectedTask.storyId && task.state === 'DONE').map((task) => <div key={task.id}><b>{JOB_GUIDES[task.role as CrewRole].title} · {users.find((user) => user.id === task.assigneeId)?.penName ?? 'Crew member'}</b><CrewHandoffReceipt note={task.handoffNote} /></div>)}</section>}
        </article>}
      </div> : <div className="crew-start-grid">{CREW_ROLES.map((role) => { const guide = JOB_GUIDES[role]; return <button key={role} onClick={() => { setRoleFilter(role); setTab('JOBS'); }}><span className="crew-role-icon" style={{ background: guide.color }}>{guide.icon}</span><h3>{guide.title}</h3><p>{guide.promise}</p><b>See open jobs →</b></button>; })}</div>}
      <div className="crew-next-skill"><span>✦</span><div><b>Role suggestion</b><p>You have completed less work as a {JOB_GUIDES[suggestedRole].title.toLowerCase()} than in your other roles.</p></div><button className="newsroom-button" onClick={() => { setRoleFilter(suggestedRole); setTab('JOBS'); }}>View {JOB_GUIDES[suggestedRole].title.toLowerCase()} assignments</button></div>
    </>}

    {tab === 'JOBS' && <>
      <div className="crew-board-header"><div><h2>Open assignments</h2><p>Choose a story and role. The assignment includes a brief and three checks.</p></div><label>Role<select aria-label="Filter jobs by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as CrewRole | 'ALL')}><option value="ALL">Every role</option>{CREW_ROLES.map((role) => <option key={role} value={role}>{JOB_GUIDES[role].title}</option>)}</select></label><label>Story<select aria-label="Filter jobs by story" value={storyFilter} onChange={(event) => setStoryFilter(event.target.value)}><option value="ALL">Every story</option>{activeStories.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}</select></label></div>
      <div className="crew-opportunities">{opportunities.map(({ story, role, task }) => {
        const guide = JOB_GUIDES[role]; const owner = users.find((user) => user.id === task?.assigneeId);
        return <article className="crew-opportunity" key={`${story.id}-${role}`}>
          <div><span className="crew-role-icon" style={{ background: guide.color }}>{guide.icon}</span><span className={`newsroom-status ${!task || task.state === 'DONE' ? 'ready' : ''}`}>{task?.state === 'DONE' ? 'Handed off' : task ? task.assigneeId === me?.id ? 'Your job' : 'Claimed' : 'Open'}</span></div>
          <small>{guide.title}</small><h3>{story.title}</h3><p>{guide.promise}</p><ul>{guide.steps.map((step) => <li key={step.id}>{step.title}</li>)}</ul>
          {task?.handoffNote && <blockquote className="crew-board-handoff"><b>{task.state === 'DONE' ? 'Relay card' : 'Working relay card'}</b><CrewHandoffReceipt note={task.handoffNote} /></blockquote>}
          <footer>{task ? <><span>{owner?.penName ?? 'A crew member'}{task.state === 'DONE' ? ' finished this job' : task.state === 'NEEDS_HELP' ? ' needs a hand' : ' is on it'}</span>{task.assigneeId === me?.id && (task.state !== 'DONE' ? <button className="newsroom-button" onClick={() => { setSelectedTaskId(task.id); setTab('MY'); }}>Open my job</button> : <button className="newsroom-button" disabled={busy} onClick={() => void action(async () => { await reopenCrewTask(store, task.id, me!.id); setSelectedTaskId(task.id); setTab('MY'); }, 'Job reopened for another pass. Check the three steps again; your previous handoff is still here.')}>Make another pass</button>)}</> : <button className="newsroom-button primary" disabled={!me || busy} onClick={() => void takeJob(story, role)}>I will do this</button>}</footer>
        </article>;
      })}</div>{!opportunities.length && <div className="newsroom-empty">No jobs match those filters. Try a different role or story.</div>}
    </>}

    {tab === 'SKILLS' && <><div className="crew-board-header"><div><h2>Work history</h2><p>Completed assignments are grouped by production role.</p></div><b className="crew-contribution-count">{myCount?.total ?? 0}<small>completed</small></b></div><div className="crew-passport">{CREW_ROLES.map((role) => { const guide = JOB_GUIDES[role]; const total = myCount?.roles[role] ?? 0; return <article key={role}><span className="crew-role-icon large" style={{ background: guide.color }}>{guide.icon}</span><div><span className="newsroom-status">{total >= 3 ? '3+ completed' : total > 0 ? `${total} completed` : 'None completed'}</span><h3>{guide.title}</h3><p>{guide.promise}</p><div className="crew-stamps">{[1, 2, 3].map((stamp) => <span key={stamp} className={total >= stamp ? 'earned' : ''}>{total >= stamp ? '✓' : stamp}</span>)}<b>{total} assignment{total === 1 ? '' : 's'}</b></div><button className="newsroom-button" onClick={() => { setRoleFilter(role); setTab('JOBS'); }}>View assignments →</button></div></article>; })}</div>{mine.some((task) => task.state === 'DONE') && <section className="crew-recent"><h2>Completed assignments</h2>{mine.filter((task) => task.state === 'DONE').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).map((task) => <div key={task.id}><span>✓</span><b>{JOB_GUIDES[task.role as CrewRole].title}</b><span>{stories.find((story) => story.id === task.storyId)?.title}</span><small>{task.handoffNote || 'Assignment completed'}</small></div>)}</section>}</>}

    {tab === 'TEAM' && <><div className="crew-board-header"><div><h2>Crew assignments</h2><p>See each person’s active role and help requests.</p></div></div><div className="crew-team-grid">{users.filter((user) => user.role === 'STUDENT' && user.active).map((user) => { const activeTasks = tasks.filter((task) => task.assigneeId === user.id && task.state !== 'DONE'); const count = counts.find((item) => item.userId === user.id); return <article key={user.id}><div className="crew-person"><span>{user.penName.split(' ').map((part) => part[0]).join('')}</span><div><h3>{user.penName}</h3><small>{CREW_ROLES.filter((role) => (count?.roles[role] ?? 0) > 0).length} roles completed</small></div></div>{activeTasks.length ? activeTasks.map((task) => <div className={`crew-team-job ${task.state === 'NEEDS_HELP' ? 'help' : ''}`} key={task.id}><b>{task.state === 'NEEDS_HELP' ? '✋ Needs a hand' : JOB_GUIDES[task.role as CrewRole].title}</b><span>{stories.find((story) => story.id === task.storyId)?.title}</span>{task.state === 'NEEDS_HELP' && <small>{task.handoffNote || 'Check in with this teammate.'}</small>}</div>) : <p className="crew-available">Available for the next assignment.</p>}</article>; })}</div></>}

    {adviser && <p className="newsroom-local-note">The contribution report is at the <b>Front Desk</b> now.</p>}
    <p className="newsroom-local-note">A job is not finished until the next person knows what you made, where to find it, and what still needs checking.</p>
  </section>;
}
