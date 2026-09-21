import { useEffect, useRef, useState } from 'react';
import type { PodcastClip, PodcastProject } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { alignmentPositions, analyzeConversation, conversationFingerprint, type ClipMatch } from '../audio/conversation-analysis.js';

interface Proposal { fingerprint: string; referenceId: string; selectedIds: string; matches: ClipMatch[] }
export function ConversationAssist({ project, selected, busy, onBusy, onCommit, onFlush }: {
  project: PodcastProject; selected: PodcastClip[]; busy: boolean;
  onBusy: (message: string) => void;
  onCommit: (edit: (draft: PodcastProject) => void) => void; onFlush: () => Promise<void>;
}) {
  const store = useStore();
  const [referenceId, setReferenceId] = useState('');
  const [hideReference, setHideReference] = useState(false);
  const [proposal, setProposal] = useState<Proposal>();
  const [notice, setNotice] = useState('');
  const [running, setRunning] = useState(false);
  const [undo, setUndo] = useState<{ projectId: string; clips: Array<Pick<PodcastClip, 'id' | 'startSec' | 'muted'>> }>();
  const controller = useRef<AbortController>();
  const current = useRef(project); current.current = project;
  const reference = selected.find(c => c.id === referenceId);
  const selectionKey = selected.map(c => c.id).sort().join(',');
  const fresh = !!proposal && proposal.fingerprint === conversationFingerprint(project) && proposal.referenceId === referenceId && proposal.selectedIds === selectionKey;
  const ready = fresh ? proposal.matches.filter(m => m.status === 'READY') : [];
  const reductionIds = selected.filter(c => !(hideReference && c.id === referenceId)).map(c => c.id);
  const reductionOn = reductionIds.length > 0 && reductionIds.every(id => project.clips.find(c => c.id === id)?.reduceWhenQuiet);
  useEffect(() => () => controller.current?.abort(), []);

  async function analyze() {
    if (!reference || busy || running || selected.length < 2) return;
    const task = new AbortController(); controller.current = task;
    const snapshot = structuredClone(project); setRunning(true); setNotice(''); setProposal(undefined);
    try {
      const matches = await analyzeConversation(store, reference, selected, task.signal, onBusy);
      if (current.current.id !== snapshot.id || task.signal.aborted) return;
      setProposal({ fingerprint: conversationFingerprint(snapshot), referenceId, selectedIds: selectionKey, matches });
      setNotice('Comparison finished. Review the matches before applying. No recordings have moved.');
    } catch (error) { setNotice(task.signal.aborted ? 'Comparison cancelled. Nothing moved.' : error instanceof Error ? error.message : 'Comparison did not finish.'); }
    finally { controller.current = undefined; onBusy(''); setRunning(false); }
  }
  async function apply() {
    if (!proposal || !fresh || busy || !ready.length) return;
    onBusy('Saving conversation alignment…');
    try {
      // Recheck the media gate at application time, not only when the analysis started.
      const ids = [proposal.referenceId, ...ready.map(m => m.clipId)];
      for (const id of ids) {
        const clip = current.current.clips.find(c => c.id === id);
        const asset = clip && await store.assets.get(clip.assetId);
        if (!asset || asset.gateStatus !== 'APPROVED') throw new Error('An adviser must approve every matched recording before alignment.');
      }
      if (conversationFingerprint(current.current) !== proposal.fingerprint) throw new Error('The episode changed. Compare the recordings again.');
      const positions = alignmentPositions(current.current, proposal.referenceId, ready);
      setUndo({ projectId: project.id, clips: project.clips.filter(c => positions.has(c.id)).map(({ id, startSec, muted }) => ({ id, startSec, muted })) });
      onCommit(draft => {
        for (const clip of draft.clips) {
          const start = positions.get(clip.id); if (start !== undefined) clip.startSec = start;
          if (hideReference && clip.id === referenceId) clip.muted = true;
        }
      });
      await onFlush(); setProposal(undefined);
      setNotice('Alignment saved. Listen near the beginning and end in Mix. Uncertain recordings have not moved.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Saving did not finish. Keep this episode open and retry.'); }
    finally { onBusy(''); }
  }
  return <section className="conversation-assist" aria-label="Conversation assistance">
    <h3>Let the conversation line itself up</h3>
    <p>Select the recordings below, then choose the clearest continuous recording as your reference. Orbit compares shared speech on this device. Use at least 18 seconds; a shared clap still works for shorter clips.</p>
    <label>Reference recording <select aria-label="Reference recording" disabled={busy} value={reference?.id ?? ''} onChange={e => { setReferenceId(e.target.value); setProposal(undefined); }}><option value="">Choose from selected voices…</option>{selected.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
    <label className="conversation-check"><input type="checkbox" checked={hideReference} disabled={busy} onChange={e => setHideReference(e.target.checked)} />Mute reference when applying (only if it is a room backup)</label>
    <div className="recording-tray-actions">
      <button className="newsroom-button primary" disabled={busy || !reference || selected.length < 2} onClick={() => void analyze()}>Find matching speech</button>
      {running && <button className="newsroom-button" onClick={() => controller.current?.abort()}>Cancel comparison</button>}
      <button className="newsroom-button" disabled={busy || !undo || undo.projectId !== project.id} onClick={() => {
        if (!undo || undo.projectId !== project.id) return;
        onCommit(d => { for (const before of undo.clips) { const clip = d.clips.find(c => c.id === before.id); if (clip) { clip.startSec = before.startSec; clip.muted = before.muted; } } });
        setUndo(undefined); setNotice('Previous positions and reference mute restored.');
      }}>Undo automatic alignment</button>
    </div>
    {proposal && <div className="conversation-results">
      {!fresh && <p role="status">The selection or episode changed. Compare again before applying.</p>}
      <ul>{proposal.matches.map(match => <li key={match.clipId}><b>{project.clips.find(c => c.id === match.clipId)?.name ?? 'Recording'} · {match.status === 'READY' ? 'Match found' : 'Needs your check'}</b><p>{match.reason}</p>{match.status === 'READY' && <small>{match.anchors.length} matching sections · sound similarity {Math.round(match.confidence * 100)}% · starts {Math.abs(match.offsetSec).toFixed(2)}s {match.offsetSec < 0 ? 'before' : 'after'} the reference file starts</small>}{Math.abs(match.driftSec) > .08 && <small>Measured timing change: {Math.round(Math.abs(match.driftSec) * 1000)} ms across the matched sections.</small>}</li>)}</ul>
      <button className="newsroom-button primary" disabled={busy || !ready.length} onClick={() => void apply()}>Apply confident matches ({ready.length})</button>
      <p>Only the matching recordings move. Small echoes may remain when two microphones pick up the same speaker. Turn off “Include in mix” for uncertain recordings until checked.</p>
    </div>}
    <details><summary>Help balance the microphones</summary><p>After aligning, gently lower quieter selected microphones by up to 9 dB in the mix. Similar-level voices stay open. This follows sound levels, not speaker identity; listen for soft words and overlapping speech. Source players always play originals.</p>
      <button className="newsroom-button" disabled={busy || reductionIds.length < 2} aria-pressed={reductionOn} onClick={() => onCommit(draft => { draft.voiceReductionBypassed = false; for (const clip of draft.clips) if (reductionIds.includes(clip.id)) clip.reduceWhenQuiet = !reductionOn; })}>{reductionOn ? 'Turn off quieter-mic reduction' : 'Lower quieter microphones'}</button>
      <button className="newsroom-button" disabled={busy || !project.clips.some(c => c.reduceWhenQuiet)} onClick={() => onCommit(d => { d.clips.forEach(c => { c.reduceWhenQuiet = false; }); })}>Turn off for the whole episode</button>
      <p>{project.clips.filter(c => c.reduceWhenQuiet).length} recordings have quieter-mic reduction enabled. Make a fresh listening preview in Mix to compare.</p>
    </details>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
