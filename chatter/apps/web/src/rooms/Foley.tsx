import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { emptySoundAttribution, makeSoundProject, validateSoundProject, type Asset, type PodcastProject, type ShowtimeProject, type SoundCollection, type SoundLibraryItem, type SoundProject, type SoundRevision, type Story, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { importSoundRecording, recoverSoundOperations, saveSoundVersion, updateSoundItem, validateSoundSources } from '../audio/sound-repository.js';
import { exportSoundPack, importSoundPack } from '../audio/sound-pack.js';
import { renderSound } from '../audio/sound-engine.js';
import { starterSounds, type StarterSound } from '../audio/sound-starters.js';
import { makeSoundRequest, resolveSound, soundConsumerReturnTo, soundReturnUrl } from '../audio/sound-handoff.js';
import { useBoothRecorder, type CapturedTake } from '../audio/useBoothRecorder.js';
import { registerSessionCheckpoint } from '../store/session-checkpoint.js';
import { ControlIcon } from '../components/ControlIcon.js';
import { LoadingStatus } from '../components/LoadingStatus.js';
import { VideoMediaReview } from './VideoMediaReview.js';
import { FoleyImport } from './FoleyImport.js';
import { FoleyLibrary } from './FoleyLibrary.js';
import { FoleyStockSounds } from './FoleyStockSounds.js';
import { adoptStockSound, type StockSound } from '../audio/stock-sounds.js';
import { FoleyCanvas, FoleyToolOptions, type FoleyTool } from './FoleyArrangement.js';
import { FoleyPalette, FoleyToolIcon, foleyTools } from './FoleyPalette.js';
import { RoomIcon } from '../components/RoomIcon.js';
import { readSoundDraft, useSoundProject } from './useSoundProject.js';
import { useSoundNavigation } from './useSoundNavigation.js';
import '../styles/Foley.css';

function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000); }

