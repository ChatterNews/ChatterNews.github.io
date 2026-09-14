import { reflectionProgress, type ReflectionDraft } from '@chatter/shared';

export function RerunsReplayCard({
  editionTitle,
  value,
  onChange,
  onSave,
  onNext,
  nextLabel,
  busy = false,
}: {
  editionTitle: string;
  value: ReflectionDraft;
  onChange: (value: ReflectionDraft) => void;
  onSave: () => void;
  onNext: () => void;
  nextLabel: string;
  busy?: boolean;
}) {
  const ready = reflectionProgress(value);
  const edit = (key: keyof ReflectionDraft, next: string) => onChange({ ...value, [key]: next });
  return <section className="reruns-replay-card">
    <header>
      <div><span className="newsroom-eyebrow">AFTER THE RUN · {editionTitle}</span><h2>Replay notes</h2><p>Talk it through after people have had time to react.</p></div>
      <b aria-label={`${ready} of 3 replay notes ready`} className={ready === 3 ? 'ready' : ''}>{ready}/3 <small>logged</small></b>
    </header>
    <div className="reruns-replay-prompts">
      <label><span><b>01</b> What held up?</span><small>Name one choice that helped people understand or stay interested.</small><textarea rows={4} disabled={busy} value={value.worked} onChange={(event) => edit('worked', event.target.value)} placeholder="The opening question got to the point quickly…" /></label>
      <label><span><b>02</b> What did people notice?</span><small>Write down a question, comment, reaction, or result you actually heard.</small><textarea rows={4} disabled={busy} value={value.audience} onChange={(event) => edit('audience', event.target.value)} placeholder="Three students asked where the numbers came from…" /></label>
      <label><span><b>03</b> What would we change?</span><small>Pick one specific move for the next edition.</small><textarea rows={4} disabled={busy} value={value.change} onChange={(event) => edit('change', event.target.value)} placeholder="Next time, show the process before revealing the result…" /></label>
    </div>
    <footer><p><b>Keep the original.</b> Corrections and new developments belong in the next story.</p><div><button className="newsroom-button" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save replay notes'}</button><button className="newsroom-button primary" disabled={busy} onClick={onNext}>{nextLabel} →</button></div></footer>
  </section>;
}
