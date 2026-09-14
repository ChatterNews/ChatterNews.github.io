import { useSessionCheckpoint } from '../store/useSessionCheckpoint.js';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_SETTINGS, JobQueue, getSettings, newId, saveTake, type Asset, type BoothPerformanceMode, type Job, type Story, type Take, type Transcript, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { boothClock, decodeTakeAudio } from '../audio/take-audio.js';
import { BOOTH_PERFORMANCE_MODES } from '../audio/booth-take-check.js';
import { useBoothRecorder, type CapturedTake } from '../audio/useBoothRecorder.js';
import { useReilyFocus, useReilyRecovery } from '../components/ReilyContextProvider.js';
import { boothReilyFocus, boothReilyRecovery } from '../components/reily-room-focus.js';
import { BoothPrompter } from './BoothPrompter.js';
import { BoothTakeEditor } from './BoothTakeEditor.js';
import './Newsroom.css';
import './Booth.css';

// Failed saves survive room changes in this tab. The original Blob is retained
// until storage succeeds, and the retry uses the same capture id.
interface RecoverableTake { capture: CapturedTake; performanceMode: BoothPerformanceMode; slated: boolean }
const recovery = new Map<string, RecoverableTake>();

export function Booth({ stories, me, onChanged }: { stories: Story[]; me?: User; onChanged: () => void }) {
  const { storyId } = useParams(); const navigate = useNavigate(); const store = useStore(); const { gate } = useGate();
  const story = (storyId ? stories.find((item) => item.id === storyId) : stories.find((item) => item.status === 'BOOTH')) ?? stories[0];
  const [takes, setTakes] = useState<Take[]>([]); const [assets, setAssets] = useState<Asset[]>([]); const [transcripts, setTranscripts] = useState<Transcript[]>([]); const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string>(); const [countIn, setCountIn] = useState(3); const [refresh, setRefresh] = useState(0);
  const [performanceMode, setPerformanceMode] = useState<BoothPerformanceMode>('NEWS_READ'); const [slated, setSlated] = useState(false);
  const [pending, setPending] = useState<RecoverableTake>(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [reilyImportProblem, setReilyImportProblem] = useState(false);
  const importPicker = useRef<HTMLInputElement>(null); const mounted = useRef(true);
  const captureSetup = useRef({ performanceMode, slated });
  // SPEC S3 retention: the window is the adviser's to set, at the Front Desk.
  const retentionDays = useRef(DEFAULT_SETTINGS.takeRetentionDays);
  useEffect(() => { void getSettings(store).then((settings) => { retentionDays.current = settings.takeRetentionDays; }); }, [store]);
  const recorder = useBoothRecorder(async (capture) => {
    if (!story) return;
    const recoverable = { capture, ...captureSetup.current };
    recovery.set(story.id, recoverable); if (mounted.current) setPending(recoverable);
    await persistCapture(recoverable, story.id);
  });
  useSessionCheckpoint(store, async () => {
    if (busy || pending || ['COUNTDOWN', 'RECORDING', 'PAUSED', 'SAVING', 'ASKING'].includes(recorder.phase)) throw new Error('Stop and save the Booth take before finishing. Recover any unsaved take first.');
  });

  const active = ['COUNTDOWN', 'RECORDING', 'PAUSED', 'SAVING', 'ASKING'].includes(recorder.phase);
  const selected = takes.find((take) => take.id === selectedId) ?? takes.find((take) => take.id === story?.selectedTakeId) ?? takes[0];
  useReilyFocus(boothReilyFocus({ recording: active, selectedTake: Boolean(selected), hasTakes: takes.length > 0 }));
  useReilyRecovery(recorder.error
    ? { kind: boothReilyRecovery('microphone'), workChanged: false }
    : reilyImportProblem ? { kind: boothReilyRecovery('import'), workChanged: false } : undefined);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setPending(story ? recovery.get(story.id) : undefined); setSelectedId(undefined); }, [story?.id]);
  useEffect(() => {
    if (!story) return;
    let live = true;
    const load = async () => {
      try {
        const [nextTakes, nextAssets, nextTranscripts, nextJobs] = await Promise.all([store.takes.list(), store.assets.list(), store.transcripts.list(), store.jobs.list()]);
        if (!live) return;
        setTakes(nextTakes.filter((take) => take.storyId === story.id).sort((a, b) => b.createdAt - a.createdAt)); setAssets(nextAssets); setTranscripts(nextTranscripts); setJobs(nextJobs);
      } catch { if (live) setNotice({ text: 'Saved takes could not load. Press Refresh takes to retry.', error: true }); }
    };
    void load(); const timer = window.setInterval(() => void load(), 3000);
    return () => { live = false; clearInterval(timer); };
  }, [store, story?.id, refresh]);

  async function persistCapture(recoverable: RecoverableTake, targetStoryId: string) {
    if (mounted.current) { setBusy(true); setNotice(undefined); }
    try {
      const { capture } = recoverable;
      const result = await saveTake({ store, gate, jobs: new JobQueue(store), storyId: targetStoryId, userId: me?.id ?? 'unknown', bytes: new Uint8Array(await capture.blob.arrayBuffer()), durationSec: capture.duration, mime: capture.blob.type, captureId: capture.captureId, markers: capture.markers, performanceMode: recoverable.performanceMode, slated: recoverable.slated, name: `Take · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, retentionDays: retentionDays.current });
      recovery.delete(targetStoryId);
      if (mounted.current) { setPending(undefined); setSelectedId(result.takeId); setRefresh((value) => value + 1); setNotice({ text: 'Take saved. Listen below, trim the edges, and choose the version you want to use.', error: false }); }
    } catch (error) { if (mounted.current) setNotice({ text: `${error instanceof Error ? error.message : 'The take did not save.'} Your captured audio is kept in this tab. Retry saving or download the recovery file.`, error: true }); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function importAudio(file: File) {
    if (!story) return;
    setBusy(true); setNotice(undefined); setReilyImportProblem(false);
    try {
      if (!file.size || file.size > 100 * 1024 * 1024) throw new Error('Choose a non-empty audio file under 100 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer()); const audio = await decodeTakeAudio(bytes);
      if (audio.duration > 15 * 60) throw new Error('Import up to 15 minutes per take. Split longer interviews into parts first.');
      const result = await saveTake({ store, gate, jobs: new JobQueue(store), storyId: story.id, userId: me?.id ?? 'unknown', bytes, durationSec: audio.duration, mime: file.type || 'audio/wav', name: file.name, origin: 'UPLOAD', captureId: newId(), performanceMode, slated, retentionDays: retentionDays.current });
      setSelectedId(result.takeId); setRefresh((value) => value + 1); setNotice({ text: 'Audio imported and attached to this story. An adviser must check uploaded recordings in Green Light before playback or use.', error: false });
    } catch (error) { setReilyImportProblem(true); setNotice({ text: error instanceof Error ? error.message : 'This file could not be decoded. Try WAV, MP3, or M4A.', error: true }); }
    finally { setBusy(false); if (importPicker.current) importPicker.current.value = ''; }
  }
  function toggleRecord() {
    if (['RECORDING', 'PAUSED', 'COUNTDOWN'].includes(recorder.phase)) recorder.stop();
    else if (!busy && !pending) { captureSetup.current = { performanceMode, slated }; setNotice(undefined); void recorder.start(countIn); }
  }
  useEffect(() => {
    const keys = (event: KeyboardEvent) => { const target = event.target as HTMLElement; if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable) return; if (event.key.toLowerCase() === 'r') { event.preventDefault(); toggleRecord(); } if (event.key.toLowerCase() === 'm') { event.preventDefault(); recorder.mark(); } };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  });
  if (!story) return <section className="view on newsroom-room booth-room"><div className="newsroom-empty"><h1>No story selected</h1><p>Create or select a story in Slate before recording.</p><button className="newsroom-button primary" onClick={() => navigate('/slate')}>Open Slate ↗</button></div></section>;

  const modeGuide = BOOTH_PERFORMANCE_MODES.find((mode) => mode.id === performanceMode) ?? BOOTH_PERFORMANCE_MODES[0]!;
  const transport = <div className="booth-transport"><button className={`booth-record-button ${recorder.phase === 'RECORDING' ? 'recording' : ''}`} disabled={busy || !!pending || ['ASKING', 'SAVING'].includes(recorder.phase)} onClick={toggleRecord}>{['RECORDING', 'PAUSED'].includes(recorder.phase) ? '■ Stop & save' : recorder.phase === 'COUNTDOWN' ? 'Cancel countdown' : recorder.phase === 'SAVING' ? 'Saving take…' : '● Record a take'}</button><button className="newsroom-button" disabled={!['RECORDING', 'PAUSED'].includes(recorder.phase)} onClick={recorder.pause}>{recorder.phase === 'PAUSED' ? '▶ Resume recording' : 'Ⅱ Pause recording'}</button><button className="newsroom-button" disabled={!['RECORDING', 'PAUSED'].includes(recorder.phase)} onClick={recorder.mark}>⚑ Mark pickup {recorder.markers.length || ''}</button><span className="booth-time" aria-label="Recorded time">{boothClock(recorder.elapsed)}</span></div>;
  return <section className="view on newsroom-room booth-room">
    <header className="newsroom-hero"><div className="newsroom-hero-icon">◉</div><div><span className="newsroom-eyebrow">BOOTH</span><h1>Voice recording</h1><p>Check the microphone, rehearse, record, and choose a take.</p></div><label className="booth-story-picker">Story<select aria-label="Recording story" disabled={active || busy || !!pending} value={story.id} onChange={(event) => navigate(`/booth/${event.target.value}`)}>{stories.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></header>
    {(notice || recorder.error) && <div role={notice?.error || recorder.error ? 'alert' : 'status'} className={`newsroom-notice ${notice?.error || recorder.error ? 'error' : ''}`}>{recorder.error && <p>{recorder.error}</p>}{notice && <p>{notice.text}</p>}</div>}
    {recorder.phase === 'ASKING' && <div className="newsroom-notice" role="status">Waiting for microphone permission. Look for your browser’s permission prompt.<button className="newsroom-button" onClick={recorder.disable}>Cancel request</button></div>}
    {pending && recorder.phase !== 'SAVING' && <div className="booth-recovery"><h2>Recording not saved</h2><p>Keep this tab open. Retrying will not duplicate the take.</p><button className="newsroom-button primary" disabled={busy} onClick={() => void persistCapture(pending, story.id)}>Retry saving take</button><button className="newsroom-button" onClick={() => { const url = URL.createObjectURL(pending.capture.blob); const a = document.createElement('a'); a.href = url; a.download = `chatter-recovery.${pending.capture.blob.type.includes('mp4') ? 'm4a' : pending.capture.blob.type.includes('ogg') ? 'ogg' : 'webm'}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download recovery audio</button></div>}
    <section className="booth-performance-deck" aria-labelledby="booth-performance-title"><div className="booth-performance-heading"><div><span className="newsroom-eyebrow">PERFORMANCE MODE</span><h2 id="booth-performance-title">Set the read before the record</h2></div><p>{modeGuide.use}</p></div><div className="booth-mode-rack" role="radiogroup" aria-label="Performance mode">{BOOTH_PERFORMANCE_MODES.map((mode) => <button key={mode.id} role="radio" aria-checked={performanceMode === mode.id} disabled={active || busy || !!pending} onClick={() => setPerformanceMode(mode.id)}><span>{mode.shortLabel}</span><b>{mode.label}</b><small>{mode.use}</small></button>)}</div><div className="booth-direction-strip"><div><span>DIRECTOR’S NOTE</span><strong>{modeGuide.direction}</strong></div><ol>{modeGuide.cues.map((cue) => <li key={cue}>{cue}</li>)}</ol><label className="booth-slate-switch"><input type="checkbox" checked={slated} disabled={active || busy || !!pending} onChange={(event) => setSlated(event.target.checked)} /><span><b>Slate this take</b><small>{modeGuide.slateLine}</small></span></label></div></section>
    <div className="booth-workspace"><div className="booth-main"><BoothPrompter story={story} phase={recorder.phase} countdown={recorder.countdown} mode={performanceMode} controls={transport} onEdit={() => navigate(`/desk/${story.id}`)} /><div className="booth-story-context"><b>Director’s notes</b><p>{story.brief?.productionNotes || 'Add pronunciations, interview cues, or a sound plan in the Slate. Leave a pause before restarting a line; mark it as a pickup.'}</p><button disabled={active} onClick={() => navigate(`/slate/${story.id}`)}>Open story plan ↗</button></div></div>
      <aside className="booth-input-panel"><span className="newsroom-eyebrow">INPUT</span><h2>Sound check</h2><p>Speak at normal presenting volume. Use headphones to avoid feedback.</p><label>Microphone<select disabled={active} value={recorder.deviceId} onChange={(event) => recorder.setDevice(event.target.value)}><option value="">System default microphone</option>{recorder.devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label><button className="newsroom-button primary" disabled={active} onClick={() => void recorder.checkMicrophone()}>{recorder.phase === 'READY' ? 'Recheck microphone' : 'Check microphone'}</button>{recorder.phase === 'READY' && <button className="slate-text-button" onClick={recorder.disable}>Turn microphone off</button>}
      <div className="booth-level-display"><div className="booth-meter" role="meter" aria-label="Microphone peak level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.min(0, Math.round(recorder.level))}><div style={{ width: `${Math.max(0, Math.min(100, (recorder.level + 60) / 60 * 100))}%` }} /><i style={{ left: `${Math.max(0, Math.min(99, (recorder.peak + 60) / 60 * 100))}%` }} /></div><div className="booth-meter-scale"><span>−60</span><span>−24</span><span>−12</span><span>0 dB</span></div><strong className={recorder.level >= -1 ? 'clipping' : ''}>{recorder.phase === 'OFF' ? 'Microphone is off' : recorder.level >= -1 ? 'Too loud · move back or lower input' : recorder.level < -45 ? 'Listening · try a sentence' : `Signal arriving · ${Math.round(recorder.level)} dBFS`}</strong><small>Leave room for louder words. Aim around −12 to −6 dB on peaks; avoid red.</small></div>
      <label>Recording level · {recorder.gainDb > 0 ? '+' : ''}{recorder.gainDb} dB<input type="range" min={-12} max={12} step={1} value={recorder.gainDb} onChange={(event) => recorder.setGainDb(Number(event.target.value))} /></label><label>Input processing<select disabled={active} value={recorder.voiceMode ? 'VOICE' : 'RAW'} onChange={(event) => recorder.setVoiceMode(event.target.value === 'VOICE')}><option value="VOICE">Speech · request noise / echo reduction</option><option value="RAW">Raw · request no voice processing</option></select></label><small>Processing support depends on the microphone. Software level cannot undo clipping at the input.</small><label>Count-in<select disabled={active} value={countIn} onChange={(event) => setCountIn(Number(event.target.value))}><option value={0}>Start immediately</option><option value={3}>3 seconds</option><option value={5}>5 seconds</option></select></label><div className="booth-import"><b>Recorded somewhere else?</b><input ref={importPicker} type="file" hidden accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg,.flac" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importAudio(file); }} /><button className="newsroom-button" disabled={active || busy || !!pending} onClick={() => importPicker.current?.click()}>Import a recording</button><small>Up to 15 minutes / 100 MB. Imported takes wait for an adviser’s media check.</small></div></aside>
    </div>
    <section className="booth-takes"><div className="booth-takes-heading"><div><span className="newsroom-eyebrow">LISTEN BEFORE YOU CHOOSE</span><h2>The take room <span>{takes.length}</span></h2></div><button className="newsroom-button" onClick={() => { setNotice(undefined); setRefresh((value) => value + 1); }}>↻ Refresh takes</button></div>{takes.length ? <div className="booth-take-workspace"><aside className="booth-take-list">{takes.map((take, index) => <button key={take.id} aria-current={selected?.id === take.id} onClick={() => setSelectedId(take.id)}><span>{take.id === story.selectedTakeId ? '★ CHOSEN' : `TAKE ${takes.length - index}`}</span><b>{take.name || `Take ${takes.length - index}`}</b><small>{BOOTH_PERFORMANCE_MODES.find((mode) => mode.id === (take.performanceMode ?? 'NEWS_READ'))?.label} · {boothClock(take.durationSec)}</small><small>{assets.find((asset) => asset.id === take.assetId)?.gateStatus === 'APPROVED' ? 'Ready to listen' : 'Waiting for media check'}</small></button>)}</aside>{selected && <BoothTakeEditor key={selected.id} take={selected} story={story} me={me} asset={assets.find((asset) => asset.id === selected.assetId)} transcript={transcripts.find((item) => item.assetId === selected.assetId)} job={jobs.filter((item) => (item.payload as { assetId?: string })?.assetId === selected.assetId).sort((a, b) => b.createdAt - a.createdAt)[0]} disabled={active || busy} onChanged={() => { setRefresh((value) => value + 1); onChanged(); }} />}</div> : <div className="booth-no-takes"><span>◉</span><div><h3>Your first take goes here.</h3><p>Choose a performance mode, check the mic, rehearse, then record. Every take gets a waveform, a real Take Check, and a non-destructive editor.</p></div></div>}</section>
    <p className="newsroom-local-note">Each take can run up to 15 minutes. Leave one clean second before and after the performance; those handles make trims and fades much easier. Raw takes are kept for 90 days.</p>
  </section>;
}
