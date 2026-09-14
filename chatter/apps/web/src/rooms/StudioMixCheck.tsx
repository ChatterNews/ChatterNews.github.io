import type { GarageMixCheckItem, GarageTrackKind } from '@chatter/shared';
import type { CSSProperties } from 'react';

const STATUS_LABELS = { PASS: 'Clear', FIX: 'Adjust', CHECK: 'Listen', NOT_NEEDED: 'Not needed' } as const;

export function StudioMixCheck({
  checks, measuring, onMeasure, onFocusTrack, onAddTrack, onClose,
}: {
  checks: GarageMixCheckItem[];
  measuring: boolean;
  onMeasure(): void;
  onFocusTrack(trackId: string): void;
  onAddTrack(kind: GarageTrackKind): void;
  onClose(): void;
}) {
  const fixes = checks.filter((check) => check.status === 'FIX');
  return <section className="studio-mix-check" role="dialog" aria-modal="true" aria-label="Mix Check">
    <header>
      <div><span>MIX CHECK</span><h2>{fixes.length ? `${fixes.length} move${fixes.length === 1 ? '' : 's'} before mixdown` : 'Give it one listening pass'}</h2><p>Headroom, spoken words, and the bottom of the mix.</p></div>
      <button type="button" aria-label="Close Mix Check" onClick={onClose}>×</button>
    </header>
    <div className="studio-mix-check-cards">
      {checks.map((check) => <article key={check.id} className={`mix-check-${check.status.toLowerCase()}`}>
        <div className="mix-check-dial" style={{ '--mix-value': `${Math.round(Math.max(0, Math.min(1, check.meter ?? (check.status === 'PASS' ? .76 : .18))) * 100)}%` } as CSSProperties}><i /></div>
        <div className="mix-check-copy"><small>{STATUS_LABELS[check.status]}</small><b>{check.label}</b><p>{check.detail}</p></div>
        {check.trackId && <button type="button" onClick={() => onFocusTrack(check.trackId!)}>Open track →</button>}
        {!check.trackId && check.suggestedTrackKind && <button type="button" onClick={() => onAddTrack(check.suggestedTrackKind!)}>Add {check.suggestedTrackKind.toLowerCase()} →</button>}
      </article>)}
    </div>
    <footer><span>Mix Check renders the current OpenDAW mix and measures what the WAV will contain.</span><button type="button" className="primary" disabled={measuring} onClick={onMeasure}>{measuring ? 'Listening…' : 'Check the mix again'}</button><button type="button" onClick={onClose}>Back to Studio</button></footer>
  </section>;
}
