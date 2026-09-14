import { SOURCE_KIND_OPTIONS, sourceKind, type EvidenceType, type StorySource } from '@chatter/shared';

export function SlateEvidenceFields({ source, onChange }: { source: StorySource; onChange: (patch: Partial<StorySource>) => void }) {
  const selected = (SOURCE_KIND_OPTIONS.find((option) => option.id === sourceKind(source)) ?? SOURCE_KIND_OPTIONS[0])!;
  return <div className="slate-evidence-fields">
    <label>What kind of source is this?
      <select aria-label="Source type" value={selected.id} onChange={(event) => onChange({ evidenceType: event.target.value as EvidenceType })}>
        {SOURCE_KIND_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
      </select>
    </label>
    <p>{selected.help}</p>
  </div>;
}
