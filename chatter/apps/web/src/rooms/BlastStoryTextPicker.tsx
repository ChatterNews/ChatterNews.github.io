import { useEffect, useMemo, useState } from 'react';
import type { BlastStoryPiece, BlastStorySource } from './blast-story-text.js';

type Scope = 'ALL' | 'IN_PROGRESS' | 'PUBLISHED';

export function BlastStoryTextPicker({ sources, onAdd, onClose }: {
  sources: BlastStorySource[];
  onAdd: (piece: BlastStoryPiece, source: BlastStorySource) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('ALL');
  const [selectedId, setSelectedId] = useState(sources[0]?.id);
  const [added, setAdded] = useState<string>();
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sources.filter((source) => (scope === 'ALL' || source.state === scope) && (!term || source.searchText.includes(term)));
  }, [query, scope, sources]);
  const selected = filtered.find((source) => source.id === selectedId) ?? filtered[0];

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  function add(piece: BlastStoryPiece) {
    if (!selected) return;
    onAdd(piece, selected);
    setAdded(piece.id);
    window.setTimeout(() => setAdded((current) => current === piece.id ? undefined : current), 1_200);
  }

  return <div className="blast-story-shade" onPointerDown={onClose}>
    <section className="blast-story-picker" role="dialog" aria-modal="true" aria-labelledby="blast-story-title" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header><div><span>STORY TEXT</span><h2 id="blast-story-title">Add text from a story</h2><p>Choose a current or published story, then add any text you need.</p></div><button aria-label="Close story text" onClick={onClose}>×</button></header>
      <div className="blast-story-search"><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stories, quotes, or details" aria-label="Search story text" /><div role="group" aria-label="Story status">{(['ALL', 'IN_PROGRESS', 'PUBLISHED'] as Scope[]).map((item) => <button key={item} aria-pressed={scope === item} onClick={() => setScope(item)}>{item === 'ALL' ? 'All' : item === 'IN_PROGRESS' ? 'In progress' : 'Published'}</button>)}</div></div>
      <div className="blast-story-browser">
        <aside aria-label="Available stories">{filtered.map((source) => <button key={source.id} aria-current={selected?.id === source.id} onClick={() => { setSelectedId(source.id); setAdded(undefined); }}><span>{source.state === 'PUBLISHED' ? 'Published' : 'In progress'} · {source.channel}</span><b>{source.title}</b><small>{new Date(source.date).toLocaleDateString()}</small></button>)}{!filtered.length && <p>No stories match that search.</p>}</aside>
        <main>{selected ? <><div className="blast-story-piece-head"><div><span>{selected.state === 'PUBLISHED' ? 'ARCHIVE COPY' : 'WORKING STORY'}</span><h3>{selected.title}</h3></div><small>Press Add as many times as you need.</small></div><div className="blast-story-pieces">{selected.pieces.map((piece) => <article key={piece.id}><div><b>{piece.label}</b><p>{piece.text}</p></div><button onClick={() => add(piece)}>{added === piece.id ? '✓ Added' : '+ Add'}</button></article>)}</div></> : <div className="blast-story-empty"><b>Pick a story.</b><span>Its reusable writing will appear here.</span></div>}</main>
      </div>
      <footer><span>Inserted words are copies. Edit them freely for this layout.</span><button onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
