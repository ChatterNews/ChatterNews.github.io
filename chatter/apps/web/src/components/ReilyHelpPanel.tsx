import { useEffect, useMemo, useRef, useState } from 'react';
import { eligibleReilyAdvice, type ReilyRoom } from './reily-advice.js';
import { REILY_HELP_TOPICS, recommendReilyHelp, searchReilyHelp } from './reily-help.js';
import type { ReilyHelpContext } from './reily-help-types.js';
import { SPIRAL_ROOMS } from './spiral-navigation.js';

const roomName = (room: string) => room === 'any' ? 'Orbit' : room === 'home' ? 'Clubhouse' : room === 'frontdesk' ? 'Front Desk' : SPIRAL_ROOMS.find(r => r.slug === room)?.name ?? room;
function situationLabel(context: ReilyHelpContext) {
  const s = context.situation;
  if (s?.folderError) return 'The story folder needs attention';
  if (context.recovery || s?.error) return 'Help with the current problem';
  if (s?.recording) return 'Recording is in progress';
  if (s?.busy) return 'A task is in progress';
  if (s?.canEdit === false) return 'This work is view-only for your badge';
  if (s?.selectionCount) return s.selectionCount > 1 ? `${s.selectionCount} items selected` : `${s.selectedKind ? s.selectedKind.toLowerCase().replaceAll('_', ' ') : 'One item'} selected`;
  if (s?.groupKind === 'main') return s.folderConnected ? 'Master story · folder connected' : 'Master story';
  if (s?.groupKind === 'piece') return 'Your contribution to a group story';
  if (s?.projectSelected === false) return 'Let’s open or start your work';
  return `Working in ${roomName(context.room)}`;
}
export default function ReilyHelpPanel({ context, onNavigate, canNavigate = true }: { context: ReilyHelpContext; onNavigate: (room: ReilyRoom) => void; canNavigate?: boolean }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [browse, setBrowse] = useState(false);
  const [craft, setCraft] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [escalate, setEscalate] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (selectedId) heading.current?.focus(); }, [selectedId]);
  const suggested = useMemo(() => recommendReilyHelp(context, 4), [context]);
  const results = useMemo(() => query.trim() ? searchReilyHelp(query, context) : browse
    ? REILY_HELP_TOPICS.filter(topic => topic.room === context.room || topic.room === 'any') : suggested, [query, browse, context, suggested]);
  const selected = REILY_HELP_TOPICS.find(topic => topic.id === selectedId) ?? (query.trim() ? undefined : suggested[0]);
  const tips = useMemo(() => eligibleReilyAdvice(context).filter(t => t.kind !== 'RECOVERY'), [context]);
  const busy = context.situation?.busy || context.situation?.recording;
  function choose(id: string) { setSelectedId(id); setEscalate(false); }
  function reset() { setQuery(''); setSelectedId(undefined); setBrowse(false); setEscalate(false); }
  return <div data-reily-local-help className="reily-practical-help">
    <p className="reily-situation">{situationLabel(context)}</p>
    <label className="reily-search">What are you trying to do?
      <input type="search" value={query} maxLength={160} placeholder="Try “no sound” or “save to USB”" onChange={event => { setQuery(event.target.value); setSelectedId(undefined); setEscalate(false); }} />
    </label>
    <div className="reily-topic-list" aria-label={query.trim() ? 'Matching help' : 'Things Reily can help with'}>
      {results.map(topic => <button type="button" key={topic.id} aria-pressed={selected?.id === topic.id} onClick={() => choose(topic.id)}>
        <span>{topic.title}</span>{topic.room !== context.room && <small>{roomName(topic.room)}</small>}
      </button>)}
    </div>
    {query.trim() && <p className="reily-search-count" role="status">{results.length ? `${results.length} help ${results.length === 1 ? 'guide' : 'guides'} found. Choose the one that fits.` : 'I do not have an exact match. Try a tool or problem, like “text”, “microphone” or “story code”.'}</p>}
    <div className="reily-help-tools">
      {!query.trim() && <button type="button" onClick={() => setBrowse(value => !value)}>{browse ? 'Just the suggested help' : `All help for ${roomName(context.room)}`}</button>}
      {(query || selectedId) && <button type="button" onClick={reset}>Back to help here</button>}
    </div>
    {selected && <article className="reily-instructions" aria-label={selected.title}>
      <h3 ref={heading} tabIndex={-1}>{selected.title}</h3><p>{selected.summary}</p>
      <ol>{selected.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
      {selected.done && <p className="reily-done">{selected.done}</p>}
      {selected.action && <button data-reily-navigation className="reily-go" type="button" disabled={!!busy || !canNavigate} onClick={() => onNavigate(selected.action!.room)}>{selected.action.label}</button>}
      {selected.action && !canNavigate && <p>Finish or cancel this dialog before changing rooms.</p>}
      {selected.action && busy && <p>Finish or stop the current recording or task before changing rooms.</p>}
    </article>}
    <button className="reily-still-stuck" type="button" aria-expanded={escalate} onClick={() => setEscalate(value => !value)}>Still stuck? Get help from an adviser</button>
    {escalate && <div className="reily-escalation"><p>Keep your work open. Show your adviser:</p><ol><li>The app and story you are working on.</li><li>The control you tried and the message you can see.</li><li>What you expected to happen.</li></ol><p>I can explain the tools. Your adviser can help with access, approvals and publishing.</p></div>}
    <details className="reily-craft" open={craft} onToggle={event => setCraft(event.currentTarget.open)}><summary>Help me improve my work</summary>{craft && <><p>{tips[tipIndex % Math.max(1, tips.length)]?.text ?? 'Show your work to someone and ask what they understand first.'}</p><button type="button" onClick={() => setTipIndex(n => n + 1)}>Another tip →</button></>}</details>
  </div>;
}
