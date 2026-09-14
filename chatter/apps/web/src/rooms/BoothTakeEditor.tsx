import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chooseStoryTake, defaultTakeEdits, handoffTake, JobQueue, newId, resolveStoryCreationRecipe, saveDeliverable, saveTakeEdits, validateTakeEdits, type Asset, type Job, type Story, type Take, type TakeEdits, type Transcript, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { audioPeak, boothClock, decodeTakeAudio, encodeTakeWav, renderTakeAudio, waveformPeaks, type TakeAudio } from '../audio/take-audio.js';
import { analyzeBoothAudio, buildBoothTakeCheck, BOOTH_PERFORMANCE_MODES, type BoothAudioAnalysis } from '../audio/booth-take-check.js';

function download(bytes: Uint8Array, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BoothTakeEditor({ take, story, me, asset, transcript, job, disabled, onChanged }: {
  take: Take; story: Story; me?: User; asset?: Asset; transcript?: Transcript; job?: Job; disabled: boolean; onChanged: () => void;
}) {
  const store = useStore(); const { gate } = useGate(); const navigate = useNavigate();
  const [audio, setAudio] = useState<TakeAudio>(); const [peaks, setPeaks] = useState<number[]>([]); const [original, setOriginal] = useState<Uint8Array>();
  const [analysis, setAnalysis] = useState<BoothAudioAnalysis>();
  const [edits, setEdits] = useState<TakeEdits>(take.edits ?? defaultTakeEdits(take.durationSec));
  const [previewUrl, setPreviewUrl] = useState(''); const [originalUrl, setOriginalUrl] = useState(''); const [clipping, setClipping] = useState(false); const [previewing, setPreviewing] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false); const [zoom, setZoom] = useState(1); const [time, setTime] = useState(0);
  const [name, setName] = useState(take.name ?? 'Untitled take'); const [notes, setNotes] = useState(take.notes ?? '');
  const [performanceMode, setPerformanceMode] = useState(take.performanceMode ?? 'NEWS_READ'); const [slated, setSlated] = useState(take.slated ?? false);
  const [correction, setCorrection] = useState(take.transcriptCorrection ?? transcript?.text ?? ''); const correctionTouched = useRef(false);
  const [markerText, setMarkerText] = useState(''); const [retry, setRetry] = useState(0); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const player = useRef<HTMLAudioElement>(null); const undo = useRef<TakeEdits[]>([]); const redo = useRef<TakeEdits[]>([]); const saves = useRef(Promise.resolve()); const version = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!correctionTouched.current) setCorrection(take.transcriptCorrection ?? transcript?.text ?? ''); }, [transcript?.text, take.transcriptCorrection]);
  useEffect(() => {
    if (!asset || asset.gateStatus !== 'APPROVED') { setLoading(false); return; }
    let live = true; let url = ''; setLoading(true); setError('');
    void (async () => {
      try {
        const bytes = await store.blobs.get(asset.sha256);
        if (!bytes) throw new Error('The original audio is unavailable. Re-import the recording to keep editing.');
        const decoded = await decodeTakeAudio(bytes);
        if (!live) return;
        setAudio(decoded); setPeaks(waveformPeaks(decoded)); setOriginal(bytes);
        url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: asset.mime })); setOriginalUrl(url);
        const next = take.edits ? { ...take.edits, trimEnd: Math.min(decoded.duration, take.edits.trimEnd) } : defaultTakeEdits(decoded.duration);
        setEdits(next);
        if (Math.abs(decoded.duration - take.durationSec) > 0.01) await store.takes.update(take.id, { durationSec: decoded.duration });
      } catch (failure) { if (live) setError(failure instanceof Error ? failure.message : 'This browser could not decode the audio. Try a WAV recording.'); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [store, take.id, asset?.sha256, asset?.gateStatus, retry]);
  useEffect(() => {
    if (!audio) return;
    let url = ''; setPreviewing(true); player.current?.pause();
    // Coalesce slider movement instead of encoding a long interview on every tick.
    const timer = window.setTimeout(() => {
      try {
        const rendered = renderTakeAudio(audio, edits); setClipping(audioPeak(rendered) > 1); setAnalysis(analyzeBoothAudio(rendered)); setError('');
        url = URL.createObjectURL(new Blob([encodeTakeWav(rendered) as unknown as BlobPart], { type: 'audio/wav' })); setPreviewUrl(url); setTime(0);
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'The edit could not be previewed.'); }
      finally { setPreviewing(false); }
    }, 180);
    return () => { clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [audio, edits]);
  useEffect(() => { if (disabled) player.current?.pause(); }, [disabled]);

  function persistEdits(next: TakeEdits) {
    const current = ++version.current; setSaving(true); setError('');
    saves.current = saves.current.catch(() => undefined).then(async () => {
      await saveTakeEdits(store, take.id, next);
      if (mounted.current && current === version.current) { setSaving(false); setMessage('Edit saved. The original is untouched.'); onChanged(); }
    }).catch((failure) => { if (mounted.current) { setSaving(false); setError(`${failure instanceof Error ? failure.message : 'The edit did not save.'} Use Save edit to retry.`); } });
  }
  function change(patch: Partial<TakeEdits>) {
    if (!audio) return;
    try {
      const next = validateTakeEdits({ ...edits, ...patch }, audio.duration);
      undo.current.push(edits); redo.current = []; setEdits(next); setError(''); persistEdits(next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the edit values.'); }
  }
  function history(back: boolean) {
    const source = back ? undo.current : redo.current; const destination = back ? redo.current : undo.current;
    const next = source.pop(); if (!next) return; destination.push(edits); setEdits(next); setError(''); persistEdits(next);
  }
  async function action(work: () => Promise<unknown>, success?: string) {
    setBusy(true); setError(''); setMessage('');
    try { await saves.current; await work(); if (success) setMessage(success); onChanged(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'That action did not finish. Try it again.'); }
    finally { setBusy(false); }
  }
  const duration = audio?.duration ?? take.durationSec; const trimDuration = edits.trimEnd - edits.trimStart;
  const takeCheck = useMemo(() => analysis ? buildBoothTakeCheck({ analysis, mode: performanceMode, transcriptText: correction || transcript?.text, slated }) : [], [analysis, performanceMode, correction, transcript?.text, slated]);
  const reviewCount = takeCheck.filter((check) => check.status === 'REVIEW').length;
  const podcastHandoff = resolveStoryCreationRecipe(story).id === 'podcast';
  const sourceTime = compareOriginal ? time : time + edits.trimStart;
  const seek = (seconds: number) => { if (player.current) player.current.currentTime = compareOriginal ? seconds : Math.max(0, Math.min(trimDuration, seconds - edits.trimStart)); };
  const locked = disabled || busy;
  const saveNotes = () => action(() => store.takes.update(take.id, { name: name.trim() || 'Untitled take', notes, ...(correctionTouched.current ? { transcriptCorrection: correction } : {}) }), 'Take details saved.');
  const saveDetailsOnBlur = () => {
    void store.takes.update(take.id, { name: name.trim() || 'Untitled take', notes, ...(correctionTouched.current ? { transcriptCorrection: correction } : {}) }).then(() => { if (mounted.current) onChanged(); }).catch((failure) => { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Take details did not save. Use Save transcript & notes to retry.'); });
  };
  async function exportEdit() {
    if (!audio) return;
    const bytes = encodeTakeWav(renderTakeAudio(audio, edits)); const clean = name.replace(/[^a-z0-9 -]/gi, '').trim() || 'take';
    await action(async () => {
      await saveDeliverable(store, { bytes, title: `${clean} · edited`, fileName: `${story.slug}-${clean.replace(/\s+/g, '-').toLowerCase()}-edited.wav`, kind: 'AUDIO', room: 'BOOTH', stage: 'WORKING', mime: 'audio/wav', storyId: story.id, authorId: me?.id, durationSec: trimDuration, sourceAssetId: take.renderedAssetId });
      download(bytes, 'audio/wav', `${clean}-edited.wav`);
    }, 'Edited WAV saved to the Media Bin and downloaded.');
  }
  if (asset?.gateStatus !== 'APPROVED') return <div className="booth-edit-panel"><h2>This recording is waiting for a media check.</h2><p>It is safely attached to {story.title}. An adviser can listen and approve uploaded audio in Green Light.</p><button className="newsroom-button" onClick={() => navigate(`/greenlight/${story.id}`)}>Open Green Light ↗</button></div>;
  return <article className="booth-edit-panel" aria-label="Take editor">
    <div className="booth-edit-heading"><div><span className="newsroom-eyebrow">NON-DESTRUCTIVE TAKE EDITOR</span><h3>{take.name || 'Untitled take'}</h3><small>{audio ? `${audio.channels.length === 1 ? 'Mono' : 'Stereo'} · ${audio.sampleRate / 1000} kHz · ` : ''}{boothClock(duration)} original</small></div><button className="newsroom-button" aria-pressed={story.selectedTakeId === take.id} disabled={locked || !audio || saving} onClick={() => void action(() => chooseStoryTake(store, story.id, take.id), podcastHandoff ? 'Chosen for this episode. Finish the edit when it is ready for Chatterbox.' : 'Chosen as this story’s audio clip. The story route has not changed.')}>{story.selectedTakeId === take.id ? '★ Chosen take' : '☆ Use this take'}</button></div>
    {error && <div role="alert" className="newsroom-notice error">{error}<button className="newsroom-button" disabled={locked} onClick={() => audio ? persistEdits(edits) : setRetry((value) => value + 1)}>{audio ? 'Save edit' : 'Retry loading audio'}</button></div>}
    {message && <p role="status" className="booth-edit-status">{message}</p>}
    {loading && <p role="status">Reading the real audio and drawing its waveform…</p>}
    {previewing && <p role="status">Preparing the edited preview…</p>}
    {audio && <>
      <div className="booth-wave-tools"><span>{boothClock(sourceTime)} / {boothClock(duration)}</span><label>Zoom<select aria-label="Waveform zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{[1, 2, 4, 8].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label><button className="newsroom-button" disabled={!undo.current.length || locked} onClick={() => history(true)}>↶ Undo</button><button className="newsroom-button" disabled={!redo.current.length || locked} onClick={() => history(false)}>↷ Redo</button></div>
      <div className="booth-wave-scroll"><div className="booth-wave-inner" style={{ width: `${zoom * 100}%` }}><svg viewBox="0 0 1000 150" preserveAspectRatio="none" role="img" aria-label="Original recording waveform; shaded ends are trimmed" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seek((event.clientX - rect.left) / rect.width * duration); }}><line x1="0" x2="1000" y1="75" y2="75" stroke="#665775" strokeWidth="1" />{peaks.map((peak, index) => <rect key={index} x={index / peaks.length * 1000} y={75 - Math.max(1, peak * 68)} width={Math.max(1, 1000 / peaks.length - 0.7)} height={Math.max(2, peak * 136)} fill="#22c7e8" />)}<rect width={edits.trimStart / duration * 1000} height="150" fill="#171321" opacity="0.8" /><rect x={edits.trimEnd / duration * 1000} width={1000 - edits.trimEnd / duration * 1000} height="150" fill="#171321" opacity="0.8" /><line x1={sourceTime / duration * 1000} x2={sourceTime / duration * 1000} y1="0" y2="150" stroke="#ffd21e" strokeWidth="2" />{take.markers?.map((marker) => <line key={marker.id} x1={marker.at / duration * 1000} x2={marker.at / duration * 1000} y1="0" y2="20" stroke="#ff3d8b" strokeWidth="3" />)}</svg><div className="booth-wave-times">{Array.from({ length: 6 }, (_, index) => <span key={index}>{boothClock(duration * index / 5)}</span>)}</div></div></div>
      <label className="booth-seek">Playhead<input aria-label="Take playhead" type="range" min={0} max={duration} step={0.01} value={Math.min(duration, sourceTime)} onChange={(event) => seek(Number(event.target.value))} /></label>
      <div className="booth-player"><audio ref={player} controls preload="metadata" src={(compareOriginal ? originalUrl : previewUrl) || undefined} onPlay={() => { if (disabled || previewing) player.current?.pause(); }} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onError={() => setError('Playback failed. Retry loading this take or download the original audio.')} /><button className="newsroom-button" aria-pressed={compareOriginal} onClick={() => { player.current?.pause(); setTime(0); setCompareOriginal(!compareOriginal); }}>{compareOriginal ? 'Hearing original · switch to edit' : 'Hearing edit · compare original'}</button></div>
      <section className="booth-take-check" aria-labelledby={`take-check-${take.id}`}><header><div><span className="newsroom-eyebrow">TAKE CHECK</span><h4 id={`take-check-${take.id}`}>{reviewCount ? `${reviewCount} ${reviewCount === 1 ? 'thing' : 'things'} to listen for` : 'Ready for a final listen'}</h4><p>Measured from the edited preview. Use your ears for the decision.</p></div><span className={`booth-check-summary ${reviewCount ? 'review' : 'pass'}`}>{reviewCount ? 'REVIEW' : 'CLEAR'}</span></header><div className="booth-take-setup"><label>Performance<select disabled={locked} value={performanceMode} onChange={(event) => { const next = event.target.value as typeof performanceMode; setPerformanceMode(next); void action(() => store.takes.update(take.id, { performanceMode: next }), 'Performance mode saved.'); }}>{BOOTH_PERFORMANCE_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></label><label className="booth-check-label"><input type="checkbox" disabled={locked} checked={slated} onChange={(event) => { const next = event.target.checked; setSlated(next); void action(() => store.takes.update(take.id, { slated: next }), 'Slate note saved.'); }} />I said the story title and my name before this take</label></div><div className="booth-check-grid">{takeCheck.map((check) => <article key={check.id} data-status={check.status}><span>{check.status === 'PASS' ? '✓' : check.status === 'REVIEW' ? '!' : '…'} {check.label}</span><b>{check.reading}</b><p>{check.action}</p></article>)}</div></section>
      <fieldset className="booth-edit-controls" disabled={locked}><legend>Keep the good part · {boothClock(trimDuration)}</legend><div className="booth-trim-grid"><label>Start · seconds<input type="number" min={0} max={edits.trimEnd - 0.02} step={0.01} value={Number(edits.trimStart.toFixed(2))} onChange={(event) => change({ trimStart: Number(event.target.value) })} /><input aria-label="Trim start" type="range" min={0} max={Math.max(0, edits.trimEnd - 0.02)} step={0.01} value={edits.trimStart} onChange={(event) => change({ trimStart: Number(event.target.value) })} /></label><label>End · seconds<input type="number" min={edits.trimStart + 0.02} max={duration} step={0.01} value={Number(edits.trimEnd.toFixed(2))} onChange={(event) => change({ trimEnd: Number(event.target.value) })} /><input aria-label="Trim end" type="range" min={edits.trimStart + 0.02} max={duration} step={0.01} value={edits.trimEnd} onChange={(event) => change({ trimEnd: Number(event.target.value) })} /></label></div><div className="booth-trim-actions"><button onClick={() => change({ trimStart: sourceTime })}>Set start at playhead</button><button onClick={() => change({ trimEnd: sourceTime })}>Set end at playhead</button><button onClick={() => change(defaultTakeEdits(duration))}>Restore original edit</button></div><div className="booth-finish-controls"><label>Level · {edits.gainDb > 0 ? '+' : ''}{edits.gainDb} dB<input aria-label="Take gain" type="range" min={-24} max={18} step={0.5} value={edits.gainDb} onChange={(event) => change({ gainDb: Number(event.target.value) })} /></label><label>Fade in · seconds<input type="number" min={0} max={trimDuration} step={0.05} value={edits.fadeIn} onChange={(event) => change({ fadeIn: Number(event.target.value) })} /></label><label>Fade out · seconds<input type="number" min={0} max={trimDuration} step={0.05} value={edits.fadeOut} onChange={(event) => change({ fadeOut: Number(event.target.value) })} /></label></div><label className="booth-check-label"><input type="checkbox" checked={edits.normalize} onChange={(event) => change({ normalize: event.target.checked })} />Normalize peaks to −1 dB before the level control</label><p className="booth-help">Normalization raises or lowers peaks (up to +20 dB); it is not noise removal or loudness matching. Trims and fades never change the original.</p></fieldset>
      {clipping && <p role="alert" className="newsroom-notice error">This edit exceeds 0 dB and would distort. Lower the level before exporting.</p>}
      <div className="booth-marker-editor"><b>Pickup markers</b><div className="booth-marker-list">{take.markers?.map((marker) => <button key={marker.id} onClick={() => seek(marker.at)}>⚑ {boothClock(marker.at)} · {marker.label}</button>)}</div><div><input aria-label="Marker label" placeholder="A name to re-read, a great quote…" value={markerText} onChange={(event) => setMarkerText(event.target.value)} /><button className="newsroom-button" disabled={locked || !markerText.trim()} onClick={() => void action(async () => { const latest = await store.takes.get(take.id); await store.takes.update(take.id, { markers: [...(latest?.markers ?? []), { id: newId(), at: sourceTime, label: markerText.trim() }] }); setMarkerText(''); }, 'Marker saved at the playhead.')}>Add marker</button></div></div>
    </>}
      <div className="booth-take-details"><label>Name this take<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== take.name) saveDetailsOnBlur(); }} /></label><label>Take notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What worked? What needs another pass?" onBlur={() => { if (notes !== (take.notes ?? '')) saveDetailsOnBlur(); }} /></label></div>
    <details className="booth-transcript"><summary>Transcript · {transcript || take.transcriptCorrection ? 'read & correct' : job?.state === 'FAILED' ? 'needs a retry' : job?.state === 'RUNNING' ? 'working' : 'queued / not ready'}</summary><p className="booth-help">Check names and quotes against the audio. This text describes the original take, not the trimmed export. Your correction keeps the first transcript available for comparison.</p>{job?.error && !transcript && <p role="alert" className="newsroom-notice error">Transcription: {job.error}</p>}<textarea aria-label="Corrected transcript" value={correction} onBlur={() => { if (correctionTouched.current) saveDetailsOnBlur(); }} onChange={(event) => { correctionTouched.current = true; setCorrection(event.target.value); }} placeholder="Type the transcript here if you want to get started now." /><div><button className="newsroom-button" disabled={locked} onClick={() => void saveNotes()}>Save transcript & notes</button>{!transcript && <button className="newsroom-button" disabled={locked || job?.state === 'RUNNING' || job?.state === 'WAITING'} onClick={() => void action(async () => { if (job) await store.jobs.update(job.id, { state: 'WAITING', attempts: 0, error: undefined }); else await new JobQueue(store).enqueue('transcribe', { assetId: take.assetId, storyId: take.storyId }); }, 'Transcript added to the work queue.')}>{job?.state === 'FAILED' ? 'Retry transcription' : 'Generate transcript'}</button>}</div></details>
    <footer className="booth-edit-footer"><span>{saving ? 'Saving edit…' : podcastHandoff ? 'Episode take · Chatterbox is next' : 'Story clip · progress stays put'}</span><button className="newsroom-button" disabled={locked || !original} onClick={() => original && download(original, asset.mime, `${name.replace(/[^a-z0-9 -]/gi, '') || 'take'}-original.${asset.mime.includes('mp4') ? 'm4a' : asset.mime.includes('wav') ? 'wav' : asset.mime.includes('mpeg') ? 'mp3' : asset.mime.includes('ogg') ? 'ogg' : 'webm'}`)}>Download original</button><button className="newsroom-button" disabled={locked || !audio || clipping || previewing} onClick={() => void exportEdit()}>Export edited WAV</button><button className="newsroom-button" disabled={locked || !audio} onClick={() => navigate(`/studio?story=${story.id}&booth=1`)}>Open in Studio ↗</button><button className="newsroom-button primary" disabled={locked || !audio || clipping || previewing || !me || saving} onClick={() => void action(async () => { await handoffTake({ store, gate, takeId: take.id, bytes: encodeTakeWav(renderTakeAudio(audio!, edits)), edits, actor: me!.id }); if (podcastHandoff) navigate(`/chatterbox?story=${story.id}`); }, podcastHandoff ? 'Edited take is ready in Chatterbox.' : 'Edited clip saved with this story. Its progress did not move.')}>{podcastHandoff ? 'Add to Chatterbox ↗' : 'Save edited story clip'}</button></footer>
  </article>;
}
