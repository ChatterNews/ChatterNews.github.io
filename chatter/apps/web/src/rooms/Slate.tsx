import { RoomIcon } from '../components/RoomIcon.js';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { canPublish, claimStory, createPitch, moveStory, reviewMediaKey, reviewProgress, slateQuery, storyAngleChecks, STORY_CREATION_RECIPES, STORY_TEMPLATES, type CrewTask, type Status, type Story, type StoryCreationRecipeId, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { LookInside } from '../components/LookInside.js';
import { useReilyFocus, useReilyRecovery } from '../components/ReilyContextProvider.js';
import { slateReilyFocus } from '../components/reily-room-focus.js';
import { SlateAngleCheck } from './SlateAngleCheck.js';
import { SlateDossier } from './SlateDossier.js';
import { slateDossierPath } from './slate-navigation.js';
import './Newsroom.css';
import './Slate.css';

export const SLATE_STAGES: { id: Status; label: string; color: string }[] = [
  { id: 'PITCH', label: 'Ideas', color: '#FFD21E' }, { id: 'WORK', label: 'Reporting & writing', color: '#22C7E8' },
  { id: 'BOOTH', label: 'Recording', color: '#FF3D8B' }, { id: 'REVIEW', label: 'In review', color: '#9BE015' },
  { id: 'HELD', label: 'On hold', color: '#FF7A1A' }, { id: 'DONE', label: 'Published', color: '#b6a2d8' },
];
export const STORY_CHANNELS = [['web', 'Article'], ['pod', 'Podcast'], ['social', 'Social'], ['segment', 'News segment'], ['video', 'Video']] as const;
const dueLabel = (story: Story) => story.dueAt ? new Date(story.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No deadline';

export function Slate({ stories, me, onChanged }: { stories: Story[]; me?: User; onChanged: () => void }) {
  const store = useStore(); const navigate = useNavigate(); const params = useParams();
  const [view, setView] = useState<'CARDS' | 'BOARD' | 'TABLE'>('CARDS');
  const [search, setSearch] = useState(''); const [stage, setStage] = useState('ALL'); const [scope, setScope] = useState('ALL');
  const [channel, setChannel] = useState('ALL'); const [sort, setSort] = useState('DUE');
  const [selectedId, setSelectedId] = useState<string>(); const [users, setUsers] = useState<User[]>([]); const [tasks, setTasks] = useState<CrewTask[]>([]);
  const [checks, setChecks] = useState<Record<string, { permission: boolean; reviewed: boolean; notes: number }>>({});
  const [creating, setCreating] = useState(false); const [recipeId, setRecipeId] = useState<StoryCreationRecipeId>('article'); const [template, setTemplate] = useState('news'); const [title, setTitle] = useState(''); const [angle, setAngle] = useState('');
  const [affected, setAffected] = useState(''); const [verification, setVerification] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<{ text: string; error: boolean }>(); const [refresh, setRefresh] = useState(0);
  const beforeLeave = useRef<(() => Promise<boolean>)>();
  useReilyFocus(selectedId || params.storyId ? undefined : slateReilyFocus({ selectedStory: false }));
  useReilyRecovery(notice?.error ? { kind: 'slate.save', workChanged: false } : undefined);
  useEffect(() => {
    let live = true;
    void Promise.all([store.users.list(), store.crewTasks.list(), store.reviews.list(), Promise.all(stories.map(async (story) => ({ story, verdict: await canPublish(store, story.id), mediaKey: await reviewMediaKey(store, story.id) })))])
      .then(([nextUsers, nextTasks, reviews, verdicts]) => {
        if (!live) return;
        setUsers(nextUsers); setTasks(nextTasks);
        setChecks(Object.fromEntries(verdicts.map(({ story, verdict, mediaKey }) => { const review = reviews.find((item) => item.storyId === story.id); const progress = reviewProgress(review, story, mediaKey); return [story.id, { permission: verdict.ok, reviewed: review?.state === 'READY' && progress.ready, notes: progress.openNotes }]; })));
      }).catch(() => { if (live) setNotice({ text: 'The story board could not load. Press Refresh to retry.', error: true }); });
    return () => { live = false; };
  }, [store, stories, refresh]);
  const selected = stories.find((story) => story.id === (params.storyId ?? selectedId));
  const activeTemplate = STORY_TEMPLATES.find((item) => item.id === template) ?? STORY_TEMPLATES[0];
  const activeRecipe = STORY_CREATION_RECIPES.find((item) => item.id === recipeId) ?? STORY_CREATION_RECIPES[0]!;
  const filtered = slateQuery(stories, { search, stage, channel, scope, actor: me?.id, sort });
  const lead = (story: Story) => users.find((user) => user.id === story.ownerId)?.penName ?? 'Needs a lead';
  const overdue = (story: Story) => !!story.dueAt && story.dueAt < Date.now() && story.status !== 'DONE';
  async function act(work: () => Promise<unknown>, success?: string) {
    setBusy(true); setNotice(undefined);
    try { await work(); onChanged(); setRefresh((value) => value + 1); if (success) setNotice({ text: success, error: false }); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'That change did not save. Try the action again.', error: true }); }
    finally { setBusy(false); }
  }
  async function select(id?: string) {
    if (beforeLeave.current && !await beforeLeave.current()) return;
    setSelectedId(id);
    navigate(slateDossierPath(id));
  }
  async function move(story: Story, next: Status) {
    if (!me || busy) return;
    if (beforeLeave.current && !await beforeLeave.current()) return;
    await act(() => moveStory(store, story.id, next, me), `Moved to ${SLATE_STAGES.find((item) => item.id === next)?.label.toLowerCase()}.`);
  }
  function readiness(story: Story) {
    const check = checks[story.id];
    return <div className="slate-readiness"><span className={check?.permission ? 'clear' : ''}>{check ? check.permission ? '✓ Permissions clear' : '! Permission check' : 'Checking permissions…'}</span><span className={check?.reviewed ? 'clear' : ''}>{check?.reviewed ? '✓ Crew reviewed' : check?.notes ? `${check.notes} revision notes` : 'Review not finished'}</span></div>;
  }
  function card(story: Story) {
    const stageInfo = SLATE_STAGES.find((item) => item.id === story.status)!;
    const angleReady = storyAngleChecks(story.brief).filter((item) => item.complete).length;
    return <article key={story.id} className={`slate-story-card ${selected?.id === story.id ? 'selected' : ''}`} draggable={!busy && story.status !== 'DONE'} onDragStart={(event) => event.dataTransfer.setData('text/chatter-story', story.id)}>
      <div className="slate-card-top"><span style={{ background: stageInfo.color }} className="newsroom-status">{stageInfo.label}</span>{story.brief?.priority === 'HIGH' && <b className="slate-priority">Priority</b>}<span className={`slate-angle-chip ${angleReady === 3 ? 'ready' : ''}`}>Angle {angleReady}/3</span></div>
      <button className="slate-story-open" onClick={() => void select(story.id)}><h3>{story.title}</h3><p>{story.brief?.angle || 'Open the project to set its direction and gather what the crew needs.'}</p></button>
      <div className="slate-channels">{story.channels.map((value) => <span key={value}>{STORY_CHANNELS.find(([id]) => id === value)?.[1] ?? value}</span>)}</div>
      {readiness(story)}<footer><span>{lead(story)}</span><b className={overdue(story) ? 'overdue' : ''}>{overdue(story) ? 'Overdue · ' : ''}{dueLabel(story)}</b></footer>
    </article>;
  }
  return <section className="view on newsroom-room slate-room">
    <header className="newsroom-hero"><div className="newsroom-hero-icon"><RoomIcon kind="notebook" /></div><div><div className="newsroom-eyebrow">SLATE</div><h1>Story planning</h1><p>Create a pitch, set the angle, list sources, and assign the work.</p></div><button className="newsroom-button primary" onClick={async () => { if (!beforeLeave.current || await beforeLeave.current()) { setCreating(true); setNotice(undefined); } }}>＋ New story</button></header>
    <div className="newsroom-room-nav">{[['ALL', 'Everything'], ['MINE', 'My stories'], ['UNCLAIMED', 'Needs a lead']].map(([id, label]) => <button key={id} aria-pressed={scope === id} onClick={() => setScope(id!)}>{label}</button>)}<div className="slate-view-toggle" role="group" aria-label="Story board view">{(['CARDS', 'BOARD', 'TABLE'] as const).map((mode) => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode.toLowerCase()}</button>)}</div><button onClick={() => { setNotice(undefined); setRefresh((value) => value + 1); onChanged(); }}>↻ Refresh</button></div>
    {notice && <div role={notice.error ? 'alert' : 'status'} className={`newsroom-notice ${notice.error ? 'error' : ''}`}>{notice.text}</div>}
    <div className="slate-filters"><label>Find a story<input type="search" placeholder="Headline or angle…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Stage<select value={stage} onChange={(event) => setStage(event.target.value)}><option value="ALL">All stages</option>{SLATE_STAGES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>Format<select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="ALL">All formats</option>{STORY_CHANNELS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="DUE">Deadline first</option><option value="PRIORITY">Priority first</option><option value="RECENT">Recently updated</option><option value="TITLE">Headline A–Z</option></select></label><span>{filtered.length} of {stories.length} stories</span></div>
    <div className={`slate-workspace ${selected ? 'has-dossier' : ''}`}><div className="slate-results">
      {view === 'CARDS' && <div className="slate-card-grid">{filtered.map(card)}</div>}
      {view === 'BOARD' && <><p className="slate-board-hint">Drag a card between stages, or open it and use the stage menu. Only Green Light can publish.</p><div className="slate-kanban">{SLATE_STAGES.filter((item) => stage === 'ALL' || stage === item.id).map((item) => <section key={item.id} onDragOver={(event) => { if (item.id !== 'DONE') event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const story = stories.find((row) => row.id === event.dataTransfer.getData('text/chatter-story')); if (story) void move(story, item.id); }}><h2 style={{ borderColor: item.color }}>{item.label}<span>{filtered.filter((story) => story.status === item.id).length}</span></h2>{filtered.filter((story) => story.status === item.id).map(card)}{!filtered.some((story) => story.status === item.id) && <div className="slate-drop-hint">{item.id === 'DONE' ? 'Released work appears here' : 'Drop a story here'}</div>}</section>)}</div></>}
      {view === 'TABLE' && <div className="slate-table-scroll"><table className="tbl"><thead><tr><th>Story</th><th>Lead</th><th>Stage</th><th>Deadline</th><th>Readiness</th></tr></thead><tbody>{filtered.map((story) => <tr key={story.id}><td><button className="slate-table-title" onClick={() => void select(story.id)}>{story.title}</button><small>{story.channels.join(' · ')}</small></td><td>{lead(story)}</td><td>{SLATE_STAGES.find((item) => item.id === story.status)?.label}</td><td className={overdue(story) ? 'overdue' : ''}>{dueLabel(story)}</td><td>{readiness(story)}</td></tr>)}</tbody></table></div>}
      {!filtered.length && <div className="newsroom-empty"><h2>No stories match yet.</h2><p>Try fewer filters, or start with a new pitch.</p><button className="newsroom-button" onClick={() => { setSearch(''); setStage('ALL'); setChannel('ALL'); setScope('ALL'); }}>Clear filters</button></div>}
    </div>{selected && <SlateDossier key={selected.id} story={selected} me={me} users={users} tasks={tasks.filter((task) => task.storyId === selected.id)} busy={busy} beforeLeave={beforeLeave} onClose={() => void select()} onChanged={onChanged} onClaim={() => me && void act(() => claimStory(store, selected.id, me.id), 'You are leading this story. Your reporter job is waiting in Crew.')} />}</div>
    {creating && createPortal(<div className="slate-modal-shade"><form className="slate-pitch-modal" role="dialog" aria-modal="true" aria-labelledby="pitch-title" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setCreating(false); if (event.key === "Tab") { const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)")]; const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }} onSubmit={(event) => { event.preventDefault(); if (!me) return; void act(async () => { const made = await createPitch(store, title, template, me.id, angle, { affected, verification }, recipeId); setCreating(false); setTitle(''); setAngle(''); setAffected(''); setVerification(''); setSelectedId(made.id); navigate(`/slate/${made.id}`); }, 'Pitch saved. The production route and Angle Check are ready.'); }}>
      <div className="slate-dossier-heading"><div><span className="newsroom-eyebrow">ASSIGNMENT DESK</span><h2 id="pitch-title">Find the story inside the topic.</h2><p>Pick the finish line and the reporting job, then give the crew three solid handles.</p></div><button type="button" className="newsroom-button" disabled={busy} onClick={() => setCreating(false)}>Cancel</button></div>
      <section className="slate-recipe-picker" aria-labelledby="slate-recipe-title"><div><small>1 · PICK THE FINISH LINE</small><h3 id="slate-recipe-title">What are you creating?</h3></div><div>{STORY_CREATION_RECIPES.map((recipe) => <button type="button" key={recipe.id} style={{ '--recipe-accent': recipe.accent } as CSSProperties} aria-pressed={recipeId === recipe.id} onClick={() => setRecipeId(recipe.id)}><span>{recipe.mark}</span><b>{recipe.label}</b><small>{recipe.description}</small></button>)}</div><ol aria-label={`${activeRecipe.label} production route`}>{activeRecipe.steps.map((step) => <li key={step.id}>{step.label}</li>)}</ol></section>
      <div className="slate-pitch-workspace">
        <aside className="slate-template-panel"><div><small>2 · PICK THE REPORTING JOB</small><h3>What are you chasing?</h3></div><div className="slate-template-grid">{STORY_TEMPLATES.map((item) => <button type="button" key={item.id} style={{ '--story-accent': item.accent } as CSSProperties} aria-pressed={template === item.id} onClick={() => setTemplate(item.id)}><span className="slate-template-mark">{item.icon}</span><span><em>{item.stamp}</em><b>{item.title}</b><small>{item.description}</small></span></button>)}</div><article className="slate-starter-example" style={{ '--story-accent': activeTemplate.accent } as CSSProperties}><small>EXAMPLE · {activeTemplate.stamp}</small><h4>{activeTemplate.example.headline}</h4><p>{activeTemplate.example.angle}</p></article></aside>
        <div className="slate-pitch-builder"><label className="slate-headline-field"><span>3 · WORKING HEADLINE</span><input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Say what the audience should know" /></label><SlateAngleCheck templateId={template} angle={angle} affected={affected} verification={verification} showExample={false} onChange={(field, value) => { if (field === 'angle') setAngle(value); else if (field === 'affected') setAffected(value); else setVerification(value); }} />{notice?.error && <p role="alert" className="newsroom-notice error">{notice.text}</p>}<div className="slate-pitch-submit"><span>{!angle.trim() ? 'Name what happened before opening the plan.' : `${activeRecipe.label} route: ${activeRecipe.steps.map((step) => step.label).join(' → ')}`}</span><button className="newsroom-button primary" disabled={!me || busy || !title.trim() || !angle.trim()}>{busy ? 'Saving pitch…' : 'Open story plan →'}</button></div></div>
      </div>
    </form></div>, document.body)}
    <p className="newsroom-local-note">A stage tells you where the project is—not whether it is finished. Complete the project notes before the next handoff.</p>
    <LookInside room="Slate" intro="This is the assignment desk. A good plan gives every crew member the same story to chase." rows={[
      { nm: 'Start with a change', sb: <>A topic is broad. An angle names the specific change, result, problem, or question the crew can report.</> },
      { nm: 'Name who feels it', sb: <>Choose the students, families, staff, team, or neighborhood who experience the story firsthand.</> },
      { nm: 'Plan the proof', sb: <>Before reporting begins, name what could confirm the angle: a person, record, observation, photo, or measurement.</> },
      { nm: 'Build the reporting file', sb: <>Questions, source notes, exact quotes, and production needs stay with the story as it moves through the newsroom.</> },
      { nm: 'Hand off with a next move', sb: <>Claim a lead, open Crew jobs, write in Desk, record in Booth, or send the finished work to Green Light.</> },
    ]} />
  </section>;
}
