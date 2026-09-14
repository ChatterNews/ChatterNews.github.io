import { useSessionCheckpoint } from '../store/useSessionCheckpoint.js';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { advanceStoryWorkflow, countWords, emptyBrief, JOB_GUIDES, newId, resolveStoryCreationRecipe, storyRoomPath, storyWorkflowStepId, type CrewRole, type CrewTask, type Story, type StoryBrief, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useReilyFocus, useReilyRecovery } from '../components/ReilyContextProvider.js';
import { slateReilyFocus } from '../components/reily-room-focus.js';
import { STORY_CHANNELS } from './Slate.js';
import { SlateAngleCheck, type SlateAngleField } from './SlateAngleCheck.js';
import { SlateEvidenceFields } from './SlateEvidenceFields.js';

const dateInput = (timestamp?: number) => timestamp ? new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';

export function SlateDossier({ story, me, users, tasks, busy, beforeLeave, onClose, onChanged, onClaim }: {
  story: Story; me?: User; users: User[]; tasks: CrewTask[]; busy: boolean; beforeLeave: MutableRefObject<(() => Promise<boolean>) | undefined>;
  onClose: () => void; onChanged: () => void; onClaim: () => void;
}) {
  const store = useStore(); const navigate = useNavigate(); const [tab, setTab] = useState<'PLAN' | 'REPORT' | 'PRODUCE'>('PLAN');
  const [title, setTitle] = useState(story.title); const [brief, setBrief] = useState<StoryBrief>(() => structuredClone(story.brief ?? emptyBrief()));
  const [channels, setChannels] = useState(story.channels); const [deadline, setDeadline] = useState(dateInput(story.dueAt));
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const [failed, setFailed] = useState(false);
  const [question, setQuestion] = useState(''); const [taskText, setTaskText] = useState('');
  useReilyFocus(slateReilyFocus({ selectedStory: true, tab, reportArea: 'QUESTIONS' }));
  useReilyRecovery(failed ? { kind: 'slate.save', workChanged: false } : undefined);
  const replayingNavigation = useRef(false);
  const recipe = resolveStoryCreationRecipe(story);
  const currentStepId = storyWorkflowStepId(story);
  const currentStepIndex = recipe.steps.findIndex((step) => step.id === currentStepId);
  const makingSteps = recipe.steps.filter((step) => !['idea', 'report', 'check', 'export', 'out'].includes(step.id));
  const nextMakingStep = makingSteps.find((step) => recipe.steps.indexOf(step) >= currentStepIndex) ?? makingSteps.at(-1);
  const editBrief = (patch: Partial<StoryBrief>) => { setBrief((current) => ({ ...current, ...patch })); setDirty(true); };
  const editAngle = (field: SlateAngleField, value: string) => {
    if (field === 'angle') editBrief({ angle: value });
    else editBrief({ angleCheck: { affected: brief.angleCheck?.affected ?? '', verification: brief.angleCheck?.verification ?? '', [field]: value } });
  };
  async function save(): Promise<boolean> {
    if (!dirty) return true;
    if (saving) return false;
    setSaving(true); setMessage(''); setFailed(false);
    try {
      if (!title.trim()) throw new Error('Your story needs a working headline.');
      const dueAt = deadline ? new Date(`${deadline}T17:00:00`).getTime() : undefined;
      if (dueAt !== undefined && !Number.isFinite(dueAt)) throw new Error('Choose a valid deadline.');
      await store.stories.update(story.id, { title: title.trim(), brief, channels, dueAt });
      setDirty(false); setMessage('Story plan saved.'); onChanged(); return true;
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Your plan did not save. Press Save plan to retry.'); return false; }
    finally { setSaving(false); }
  }
  useSessionCheckpoint(store, async () => {
    if (!await save()) throw new Error('The story plan did not save. Close Story Drive and check the plan.');
  });

  useEffect(() => { beforeLeave.current = save; return () => { beforeLeave.current = undefined; }; });
  useEffect(() => {
    const leaveRoom = (event: MouseEvent) => {
      if (!dirty || replayingNavigation.current) return;
      const button = (event.target as Element).closest<HTMLButtonElement>('nav.tabs button, .track button');
      if (!button) return;
      event.preventDefault(); event.stopPropagation();
      void save().then((ok) => { if (ok) { replayingNavigation.current = true; button.click(); replayingNavigation.current = false; } });
    };
    document.addEventListener('click', leaveRoom, true);
    return () => document.removeEventListener('click', leaveRoom, true);
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const keyboard = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); } };
    window.addEventListener('beforeunload', warn); window.addEventListener('keydown', keyboard);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('keydown', keyboard); };
  });
  const go = async (room: string) => { if (await save()) navigate(room); };
  const openMakingRoom = async () => {
    if (!nextMakingStep || !await save()) return;
    if (currentStepId !== nextMakingStep.id) await advanceStoryWorkflow(store, story.id, nextMakingStep.id);
    onChanged(); navigate(storyRoomPath(nextMakingStep.room, story.id));
  };
  return <aside className="slate-dossier" aria-label="Story plan"><div className="slate-dossier-heading"><div><span className="newsroom-eyebrow">STORY DOSSIER</span><h2>{story.title}</h2><small>{countWords(story.body)} draft words · {story.readTimeSec}s aloud</small></div><button className="newsroom-button" onClick={onClose}>Close</button></div>
    <div className="slate-dossier-tabs">{([['PLAN', 'The brief'], ['REPORT', 'Project notes'], ['PRODUCE', 'Production']] as const).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
    <fieldset className="slate-edit-fields" disabled={saving}>
    {tab === 'PLAN' && <div className="slate-form-fields"><label>Working headline<input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} /></label><SlateAngleCheck templateId={brief.storyType} angle={brief.angle} affected={brief.angleCheck?.affected ?? ''} verification={brief.angleCheck?.verification ?? ''} onChange={editAngle} exampleOpen={false} /><label>Who is this for?<input value={brief.audience} onChange={(event) => editBrief({ audience: event.target.value })} /></label><div className="slate-field-pair"><label>Deadline<input type="date" value={deadline} onInput={(event) => { setDeadline(event.currentTarget.value); setDirty(true); }} onChange={(event) => { setDeadline(event.target.value); setDirty(true); }} /></label><label>Priority<select value={brief.priority} onChange={(event) => editBrief({ priority: event.target.value as StoryBrief['priority'] })}><option value="NORMAL">Normal</option><option value="HIGH">High priority</option></select></label></div><fieldset><legend>Make it for</legend><div className="slate-channel-picker">{STORY_CHANNELS.map(([id, label]) => <label key={id}><input type="checkbox" checked={channels.includes(id)} onChange={(event) => { setChannels(event.target.checked ? [...channels, id] : channels.filter((value) => value !== id)); setDirty(true); }} />{label}</label>)}</div></fieldset><div className="slate-lead"><div><b>{users.find((user) => user.id === story.ownerId)?.penName ?? 'This project needs a lead'}</b><p>{story.ownerId ? 'The lead keeps the material and next steps moving.' : 'Claim it to open your story-builder brief in Crew.'}</p></div>{!story.ownerId && story.status !== 'DONE' && <button className="newsroom-button primary" disabled={!me || busy} onClick={onClaim}>I will lead</button>}</div></div>}
    {tab === 'REPORT' && <div className="slate-form-fields"><h3>Questions worth answering</h3>{brief.questions.map((item) => <div className="slate-check-item" key={item.id}><input aria-label={`Answered: ${item.text}`} type="checkbox" checked={item.answered} onChange={(event) => editBrief({ questions: brief.questions.map((question) => question.id === item.id ? { ...question, answered: event.target.checked } : question) })} /><input aria-label="Reporting question" value={item.text} onChange={(event) => editBrief({ questions: brief.questions.map((question) => question.id === item.id ? { ...question, text: event.target.value } : question) })} /><button aria-label={`Remove question: ${item.text}`} onClick={() => editBrief({ questions: brief.questions.filter((question) => question.id !== item.id) })}>×</button></div>)}<div className="slate-add-line"><input aria-label="New reporting question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What do you still need to find out?" /><button className="newsroom-button" disabled={!question.trim()} onClick={() => { editBrief({ questions: [...brief.questions, { id: newId(), text: question.trim(), answered: false }] }); setQuestion(''); }}>Add</button></div><div className="slate-section-title"><h3>Your sources</h3><button className="newsroom-button" onClick={() => editBrief({ sources: [...brief.sources, { id: newId(), name: '', role: '', reference: '', notes: '', quotes: '', state: 'TO_CONTACT', evidenceType: 'PERSON' }] })}>＋ Source</button></div><p className="slate-help">People, documents, or firsthand observations. Keep private contact information out of shared notes.</p>{!brief.sources.length && <div className="slate-drop-hint">Who knows this firsthand? Add your first source.</div>}{brief.sources.map((source, index) => {
      const update = (patch: Partial<typeof source>) => editBrief({ sources: brief.sources.map((item) => item.id === source.id ? { ...item, ...patch } : item) });
      return <section className="slate-source" key={source.id}><div className="slate-section-title"><h4>Source {index + 1}</h4><select aria-label={`Source ${index + 1} progress`} value={source.state} onChange={(event) => update({ state: event.target.value as typeof source.state })}><option value="TO_CONTACT">To contact / read</option><option value="CONTACTED">Interviewed / read</option><option value="CONFIRMED">Notes checked</option></select></div><SlateEvidenceFields source={source} onChange={update} /><label>Name or document<input value={source.name} onChange={(event) => update({ name: event.target.value })} /></label><label>Why this source knows<input value={source.role} onChange={(event) => update({ role: event.target.value })} /></label><label>Reference / link / recording timestamp<input value={source.reference} onChange={(event) => update({ reference: event.target.value })} /></label><label>Facts & reporting notes<textarea value={source.notes} onChange={(event) => update({ notes: event.target.value })} /></label><label>Exact quotes · copy carefully<textarea value={source.quotes} onChange={(event) => update({ quotes: event.target.value })} placeholder="Keep verbatim quotes separate from your summaries." /></label><button className="slate-text-button" onClick={() => { if (window.confirm('Remove this source and its notes from the plan?')) editBrief({ sources: brief.sources.filter((item) => item.id !== source.id) }); }}>Remove this source</button></section>;
    })}</div>}
    {tab === 'PRODUCE' && <div className="slate-form-fields"><h3>Before the handoff</h3>{brief.checklist.map((item) => <div className="slate-check-item" key={item.id}><input type="checkbox" aria-label={`Done: ${item.text}`} checked={item.done} onChange={(event) => editBrief({ checklist: brief.checklist.map((task) => task.id === item.id ? { ...task, done: event.target.checked } : task) })} /><span>{item.text}</span><button aria-label={`Remove task: ${item.text}`} onClick={() => editBrief({ checklist: brief.checklist.filter((task) => task.id !== item.id) })}>×</button></div>)}<div className="slate-add-line"><input aria-label="New production task" value={taskText} onChange={(event) => setTaskText(event.target.value)} placeholder="Add a shot, sound, or next step…" /><button className="newsroom-button" disabled={!taskText.trim()} onClick={() => { editBrief({ checklist: [...brief.checklist, { id: newId(), text: taskText.trim(), done: false }] }); setTaskText(''); }}>Add</button></div><label>Production notes & handoff<textarea rows={5} value={brief.productionNotes} onChange={(event) => editBrief({ productionNotes: event.target.value })} placeholder="Shot list, sound ideas, pronunciation notes, and what the next person needs." /></label><h3>The people making it</h3>{tasks.length ? tasks.map((task) => <div className="slate-team-job" key={task.id}><b>{JOB_GUIDES[task.role as CrewRole]?.title ?? task.role} · {users.find((user) => user.id === task.assigneeId)?.penName ?? 'Crew member'}</b><span>{task.state === 'DONE' ? 'Handed off' : task.state === 'NEEDS_HELP' ? 'Needs a hand' : 'In progress'}</span>{task.handoffNote && <p>{task.handoffNote}</p>}</div>) : <p className="slate-help">No jobs claimed yet. Invite the crew to take a responsibility.</p>}<button className="newsroom-button" onClick={() => void go(`/crew?story=${story.id}`)}>Find jobs for this story ↗</button></div>}
    </fieldset>
    <div className="slate-save-bar"><span>{dirty ? 'Unsaved changes · ⌘/Ctrl S' : 'Plan saved'}</span><button className="newsroom-button primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Saving…' : 'Save plan'}</button></div>{message && <p role={failed ? 'alert' : 'status'} className={`newsroom-notice ${failed ? 'error' : ''}`}>{message}</p>}
    <div className="slate-next-room"><label>Production route<strong>{recipe.label} · {recipe.steps.map((step) => step.label).join(' → ')}</strong></label><div>{nextMakingStep && !['check', 'export', 'out'].includes(currentStepId) && <button className="newsroom-button primary" disabled={busy || saving} onClick={() => void openMakingRoom()}>{nextMakingStep.action} ↗</button>}{['check', 'export'].includes(currentStepId) && <button className="newsroom-button" onClick={() => void go(storyRoomPath('/greenlight', story.id))}>Open review ↗</button>}</div></div>
  </aside>;
}