export function Foley({ stories, me }: { stories: Story[]; me?: User }) {
  const store = useStore(); const { gate } = useGate(); const navigate = useNavigate(); const location = useLocation(); const params = useParams();
  const editor = useSoundProject(store); const project = editor.project; const editorRef = useRef(editor); editorRef.current = editor;
  const [items, setItems] = useState<SoundLibraryItem[]>([]); const [assets, setAssets] = useState<Asset[]>([]); const [collections, setCollections] = useState<SoundCollection[]>([]); const [projects, setProjects] = useState<SoundProject[]>([]);
  const [busy, setBusy] = useState(false); const [canCancel, setCanCancel] = useState(false); const [importBusy, setImportBusy] = useState(false); const [stage, setStage] = useState(''); const [progress, setProgress] = useState<number>();
  const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [importing, setImporting] = useState<File[] | undefined>();
  const [selected, setSelected] = useState<string>(); const [selectedTrack, setSelectedTrack] = useState<string>();
  const [tool, setTool] = useState<FoleyTool>('SOUNDS'); const [soundShelf, setSoundShelf] = useState<'INCLUDED' | 'CLUB'>('INCLUDED'); const [projectMenu, setProjectMenu] = useState(false); const [playhead, setPlayhead] = useState(0); const [playing, setPlaying] = useState(false); const [peak, setPeak] = useState<number>();
  const [recordingName, setRecordingName] = useState('Foley recording'); const [recoveryTake, setRecoveryTake] = useState<CapturedTake>();
  const [destination, setDestination] = useState<SoundLibraryItem>(); const [videos, setVideos] = useState<ShowtimeProject[]>([]); const [podcasts, setPodcasts] = useState<PodcastProject[]>([]);
  const [revisions, setRevisions] = useState<SoundRevision[]>([]);
  const [lastSaved, setLastSaved] = useState<SoundLibraryItem>();
  const player = useRef<HTMLAudioElement>(null); const [audioUrl, setAudioUrl] = useState(''); const [audioName, setAudioName] = useState(''); const previewProject = useRef(false);
  const abort = useRef<AbortController>(); const packInput = useRef<HTMLInputElement>(null); const live = useRef(true); const loading = useRef(false);
  const returnTo = new URLSearchParams(location.search).get('returnTo');
  const refresh = useCallback(async () => {
    const [nextItems, nextAssets, nextCollections, nextProjects, nextRevisions] = await Promise.all([store.soundItems.list(), store.assets.list(), store.soundCollections.list(), store.soundProjects.list(), store.soundRevisions.list()]);
    if (live.current) { setItems(nextItems); setAssets(nextAssets); setCollections(nextCollections); setProjects(nextProjects); setRevisions(nextRevisions); }
  }, [store]);
  async function capture(take: CapturedTake) {
    setRecoveryTake(take);
    const suffix = take.blob.type.includes('mp4') ? 'm4a' : 'webm';
    const item = await importSoundRecording(store, gate, new File([take.blob], `${recordingName || 'Foley recording'}.${suffix}`, { type: take.blob.type }), { ...emptySoundAttribution(), creator: me?.penName || 'Club recording', license: 'Original club recording' }, { duration: take.duration });
    await refresh(); setRecoveryTake(undefined); setNotice(`Saved ${item.name} to the library.`);
  }
  const recorder = useBoothRecorder(capture); const recording = !['OFF', 'READY'].includes(recorder.phase);
  const locked = busy || importBusy || recording;
  const lockedRef = useRef(locked); lockedRef.current = locked;
  const recoveryRef = useRef(recoveryTake); recoveryRef.current = recoveryTake;
  const allowNavigation = useSoundNavigation({ dirty: editor.dirty, blocked: () => lockedRef.current || !!recoveryRef.current, flush: editor.flush, onError: setError });
  useEffect(() => { if (recorder.elapsed >= 299 && recorder.phase === 'RECORDING') recorder.stop(); }, [recorder.elapsed, recorder.phase]);
  useEffect(() => { recorder.setVoiceMode(false); }, []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => { live.current = true; return () => { live.current = false; abort.current?.abort(); player.current?.pause(); }; }, []);
  useEffect(() => registerSessionCheckpoint(store, async () => { if (lockedRef.current || recoveryRef.current) throw new Error('Finish the sound job or save the recovered recording before leaving Foley.'); await editorRef.current.flush(); }), [store]);
  useEffect(() => {
    let replaying = false;
    const block = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('a,button') : null;
      if (replaying || !target || target.closest('.foley-workspace') || (!lockedRef.current && !recoveryRef.current && !editorRef.current.dirty())) return;
      event.preventDefault(); event.stopPropagation();
      if (lockedRef.current || recoveryRef.current) { setError('Finish the sound job or save the recovered recording before leaving.'); return; }
      void editorRef.current.flush().then(() => { replaying = true; target.click(); replaying = false; }).catch(() => undefined);
    };
    const unload = (event: BeforeUnloadEvent) => { if (lockedRef.current || recoveryRef.current) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('click', block, true); window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('click', block, true); window.removeEventListener('beforeunload', unload); };
  }, []);
  useEffect(() => {
    if (loading.current) return; loading.current = true;
    void (async () => {
      await recoverSoundOperations(store); await refresh();
      const query = new URLSearchParams(location.search); const id = query.get('project'); const revisionId = query.get('revision');
      if (revisionId) {
        const revision = await store.soundRevisions.get(revisionId); if (!revision || (id && revision.projectId !== id)) throw new Error('That sound version is missing. Open another project or restore its sound pack.');
        const fresh = makeSoundProject(`${revision.snapshot.name} · new version`, revision.snapshot.storyId);
        await editorRef.current.open({ ...structuredClone(revision.snapshot), id: fresh.id, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt, revision: 0, name: fresh.name }, true);
        setNotice('Opened an editable copy of that saved version. Existing videos and podcasts keep their current sound.');
      } else {
        const draft = readSoundDraft(); let restored = false;
        if (draft && (!id || id === draft.id)) {
          try { validateSoundProject(draft); const saved = await store.soundProjects.get(draft.id); if (!saved || saved.revision === draft.revision) { await editorRef.current.open(draft, true); restored = true; setNotice('Recovered your latest edits. Saving them now.'); } } catch { /* Invalid recovery data does not replace saved work. */ }
        }
        if (!restored) {
          const found = id ? await store.soundProjects.get(id) : (await store.soundProjects.list()).sort((a, b) => b.updatedAt - a.updatedAt)[0];
          if (id && !found) throw new Error('That sound project is missing. Restore its sound pack or start a new cue.');
          await editorRef.current.open(found ?? makeSoundProject('Untitled cue', params.storyId), !found);
          if (!found) setTool('SOUNDS');
        }
      }
    })().catch(problem => setError(problem instanceof Error ? problem.message : 'Foley could not open.'));
  }, [store, refresh]);
  async function task(work: () => Promise<void>, cancellable = false) {
    if (lockedRef.current) return; setBusy(true); setCanCancel(cancellable); setError(''); setProgress(undefined); abort.current = new AbortController();
    try { await work(); } catch (problem) { setError(problem instanceof Error ? problem.message : 'That action did not finish. Your saved work is still here.'); }
    finally { if (live.current) { setBusy(false); setCanCancel(false); setStage(''); setProgress(undefined); } abort.current = undefined; }
  }
  function stop() { player.current?.pause(); setPlaying(false); }
  function setPlayback(bytes: Uint8Array, name: string, isProject: boolean, mime = 'audio/wav') {
    stop(); previewProject.current = isProject; setAudioName(name); setAudioUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime })));
  }
  async function playItem(item: SoundLibraryItem) {
    await task(async () => { setStage('Opening sound…'); const resolved = await resolveSound(store, item.id); const bytes = await store.blobs.get(resolved.asset.path); if (!bytes) throw new Error('This sound file is missing. Import it again.'); setPlayback(bytes, item.name, false, resolved.asset.mime); });
  }
  async function render(save: boolean) {
    await task(async () => {
      stop(); await editor.flush(); const current = editor.current.current; if (!current?.clips.length) throw new Error('Add a sound or starter to the cue first.');
      const result = await renderSound(current, await validateSoundSources(store, current), { signal: abort.current?.signal, onProgress: (label, fraction) => { setStage(label); setProgress(fraction); } });
      setPeak(result.peak); setPlayback(result.bytes, current.name, true);
      if (save) { abort.current?.signal.throwIfAborted(); setCanCancel(false); setStage('Saving sound version…'); const item = await saveSoundVersion(store, gate, current, result); setLastSaved(item); await refresh(); setNotice(`Saved ${item.name}. This version is ready in the shared sound library.`); }
    }, true);
  }
  async function openProject(next: SoundProject, unsaved = false) { stop(); await editor.open(next, unsaved); await editor.flush(); setSelected(undefined); setSelectedTrack(undefined); setAudioUrl(''); setPeak(undefined); setPlayhead(0); setLastSaved(undefined); const query = new URLSearchParams(); query.set('project', next.id); if (returnTo) query.set('returnTo', returnTo); allowNavigation(() => navigate(`/foley?${query}`, { replace: true })); }
  function placeItem(item: SoundLibraryItem) {
    if (!editor.current.current) throw new Error('Open a cue first.');
    if (editor.current.current.clips.length >= 64) throw new Error('This cue has 64 clips. Remove a clip before adding another.');
    const id = crypto.randomUUID(); editor.edit(draft => { draft.clips.push({ id, name: item.name, assetId: item.assetId, libraryItemId: item.id, trackId: draft.tracks.find(track => track.id === selectedTrack)?.id ?? draft.tracks[0]!.id, start: Math.min(playhead, 299), sourceIn: 0, sourceOut: item.duration, rate: 1, repeats: 1, gainDb: -6, fadeIn: Math.min(.005, item.duration), fadeOut: Math.min(.005, item.duration) }); draft.exportEnd = Math.min(300, Math.max(draft.exportEnd, playhead + item.duration)); }); setSelected(id); setTool('SHAPE');
  }
  function addItem(item: SoundLibraryItem) { void task(async () => { await resolveSound(store, item.id); placeItem(item); }); }
  async function chooseStock(sound: StockSound, add: boolean) {
    await task(async () => {
      const item = await adoptStockSound(store, gate, sound.id, { signal: abort.current?.signal, onProgress: setStage });
      await refresh(); const resolved = await resolveSound(store, item.id);
      if (add) placeItem(item);
      else { const bytes = await store.blobs.get(resolved.asset.path); if (!bytes) throw new Error('This sound is missing. Try loading it again.'); setPlayback(bytes, item.name, false); }
    }, true);
  }
  async function auditionStarter(starter: StarterSound) {
    await task(async () => { const sample = makeSoundProject(starter.name); sample.exportEnd = starter.recipe.duration; sample.clips = [{ id: crypto.randomUUID(), name: starter.name, generator: starter.recipe, trackId: sample.tracks[0]!.id, start: 0, sourceIn: 0, sourceOut: starter.recipe.duration, rate: 1, repeats: 1, gainDb: -6, fadeIn: 0, fadeOut: 0 }]; const rendered = await renderSound(sample, new Map(), { signal: abort.current?.signal, onProgress: (label, fraction) => { setStage(label); setProgress(fraction); } }); setPlayback(rendered.bytes, starter.name, false); }, true);
  }
  function addStarter(starter: StarterSound) {
    if (!project || locked || project.clips.length >= 64) return;
    const id = crypto.randomUUID(); editor.edit(draft => { draft.clips.push({ id, name: starter.name, generator: structuredClone(starter.recipe), trackId: draft.tracks.find(track => track.id === selectedTrack)?.id ?? draft.tracks[0]!.id, start: playhead, sourceIn: 0, sourceOut: starter.recipe.duration, rate: 1, repeats: 1, gainDb: -6, fadeIn: 0, fadeOut: 0 }); draft.exportEnd = Math.min(300, Math.max(draft.exportEnd, playhead + starter.recipe.duration)); }); setSelected(id); setTool('MAKE');
  }
  async function useItem(item: SoundLibraryItem) {
    await task(async () => { await editor.flush(); await resolveSound(store, item.id); stop(); if (returnTo) { allowNavigation(() => navigate(soundReturnUrl(returnTo, item.id))); return; } const [v, p] = await Promise.all([store.showtimeProjects.list(), store.podcastProjects.list()]); setVideos(v); setPodcasts(p); setDestination(item); });
  }
  async function sendTo(kind: 'STINGER' | 'CHATTERBOX', id: string) {
    if (!destination) return;
    await task(async () => { await editor.flush(); const consumer = kind === 'STINGER' ? await store.showtimeProjects.get(id) : await store.podcastProjects.get(id); if (!consumer) throw new Error('That destination project is missing.'); const tracks = (consumer.tracks ?? []).filter(row => !('role' in row) || row.kind === 'AUDIO' && !row.locked); const track = tracks.find(row => row.id === 'a3' || row.kind === 'SFX') ?? tracks[0]; if (!track) throw new Error('Open this project and add an audio track first.'); const request = makeSoundRequest(consumer, track.id, 0); allowNavigation(() => navigate(soundReturnUrl(soundConsumerReturnTo(kind, request), destination.id))); });
  }
  useEffect(() => { if (project && project.revision > 0) setProjects(rows => rows.some(row => row.id === project.id) ? rows.map(row => row.id === project.id ? project : row) : [...rows, project]); }, [project]);
  const pendingAssets = assets.filter(asset => asset.gateStatus === 'QUARANTINED' && items.some(item => item.assetId === asset.id));
  const selectedClip = project?.clips.find(clip => clip.id === selected);
  const activeTool = foleyTools.find(option => option.id === tool)!;
  function chooseTool(next: FoleyTool) { if (locked) return; if (tool === 'RECORD' && next !== 'RECORD') recorder.disable(); setTool(next); }
  const canvasProps = project ? { project, edit: (recipe: (draft: SoundProject) => void) => { stop(); editor.edit(recipe); }, busy: locked, selectedId: selected, onSelect: (id: string) => { setSelected(id); const clip = project.clips.find(row => row.id === id); if (clip) { setSelectedTrack(clip.trackId); if (!['ARRANGE', 'MIX'].includes(tool)) setTool(clip.generator ? 'MAKE' : 'SHAPE'); } }, playhead, onSeek: (at: number) => { setPlayhead(at); if (previewProject.current && player.current) player.current.currentTime = Math.max(0, at - project.exportStart); }, items, trackId: selectedTrack, onTrackSelect: (id: string) => { setSelectedTrack(id); setSelected(undefined); setTool('MIX'); } } : undefined;
  return <main className="foley-workspace foley-palette-workspace" onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); if (!locked) { setTool('SOUNDS'); setImporting([...event.dataTransfer.files]); } }}>
    <header className="foley-topbar"><div className="foley-brand"><RoomIcon kind="sound-console" /><div><h1>Foley</h1><span>Sounds & cues</span></div></div>{project && <label className="foley-name"><span>Your cue</span><input aria-label="Cue project name" value={project.name} maxLength={200} disabled={locked} onChange={event => editor.edit(draft => { draft.name = event.target.value; })} /></label>}<div className="foley-project-control"><button aria-expanded={projectMenu} disabled={locked} onClick={() => setProjectMenu(value => !value)}>Projects</button><small role="status">{editor.status}</small></div></header>
    <input hidden type="file" ref={packInput} accept=".soundpack" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void task(async () => { await editor.flush(); setStage('Opening sound pack…'); await importSoundPack(store, gate, file); await refresh(); setNotice('Sound pack opened. Imported audio needs local adviser review.'); }); }} />
    {projectMenu && project && <section className="foley-project-menu"><fieldset disabled={locked}><label>Open saved cue<select aria-label="Open saved cue" value={projects.some(row => row.id === project.id) ? project.id : ''} onChange={event => { const next = projects.find(row => row.id === event.target.value); if (next) void task(async () => { const saved = await store.soundProjects.get(next.id); if (!saved) throw new Error('This cue is missing. Restore its sound pack.'); await openProject(saved); }); }}><option value="">Current cue</option>{projects.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Story<select aria-label="Cue story" value={project.storyId ?? ''} onChange={event => editor.edit(draft => { if (event.target.value) draft.storyId = event.target.value; else delete draft.storyId; })}><option value="">Club library / no story</option>{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select></label><div className="foley-actions"><button onClick={() => void task(async () => { await openProject(makeSoundProject('Untitled cue', params.storyId), true); setProjectMenu(false); setTool('SOUNDS'); })}>New cue</button><button onClick={() => packInput.current?.click()}>Open sound pack</button><button onClick={() => void task(async () => { await editor.flush(); setStage('Packing sounds and editable projects…'); const pack = await exportSoundPack(store); download(pack.blob, pack.fileName); })}>Save sound pack</button></div></fieldset></section>}
    {(error || editor.error) && <div className="foley-error" role="alert">{error || editor.error}{editor.error && <button disabled={locked} onClick={() => void task(async () => { await editor.flush(); await refresh(); })}>Retry save</button>}</div>}{notice && <div className="foley-notice" role="status">{notice}<button aria-label="Dismiss sound notice" onClick={() => setNotice('')}>Close</button></div>}
    {stage && <LoadingStatus label={stage} progress={progress} />}{busy && canCancel && <button onClick={() => abort.current?.abort()}>Cancel sound job</button>}
    <div className="foley-commandbar"><div className="foley-history"><button disabled={locked || !editor.canUndo} onClick={() => { stop(); editor.undoEdit(); }}><ControlIcon kind="undo" />Undo</button><button disabled={locked || !editor.canRedo} onClick={() => { stop(); editor.redoEdit(); }}><ControlIcon kind="redo" />Redo</button></div><div className="foley-play-controls"><button className="foley-play" disabled={locked || !project?.clips.length} onClick={() => void render(false)}><ControlIcon kind="play" />Play cue</button><button disabled={!playing} onClick={stop}>Stop</button></div><button className="foley-primary" disabled={locked || !project?.clips.length} onClick={() => { setTool('FINISH'); void render(true); }}>Save sound</button></div>
    <div className="foley-easel"><FoleyPalette selected={tool} onSelect={chooseTool} disabled={locked} /><aside className="foley-inspector" aria-label={`${activeTool.label} options`} style={{ '--tool-color': activeTool.color } as React.CSSProperties}><header><FoleyToolIcon tool={tool} /><div><h2>{activeTool.label}</h2><p>{activeTool.hint}</p></div></header>
      <div hidden={tool !== 'SOUNDS'} className="foley-sounds-tool"><div className="foley-shelf-tabs"><button disabled={locked} aria-pressed={soundShelf === 'INCLUDED'} onClick={() => { setSoundShelf('INCLUDED'); setImporting(undefined); }}>Included sounds</button><button disabled={locked} aria-pressed={soundShelf === 'CLUB'} onClick={() => setSoundShelf('CLUB')}>Our sounds</button></div><button className="foley-import-button" disabled={locked} onClick={() => { setSoundShelf('CLUB'); setImporting(current => current ?? []); }}><ControlIcon kind="files" />Import audio<span>Files, folders, or drop them here</span></button>{!importing && soundShelf === 'INCLUDED' && <FoleyStockSounds busy={locked} onListen={sound => void chooseStock(sound, false)} onAdd={sound => void chooseStock(sound, true)} />}{importing ? <FoleyImport initialFiles={importing} onClose={() => setImporting(undefined)} onBusy={setImportBusy} onSaved={() => { void refresh().catch(problem => setError(String(problem))); }} /> : soundShelf === 'CLUB' && <FoleyLibrary items={items} assets={assets} collections={collections} revisions={revisions} busy={locked} onAudition={item => void playItem(item)} onAdd={addItem} onUse={item => void useItem(item)} onEditSource={item => void task(async () => { const revision = item.revisionId ? await store.soundRevisions.get(item.revisionId) : undefined; const original = item.projectId ? await store.soundProjects.get(item.projectId) : undefined; if (!original && !revision) throw new Error('The editable layers are missing. Restore the sound pack.'); const snapshot = revision?.snapshot ?? original!; const fresh = makeSoundProject(`${snapshot.name} · new version`, snapshot.storyId); await openProject({ ...structuredClone(snapshot), id: fresh.id, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt, revision: 0 }, true); })} onUpdate={async item => { await updateSoundItem(store, item); await refresh(); }} onCreateCollection={async name => { if (!name.trim() || name.length > 100) throw new Error('Give the collection a name up to 100 characters.'); await store.soundCollections.create({ name: name.trim() }); await refresh(); }} />}<VideoMediaReview assets={pendingAssets} me={me} onChanged={refresh} /><details className="foley-panel"><summary>Finding free and open-license audio</summary><p>Download an audio file from the source site, then drop it here. Copy the creator, source page and license into the import form. Batch credits apply to several files; choose Different credits for exceptions.</p><p><a href="https://bigsoundbank.com/" target="_blank" rel="noreferrer">BigSoundBank</a> · <a href="https://kenney.nl/assets/category:Audio" target="_blank" rel="noreferrer">Kenney audio</a> · <a href="https://freesound.org/" target="_blank" rel="noreferrer">Freesound</a> · <a href="https://commons.wikimedia.org/wiki/Category:Audio_files" target="_blank" rel="noreferrer">Wikimedia Commons audio</a></p><p>For a larger production library, try the <a href="https://sonniss.com/gameaudiogdc/" target="_blank" rel="noreferrer">Sonniss GDC collection</a>. Download your selections and import them here. Its <a href="https://sonniss.com/gdc-bundle-license/" target="_blank" rel="noreferrer">license</a> allows finished productions, but not redistribution as a sound library.</p><p>Read the individual file’s license. Keep any required attribution and notes about changes. An adviser reviews imported audio before use.</p></details></div>
      <div hidden={tool !== 'RECORD'} className="foley-record-tool"><div className="foley-record-object"><FoleyToolIcon tool="RECORD" /><span>{['RECORDING','PAUSED'].includes(recorder.phase) ? `${recorder.elapsed.toFixed(1)}s` : 'What does it sound like?'}</span></div><label>Recording name<input value={recordingName} maxLength={150} disabled={recording} onChange={event => setRecordingName(event.target.value)} /></label><label>Microphone<select value={recorder.deviceId} disabled={recording} onChange={event => recorder.setDevice(event.target.value)}><option value="">Default microphone</option>{recorder.devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</select></label><div className="foley-actions"><button disabled={locked || !recorder.apiAvailable} onClick={() => void recorder.checkMicrophone()}>Check microphone</button><button disabled={locked || !recorder.apiAvailable} onClick={() => { stop(); void recorder.start(0); }}><ControlIcon kind="record" />Record sound</button>{['RECORDING', 'PAUSED'].includes(recorder.phase) && <button onClick={recorder.pause}>{recorder.phase === 'PAUSED' ? 'Resume' : 'Pause'}</button>}{['RECORDING', 'PAUSED', 'COUNTDOWN'].includes(recorder.phase) && <button onClick={recorder.stop}>Stop & save recording</button>}{recorder.phase === 'READY' && <button onClick={recorder.disable}>Release microphone</button>}</div>{recorder.phase !== 'OFF' && <p role="status">{recorder.phase.toLowerCase()} · {recorder.elapsed.toFixed(1)} seconds · input {recorder.level.toFixed(0)} dB</p>}{recorder.error && <p role="alert">{recorder.error}</p>}{recoveryTake && <div className="foley-actions"><button disabled={recording || busy} onClick={() => void task(async () => capture(recoveryTake))}>Retry saving recording</button><button onClick={() => download(recoveryTake.blob, 'recovered-foley-recording.webm')}>Download recovery recording</button><button onClick={() => { if (window.confirm('Discard this unsaved recording? Download it or retry saving first if you want to keep it.')) setRecoveryTake(undefined); }}>Discard unsaved recording</button></div>}</div>
      {tool === 'MAKE' && <div className="foley-make-tool">{selectedClip?.generator && canvasProps ? <><button className="foley-back-to-starters" onClick={() => setSelected(undefined)}>Start another sound</button><FoleyToolOptions {...canvasProps} tool="MAKE" /></> : <><p>Make a tone or texture from scratch. For recorded effects and finished cues, choose Sounds.</p><div className="foley-starters">{[starterSounds[0]!, starterSounds[10]!].map(starter => ({ ...starter, name: starter.recipe.kind === 'NOISE' ? 'Air & texture' : 'Clear tone' })).map(starter => <article key={starter.name}><strong>{starter.name}</strong><small>{starter.recipe.duration} seconds</small><div className="foley-actions"><button disabled={locked} aria-label={`Listen to ${starter.name}`} onClick={() => void auditionStarter(starter)}><ControlIcon kind="play" />Listen</button><button disabled={locked || !project || project.clips.length >= 64} aria-label={`Add ${starter.name}`} onClick={() => addStarter(starter)}>Add</button></div></article>)}</div></>}</div>}
      {canvasProps && ['ARRANGE','SHAPE','MIX'].includes(tool) && <FoleyToolOptions {...canvasProps} tool={tool} />}
      {tool === 'FINISH' && project && canvasProps && <div className="foley-finish-tool"><h3>Ready to leave the palette?</h3><p>Save a sound version for Stinger or Chatterbox. Your editable layers stay here.</p><button className="foley-primary" disabled={locked || !project.clips.length} onClick={() => void render(true)}>Save sound version</button>{lastSaved && <button disabled={locked} onClick={() => void useItem(lastSaved)}>Use saved sound</button>}{audioUrl && previewProject.current && <a className="foley-download" href={audioUrl} download={`${audioName.replace(/[^a-z0-9 _-]/gi, '').slice(0, 80) || 'foley-cue'}.wav`}>Download this WAV</a>}<details><summary>Who made it?</summary><label>Members & contributions<textarea aria-label="Cue project credits" rows={5} maxLength={10000} value={project.credits} disabled={locked} onChange={event => editor.edit(draft => { draft.credits = event.target.value; })} placeholder={'Avery — sound recording\nJordan — cue arrangement'} /></label><p>Source credits stay attached to imported sounds.</p></details><FoleyToolOptions {...canvasProps} tool="FINISH" /><button disabled={locked} onClick={() => void task(async () => { await editor.flush(); const pack = await exportSoundPack(store); download(pack.blob, pack.fileName); })}>Save editable sound pack</button></div>}
    </aside><section className="foley-sound-paper" aria-label="Sound canvas">{project && canvasProps ? <>{!project.clips.length && <div className="foley-first-sound"><div className="foley-first-marks" aria-hidden="true"><FoleyToolIcon tool="MAKE" /><FoleyToolIcon tool="SOUNDS" /></div><h2>A sound is a starting point.</h2><p>Bring one in. Try a little change. Listen.</p><div className="foley-actions"><button onClick={() => { setTool('SOUNDS'); setImporting([]); }}>Import a sound</button><button onClick={() => { setTool('SOUNDS'); setSoundShelf('INCLUDED'); }}>Browse included sounds</button></div></div>}<FoleyCanvas {...canvasProps} />{audioUrl && <div className="foley-player"><strong>{audioName}</strong><audio ref={player} src={audioUrl} controls autoPlay onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => { if (previewProject.current && player.current) setPlayhead(project.exportStart + player.current.currentTime); }} /></div>}{peak !== undefined && <small className={`foley-meter-readout ${peak > 1 ? 'foley-error' : ''}`}>{peak > 1 ? 'A little loud: lower a layer in Mix.' : 'Room to breathe.'} Peak {peak > 0 ? (20 * Math.log10(peak)).toFixed(1) : '−∞'} dB</small>}</> : !error && <LoadingStatus label="Opening your sound canvas…" />}</section></div>
    {destination && <section className="foley-panel" aria-label="Choose sound destination"><h2>Use {destination.name}</h2><p>Choose a saved project. It opens with a placement review; you can move the sound there.</p><div className="foley-actions">{videos.map(video => <button key={video.id} disabled={locked} onClick={() => void sendTo('STINGER', video.id)}>Stinger: {video.title}</button>)}{podcasts.map(podcast => <button key={podcast.id} disabled={locked} onClick={() => void sendTo('CHATTERBOX', podcast.id)}>Chatterbox: {podcast.title}</button>)}<button onClick={() => setDestination(undefined)}>Close destinations</button></div>{!videos.length && !podcasts.length && <p>Create a video in Stinger or an episode in Chatterbox, then choose Add sound there. This sound is already in the shared library.</p>}</section>}
  </main>;
}
