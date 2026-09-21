import { useEffect, useRef, useState } from 'react';
import { JobQueue, releaseFromQuarantine, type Asset, type PodcastClip, type PodcastProject, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { alignConversation, importPhoneRecording, packContributions } from '../audio/podcast-assembly.js';
import './ChatterboxRecordingTray.css';
import { ConversationAssist } from './ConversationAssist.js';

export function ChatterboxRecordingTray({ project, me, assets, approvedUrls, busy, onBusy, onCommit, onFlush, onReload }: {
  project: PodcastProject; me?: User; assets: Asset[]; approvedUrls: Map<string, string>; busy: boolean;
  onBusy: (message: string) => void; onCommit: (edit: (draft: PodcastProject) => void) => void;
  onFlush: () => Promise<void>; onReload: () => Promise<unknown>;
}) {
  const store = useStore(); const { gate } = useGate();
  const [mode, setMode] = useState<'SEQUENCE' | 'CONVERSATION'>('SEQUENCE');
  const [selected, setSelected] = useState<string[]>([]);
  const [gap, setGap] = useState(.25);
  const [messages, setMessages] = useState<string[]>([]);
  const [reviewId, setReviewId] = useState<string>();
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [undo, setUndo] = useState<PodcastClip[]>();
  const picker = useRef<HTMLInputElement>(null);
  const importing = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = useRef(project); current.current = project;
  const adviser = me?.role === 'ADVISER' || me?.role === 'ADMIN';
  const voiceIds = new Set(project.tracks.filter(t => t.kind === 'VOICE').map(t => t.id));
  const clips = project.clips.filter(c => voiceIds.has(c.trackId));
  const chosen = selected.map(id => clips.find(c => c.id === id)).filter((c): c is PodcastClip => !!c);
  const timelineOrder = [...clips].sort((a, b) => a.startSec - b.startSec);
  const orderedClips = mode === 'SEQUENCE' ? [...chosen, ...timelineOrder.filter(c => !selected.includes(c.id))] : clips;
  useEffect(() => {
    let active = true; const made: string[] = [];
    void (async () => {
      const next = new Map<string, string>();
      for (const id of reviewId ? [reviewId] : []) {
        const asset = assets.find(a => a.id === id);
        if (!asset || !adviser || asset.gateStatus !== 'QUARANTINED') continue;
        const bytes = await store.blobs.get(asset.sha256); if (!bytes || !active) continue;
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: asset.mime })); made.push(url); next.set(id, url);
      }
      if (active) setUrls(next);
    })().catch(() => { if (active) setMessages(['A recording could not load. Reopen this episode to retry.']); });
    return () => { active = false; made.forEach(URL.revokeObjectURL); };
  }, [store, assets, adviser, project.id, reviewId]);

  async function bring(files: File[]) {
    if (busy || importing.current || !files.length) return;
    if (files.length > 30) { setMessages(['Bring in up to 30 recordings at a time.']); return; }
    importing.current = true; setMessages([]); setUndo(undefined);
    const notes: string[] = []; const added: string[] = [];
    let working = structuredClone(current.current);
    for (const [index, file] of files.entries()) {
      if (!active.current) break;
      onBusy(`Reading recording ${index + 1} of ${files.length}…`);
      try {
        const result = await importPhoneRecording({ store, gate, file, project: working, mode, actor: me?.id });
        if (current.current.id !== working.id) throw new Error('The episode changed. Reopen the original episode before retrying.');
        if (result.track) working.tracks.push(result.track);
        working.clips.push(result.clip);
        onCommit(draft => { if (result.track) draft.tracks.push(result.track); draft.clips.push(result.clip); });
        // Make each successful import durable before accepting another file.
        await onFlush(); added.push(result.clip.id);
        notes.push(`${file.name}: ${result.status === 'APPROVED' ? 'ready' : 'saved — adviser review needed'}.`);
      } catch (error) { notes.push(`${file.name}: ${error instanceof Error ? error.message : 'Could not import; try this file again.'}`); }
    }
    try { await onReload(); } catch { notes.push('Recordings were saved, but the list could not refresh. Reopen this episode.'); } finally {
      importing.current = false; onBusy(''); setSelected(added); setMessages(notes);
      if (picker.current) picker.current.value = '';
    }
  }
  async function approve(clip: PodcastClip) {
    if (!adviser || !me || busy) return;
    onBusy('Approving recording…');
    try {
      await releaseFromQuarantine(store, clip.assetId, { actor: me.id, role: me.role as 'ADVISER' | 'ADMIN' });
      await onReload();
      try {
        await new JobQueue(store).enqueue('transcribe', { assetId: clip.assetId });
        setMessages([`${clip.name} is approved and ready to use.`]);
      } catch { setMessages([`${clip.name} is approved. The transcript could not be queued; you can still use the recording.`]); }
    } catch (e) { setMessages([e instanceof Error ? e.message : 'Approval did not finish.']); }
    finally { onBusy(''); }
  }
  function arrange() {
    try {
      if (!chosen.length) throw new Error('Select recordings in the order you want them.');
      if (chosen.some(c => assets.find(a => a.id === c.assetId)?.gateStatus !== 'APPROVED')) throw new Error('Ask an adviser to approve the selected recordings first.');
      const changed = mode === 'SEQUENCE' ? packContributions(chosen, gap) : alignConversation(chosen);
      setUndo(structuredClone(project.clips));
      onCommit(draft => { for (const clip of changed) { const at = draft.clips.findIndex(c => c.id === clip.id); draft.clips[at] = clip; } });
      setMessages([mode === 'SEQUENCE' ? 'Selected voices are lined up in your chosen order.' : 'Shared cues are aligned. Listen near the start and end to check for drift.']);
    } catch (e) { setMessages([e instanceof Error ? e.message : 'Choose the recordings again.']); }
  }
  return <section id="phone-recordings" className="recording-tray" aria-labelledby="recording-tray-title" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void bring(Array.from(e.dataTransfer.files)); }}>
    <header><div><span className="newsroom-eyebrow">PHONE RECORDINGS</span><h2 id="recording-tray-title">Everyone’s voice, one episode</h2></div><button className="newsroom-button primary" disabled={busy} onClick={() => picker.current?.click()}>Add recordings</button></header>
    <p>In Voice Memos, share a rendered M4A to Files, then collect the recordings on this device. Choose several files at once or drop them here. Nothing is uploaded by Orbit.</p>
    <input ref={picker} aria-label="Import phone recordings" type="file" hidden multiple accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.flac,.webm" onChange={e => void bring(Array.from(e.target.files ?? []))} />
    <fieldset disabled={busy}><legend>What are we assembling?</legend><label><input type="radio" name="phone-mode" checked={mode === 'SEQUENCE'} onChange={() => setMode('SEQUENCE')} />Separate contributions</label><label><input type="radio" name="phone-mode" checked={mode === 'CONVERSATION'} onChange={() => setMode('CONVERSATION')} />Same conversation, several phones</label></fieldset>
    <p>{mode === 'SEQUENCE' ? 'Select voices in speaking order. Earlier / Later changes the order; snap adds a small breathing gap.' : 'Start every phone, then clap once together. In each player, pause at that same clap or spoken word and mark it. Each imported phone gets its own track. Alignment fixes the start offset, not clock drift or microphone bleed.'}</p>
    <div className="recording-tray-actions"><button className="newsroom-button" disabled={busy || !clips.length} onClick={() => setSelected(timelineOrder.map(c => c.id))}>Select all voices</button><button className="newsroom-button" disabled={busy} onClick={() => setSelected([])}>Clear selection</button>{mode === 'SEQUENCE' && <label>Gap between voices <select value={gap} disabled={busy} onChange={e => setGap(Number(e.target.value))}><option value={0}>None</option><option value={.25}>¼ second</option><option value={.5}>½ second</option><option value={1}>1 second</option></select></label>}<button className="newsroom-button" disabled={busy || !chosen.length} onClick={arrange}>{mode === 'SEQUENCE' ? 'Snap selected voices together' : 'Align shared cues'}</button><button className="newsroom-button" disabled={busy || !undo} onClick={() => { if (undo) { onCommit(d => { for (const old of undo) { const clip = d.clips.find(c => c.id === old.id); if (clip) clip.startSec = old.startSec; } }); setUndo(undefined); } }}>Undo arrangement</button></div>
    {mode === 'CONVERSATION' && <ConversationAssist key={project.id} project={project} selected={chosen} busy={busy} onBusy={onBusy} onCommit={onCommit} onFlush={onFlush} />}
    <ol className="recording-tray-list">{orderedClips.map(clip => <RecordingRow key={clip.id} clip={clip} url={approvedUrls.get(clip.assetId) ?? urls.get(clip.assetId)} onReview={() => setReviewId(clip.assetId)} status={assets.find(a => a.id === clip.assetId)?.gateStatus ?? 'MISSING'} adviser={adviser} busy={busy} mode={mode} order={selected.indexOf(clip.id)} onSelect={() => setSelected(ids => ids.includes(clip.id) ? ids.filter(id => id !== clip.id) : [...ids, clip.id])} onMove={delta => setSelected(ids => { const next = [...ids]; const from = next.indexOf(clip.id); const to = from + delta; if (from >= 0 && to >= 0 && to < next.length) [next[from], next[to]] = [next[to]!, next[from]!]; return next; })} onUpdate={patch => onCommit(d => { Object.assign(d.clips.find(c => c.id === clip.id)!, patch); })} onApprove={() => void approve(clip)} />)}</ol>
    {messages.length > 0 && <ul className="recording-tray-notices" role="status">{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>}
  </section>;
}
function RecordingRow({ clip, url, status, adviser, busy, mode, order, onSelect, onMove, onUpdate, onApprove, onReview }: {
  clip: PodcastClip; url?: string; status: string; adviser: boolean; busy: boolean; mode: string; order: number;
  onReview: () => void; onSelect: () => void; onMove: (delta: number) => void; onUpdate: (patch: Partial<PodcastClip>) => void; onApprove: () => void;
}) {
  const player = useRef<HTMLAudioElement>(null);
  return <li><label className="recording-tray-name"><input type="checkbox" disabled={busy} checked={order >= 0} onChange={onSelect} /><span>{order >= 0 ? `${order + 1}.` : '–'}</span><input aria-label={`Recording name: ${clip.name}`} disabled={busy} value={clip.name} onChange={e => onUpdate({ name: e.target.value })} /></label><small>{status === 'APPROVED' ? 'Ready' : status === 'QUARANTINED' ? 'Waiting for adviser review' : 'Source unavailable'} · {clip.sourceDurationSec.toFixed(1)} seconds</small>
    {mode === 'CONVERSATION' && <label className="conversation-check"><input type="checkbox" disabled={busy} checked={!clip.muted} onChange={e => onUpdate({ muted: !e.target.checked })} />Include in mix</label>}
    {url && <audio ref={player} controls preload="metadata" src={url} />}
    {adviser && status === 'QUARANTINED' && <>{!url && <button className="newsroom-button" disabled={busy} onClick={onReview}>Listen for review</button>}<button className="newsroom-button" disabled={busy || !url} onClick={onApprove}>Approve this recording</button></>}
    <details><summary>Trim the edges</summary><label>Start (seconds)<input type="number" min={0} max={Math.max(0, clip.trimOutSec - .05)} step={.05} disabled={busy} value={clip.trimInSec} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value)) onUpdate({ trimInSec: Math.max(0, Math.min(clip.trimOutSec - .05, value)) }); }} /></label><label>End (seconds)<input type="number" min={clip.trimInSec + .05} max={clip.sourceDurationSec} step={.05} disabled={busy} value={clip.trimOutSec} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value)) onUpdate({ trimOutSec: Math.min(clip.sourceDurationSec, Math.max(clip.trimInSec + .05, value)) }); }} /></label><small>The player plays the original for finding sync marks. The episode uses these trim points.</small></details>
    <div className="recording-tray-actions">{mode === 'SEQUENCE' ? <><button className="newsroom-button" disabled={busy || order <= 0} onClick={() => onMove(-1)}>Earlier</button><button className="newsroom-button" disabled={busy || order < 0} onClick={() => onMove(1)}>Later</button></> : <><button className="newsroom-button" disabled={busy || !url} onClick={() => onUpdate({ syncCueSec: player.current?.currentTime ?? 0 })}>Mark shared sound here</button><label>Sync mark (seconds)<input type="number" min={0} max={clip.sourceDurationSec} step={.01} disabled={busy} value={clip.syncCueSec ?? ''} onChange={e => onUpdate({ syncCueSec: e.target.value === '' ? undefined : Number(e.target.value) })} /></label></>}</div>
  </li>;
}
