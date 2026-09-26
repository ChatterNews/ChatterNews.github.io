import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { prosePlainText, type GroupRevision } from '@chatter/shared';
import './GroupCompare.css';

export interface GroupCompareProps {
  revisions: GroupRevision[];
  onInsert: (revision: GroupRevision, selectedText?: string) => void;
  onOpen: (revision: GroupRevision) => void;
  busy?: boolean;
  canInsert?: boolean;
}

function pieceKey(revision: GroupRevision): string {
  return JSON.stringify([revision.groupCode, revision.rootId, revision.contributionId]);
}

/** A descendant is newer even when the two computers' clocks disagree. */
function contributionGroups(revisions: GroupRevision[]) {
  const groups = new Map<string, GroupRevision[]>();
  for (const revision of revisions) {
    const key = pieceKey(revision);
    const versions = groups.get(key) ?? [];
    if (!versions.some(version => version.id === revision.id)) versions.push(revision);
    groups.set(key, versions);
  }
  return Array.from(groups, ([key, versions]) => {
    const parents = new Set(versions.map(version => version.parentRevisionId));
    const heads = versions.filter(version => !parents.has(version.id));
    return { key, versions, heads: heads.length ? heads : versions };
  });
}

function selectedWords(element: HTMLElement | undefined): string | undefined {
  if (!element) return;
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return;
  return selection.toString().trim() || undefined;
}

export function GroupCompare({ revisions, onInsert, onOpen, busy = false, canInsert = true }: GroupCompareProps) {
  const id = useId();
  const groups = useMemo(() => contributionGroups(revisions), [revisions]);
  const [hiddenPieces, setHiddenPieces] = useState<Set<string>>(() => new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [selection, setSelection] = useState<{ id: string; text: string }>();
  const readingAreas = useRef(new Map<string, HTMLDivElement>());
  const selectedGroups = groups.filter(group => !hiddenPieces.has(group.key));
  const visibleRevisions = selectedGroups.flatMap(group => showHistory ? group.versions : group.heads);

  useEffect(() => {
    const updateSelection = () => {
      for (const [revisionId, element] of readingAreas.current) {
        const text = selectedWords(element);
        if (text) { setSelection({ id: revisionId, text }); return; }
      }
      setSelection(undefined);
    };
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, []);

  return <section className="group-compare" aria-labelledby={`${id}-heading`}>
    <header className="group-compare-heading">
      <div><h2 id={`${id}-heading`}>Writing together</h2>
        <p>Read everyone’s words beside the main draft.</p></div>
    </header>
    {groups.length === 0 ? <p className="group-compare-empty">Collect your group’s pieces to read them together here.</p> : <>
      <details className="group-compare-picker">
        <summary>Choose writing <span className="group-compare-count">{selectedGroups.length} of {groups.length} pieces open</span></summary>
        <div className="group-compare-tools">
          <button type="button" onClick={() => setHiddenPieces(new Set())}>Open all pieces</button>
          <button type="button" onClick={() => setHiddenPieces(new Set(groups.map(group => group.key)))}>Clear selection</button>
          <label><input type="checkbox" checked={showHistory} onChange={event => setShowHistory(event.target.checked)} /> Show earlier versions</label>
        </div>
        <div className="group-compare-choices">{groups.map(group => {
          const label = group.heads[0]!;
          return <label key={group.key} className="group-compare-choice">
            <input type="checkbox" checked={!hiddenPieces.has(group.key)} onChange={event => {
              const checked = event.target.checked;
              setHiddenPieces(previous => {
                const next = new Set(previous);
                if (checked) next.delete(group.key); else next.add(group.key);
                return next;
              });
            }} />
            <span><b>{label.title}</b><small>By {label.authorName}{label.kind === 'main' ? ' · Group draft' : ''}</small></span>
          </label>;
        })}</div>
      </details>
      <p className="group-compare-hint">Highlight a passage to add selected words. Each piece scrolls on its own.</p>
      {!canInsert && <p className="group-compare-notice">Open the main draft to add writing. You can still read pieces and open an editable copy.</p>}
      {selectedGroups.some(group => group.heads.length > 1) && <p className="group-compare-notice">Some pieces have two versions to compare. Both are here for you to choose from.</p>}
      {visibleRevisions.length === 0 && <p className="group-compare-empty">Choose a piece above, or open them all.</p>}
      <div className="group-compare-grid">{visibleRevisions.map(revision => {
        const group = selectedGroups.find(candidate => candidate.key === pieceKey(revision))!;
        const earlier = !group.heads.some(head => head.id === revision.id);
        const text = prosePlainText(revision.body);
        return <article className="group-compare-card" key={revision.id} data-revision-id={revision.id} aria-label={`${revision.title} by ${revision.authorName}`}>
          <header><h3>{revision.title}</h3><p>By {revision.authorName}</p>
            <small>{earlier ? 'Earlier version' : group.heads.length > 1 ? 'Version to compare' : 'Latest collected version'}{group.versions.length > 1 ? ` · ${group.versions.length} saved versions` : ''}</small></header>
          <div className="group-compare-text" tabIndex={0} role="region" aria-label={`Writing: ${revision.title} by ${revision.authorName}`}
            ref={element => { if (element) readingAreas.current.set(revision.id, element); else readingAreas.current.delete(revision.id); }}>
            {text || 'There are no written words in this piece yet.'}
          </div>
          <footer>
            <button type="button" disabled={busy || !canInsert || selection?.id !== revision.id}
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                const words = selectedWords(readingAreas.current.get(revision.id));
                if (words) onInsert(revision, words);
              }}>Add selected words</button>
            <button type="button" disabled={busy || !canInsert || !text} onClick={() => onInsert(revision)}>Add whole writing</button>
            <button type="button" disabled={busy} onClick={() => onOpen(revision)}>Open editable copy</button>
          </footer>
        </article>;
      })}</div>
    </>}
  </section>;
}
