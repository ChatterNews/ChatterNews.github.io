import { storyAngleChecks, STORY_TEMPLATES } from '@chatter/shared';
import type { CSSProperties } from 'react';

export type SlateAngleField = 'angle' | 'affected' | 'verification';

export function SlateAngleCheck({ templateId, angle, affected, verification, onChange, exampleOpen = true, showExample = true }: {
  templateId?: string;
  angle: string;
  affected: string;
  verification: string;
  onChange: (field: SlateAngleField, value: string) => void;
  exampleOpen?: boolean;
  showExample?: boolean;
}) {
  const template = STORY_TEMPLATES.find((item) => item.id === templateId) ?? STORY_TEMPLATES[0];
  const checks = storyAngleChecks({
    angle,
    angleCheck: { affected, verification },
    audience: '', priority: 'NORMAL', questions: [], sources: [], checklist: [], productionNotes: '',
  });
  const ready = checks.filter((item) => item.complete).length;

  return <section className="slate-angle-check" style={{ '--angle-accent': template.accent } as CSSProperties}>
    <header className="slate-angle-head">
      <div><span className="newsroom-eyebrow">PROJECT DIRECTION</span><h3>Give the crew a clear finish line.</h3><p>These three answers keep the words, sound, pictures, and final edit pointed the same way.</p></div>
      <div className="slate-angle-ready" data-ready={ready === checks.length} aria-label={`${ready} of 3 ready`}><b>{ready}</b><span>of 3 ready</span></div>
    </header>

    {showExample && <details className="slate-angle-example" open={exampleOpen}>
      <summary><span>{template.icon}</span><b>See a strong {template.title.toLocaleLowerCase()} example</b><em>{template.stamp}</em></summary>
      <div><h4>{template.example.headline}</h4><p>{template.example.angle}</p><small>Notice the move: one clear focus, a real audience, and useful material the crew can build with.</small></div>
    </details>}

    <div className="slate-angle-fields">
      {checks.map((check, index) => {
        const field: SlateAngleField = check.id === 'changed' ? 'angle' : check.id === 'affected' ? 'affected' : 'verification';
        const placeholder = check.id === 'changed'
          ? 'The idea, moment, question, feeling, or result at the center…'
          : check.id === 'affected'
            ? 'The audience or people at the center…'
            : 'The interview, note, photo, sound, file, observation, or artifact…';
        return <label key={check.id} className={check.complete ? 'complete' : ''}>
          <span className="slate-angle-number">{check.complete ? '✓' : index + 1}</span>
          <span className="slate-angle-label"><b>{check.label}</b><small>{check.prompt}</small></span>
          {check.id === 'changed'
            ? <textarea rows={2} value={check.value} placeholder={placeholder} onChange={(event) => onChange(field, event.target.value)} />
            : <input value={check.value} placeholder={placeholder} onChange={(event) => onChange(field, event.target.value)} />}
        </label>;
      })}
    </div>
    <footer>{ready === checks.length ? <><b>✓ The project direction is clear.</b><span>Next, gather the people and material the crew needs.</span></> : <><b>{checks.find((item) => !item.complete)?.label}</b><span>{checks.find((item) => !item.complete)?.prompt}</span></>}</footer>
  </section>;
}
