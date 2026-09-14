import type { CreativeFinding } from '@chatter/shared';

export function BlastReadyCheck({ findings, onFocus, onClose, onContinue }: { findings: CreativeFinding[]; onFocus: (pageId: string, elementId?: string) => void; onClose: () => void; onContinue?: () => void }) {
  const blocking = findings.filter((item) => item.severity === 'BLOCKING');
  return <section className="blast-ready" aria-label="Ready Check">
    <header><div><span>PRESS CHECK</span><h2>{blocking.length ? `${blocking.length} thing${blocking.length === 1 ? '' : 's'} before press` : 'Ready for an audience'}</h2><p>{blocking.length ? 'Tap a note and Blast will take you to it.' : findings.length ? 'The important parts are solid. These last notes are optional polish.' : 'The hierarchy, type, and page bounds are holding together.'}</p></div><button onClick={onClose} aria-label="Close Ready Check">×</button></header>
    <div className="blast-ready-list">{findings.length === 0 ? <div className="blast-ready-clear"><b>✓</b><span>Headline clear. Type readable. Everything stays on the page.</span></div> : findings.map((finding, index) => <button key={`${finding.code}-${finding.elementId ?? finding.pageId}-${index}`} onClick={() => finding.pageId && onFocus(finding.pageId, finding.elementId)}><i>{finding.severity === 'BLOCKING' ? '!' : '★'}</i><span><b>{finding.title}</b><small>{finding.message}</small></span><em>{finding.severity === 'BLOCKING' ? 'Fix this' : 'Polish'}</em></button>)}</div>
    {onContinue && <footer><span>Your draft stays yours.</span><button onClick={onContinue}>Export anyway</button></footer>}
  </section>;
}
