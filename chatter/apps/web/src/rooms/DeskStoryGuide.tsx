import { DESK_SHAPES, deskShape, type DeskCheck, type DeskShape } from './desk-model.js';

export function DeskRoutePicker({ selected, recommended, onChoose, onRegularWriting, disabled }: {
  selected?: DeskShape;
  recommended: DeskShape;
  onChoose: (shape: DeskShape) => void;
  onRegularWriting: () => void;
  disabled: boolean;
}) {
  const preview = deskShape(selected ?? recommended);
  return <section className="desk-route-picker">
    <header><span className="newsroom-eyebrow">STORY ROUTES</span><h2>Choose the shape</h2><p>Use a template for prompts, or write your own way.</p></header>
    <div className="desk-route-list"><button type="button" disabled={disabled} aria-pressed={!selected} style={{ '--route-accent': '#55aaaa' } as React.CSSProperties} onClick={onRegularWriting}><i aria-hidden="true">Aa</i><span><small>NO TEMPLATE</small><b>Regular writing</b><em>{selected ? 'Drop the template. Keep all your writing.' : 'Write freely, in your own order.'}</em></span></button>{DESK_SHAPES.map((shape) => <button key={shape.id} disabled={disabled} aria-pressed={selected === shape.id} className={recommended === shape.id ? 'recommended' : ''} style={{ '--route-accent': shape.accent } as React.CSSProperties} onClick={() => onChoose(shape.id)}><i>{shape.mark}</i><span><small>{shape.stamp}{recommended === shape.id ? ' · Slate pick' : ''}</small><b>{shape.label}</b><em>{shape.bestFor}</em></span></button>)}</div>
    <article className="desk-route-example" style={{ '--route-accent': preview.accent } as React.CSSProperties}><small>{selected ? 'YOUR ROUTE' : 'OPTIONAL TEMPLATE'} · {preview.stamp}</small><h3>{preview.example.headline}</h3><p>{preview.example.lead}</p><ol>{preview.beats.map((beat) => <li key={beat.id}><b>{beat.label}</b><span>{beat.prompt}</span></li>)}</ol></article>
  </section>;
}

export function DeskStoryCheck({ checks, hasRoute }: { checks: DeskCheck[]; hasRoute: boolean }) {
  const ready = checks.filter((check) => check.complete).length;
  return <section className="desk-story-check">
    <header><div><span className="newsroom-eyebrow">STORY CHECK</span><h2>Can a reader follow it?</h2></div><b aria-label={`${ready} of ${checks.length} story parts in place`} className={ready === checks.length ? 'ready' : ''}>{ready}/{checks.length}<small>in place</small></b></header>
    {!hasRoute && <p className="desk-check-route-note"><b>Regular writing is on.</b> Only the lead and quote can be spotted automatically. Read through the other parts yourself; a template is optional.</p>}
    <div>{checks.map((check) => <article key={check.id} className={check.complete ? 'complete' : ''}><span>{check.complete ? '✓' : '○'}</span><div><b>{check.label}</b><small>{check.complete ? 'In the draft' : check.hint}</small></div></article>)}</div>
    <footer>Read the whole piece aloud once. The check finds structure; your ears find the awkward parts.</footer>
  </section>;
}
