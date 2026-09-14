import {
  crewHandoffProgress,
  crewHandoffSpecimen,
  JOB_GUIDES,
  parseCrewHandoff,
  type CrewHandoffParts,
  type CrewHandoffStory,
  type CrewRole,
} from '@chatter/shared';
import type { CSSProperties } from 'react';

export function CrewRelayCard({
  role, story, value, onChange, disabled = false,
}: {
  role: CrewRole;
  story: CrewHandoffStory;
  value: CrewHandoffParts;
  onChange: (value: CrewHandoffParts) => void;
  disabled?: boolean;
}) {
  const guide = JOB_GUIDES[role];
  const specimen = crewHandoffSpecimen(role, story);
  const ready = crewHandoffProgress(value);
  const edit = (key: keyof CrewHandoffParts, next: string) => onChange({ ...value, [key]: next });

  return <section className="crew-relay-card">
    <header>
      <div><span className="newsroom-eyebrow">PASS IT ON</span><h3>Relay card</h3></div>
      <b aria-label={`${ready} of 3 handoff parts ready`} className={ready === 3 ? 'ready' : ''}>{ready}/3 <small>{ready === 3 ? 'Ready to relay' : 'parts ready'}</small></b>
    </header>
    <div className="crew-relay-layout">
      <aside className="crew-relay-specimen" style={{ '--specimen-color': guide.color } as CSSProperties}>
        <span>A strong {guide.title.toLowerCase()} handoff</span>
        <dl>
          <div><dt>Finished</dt><dd>{specimen.finished}</dd></div>
          <div><dt>Find it</dt><dd>{specimen.location}</dd></div>
          <div><dt>Check next</dt><dd>{specimen.next}</dd></div>
        </dl>
        <small>Use the shape of this example. Write what is true about your work.</small>
      </aside>
      <div className="crew-relay-fields">
        <label><span><b>1</b> What I finished</span><textarea rows={2} disabled={disabled} value={value.finished} onChange={(event) => edit('finished', event.target.value)} placeholder={specimen.finished} /></label>
        <label><span><b>2</b> Where to find it</span><input disabled={disabled} value={value.location} onChange={(event) => edit('location', event.target.value)} placeholder={specimen.location} /></label>
        <label><span><b>3</b> What to check next</span><textarea rows={2} disabled={disabled} value={value.next} onChange={(event) => edit('next', event.target.value)} placeholder={specimen.next} /></label>
      </div>
    </div>
  </section>;
}

export function CrewHandoffReceipt({ note }: { note: string }) {
  const parts = parseCrewHandoff(note);
  return <div className="crew-handoff-receipt">
    {parts.finished && <p><b>Finished</b><span>{parts.finished}</span></p>}
    {parts.location && <p><b>Find it</b><span>{parts.location}</span></p>}
    {parts.next && <p><b>Check next</b><span>{parts.next}</span></p>}
  </div>;
}
