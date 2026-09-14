import type { CreativeFinding } from '@chatter/shared';

export function StingerReadyCheck({ findings, onFocus, onRepair, onClose, onContinue }: { findings: CreativeFinding[]; onFocus: (sceneId: string, elementId?: string) => void; onRepair: (finding: CreativeFinding) => void; onClose: () => void; onContinue?: () => void }) {
  const blocking = findings.filter((item) => item.severity === 'BLOCKING');
  return <section className="stinger-ready" aria-label="Broadcast Ready Check">
    <header><div><span>SIGNAL CHECK</span><h2>{blocking.length ? `${blocking.length} fix${blocking.length === 1 ? '' : 'es'} before air` : 'The signal is clear'}</h2><p>Readability, title safe, timing, and competing motion.</p></div><button onClick={onClose} aria-label="Close Ready Check">×</button></header>
    <div>{findings.length === 0 ? <p className="stinger-ready-clear"><b>✓</b> Words are readable, motion has a leader, and key content stays in title safe.</p> : findings.map((finding, index) => <article key={`${finding.code}-${finding.elementId ?? finding.sceneId}-${index}`}><button onClick={() => finding.sceneId && onFocus(finding.sceneId, finding.elementId)}><i>{finding.severity === 'BLOCKING' ? '!' : '★'}</i><span><b>{finding.title}</b><small>{finding.message}</small></span></button>{finding.repair && <button className="stinger-repair" onClick={() => onRepair(finding)}>{finding.repair === 'EXTEND_TIMING' ? 'Give it more time' : 'Move inside safe'}</button>}</article>)}</div>
    {onContinue && <footer><span>The working kit stays editable.</span><button onClick={onContinue}>Export anyway</button></footer>}
  </section>;
}
