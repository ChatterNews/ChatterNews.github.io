import { validateSoundLineage } from '../audio/sound-handoff.js';
import { SoundConsumerTools } from '../components/SoundConsumerTools.js';
import { lazy, Suspense } from 'react';
import { ControlIcon } from '../components/ControlIcon.js';
import { LoadingStatus } from '../components/LoadingStatus.js';
import { useStore } from '../store/StoreProvider.js';
import { paintShowtimeTitle, drawShowtimeClip, showtimeRenderStack, showtimeGainAt } from '../video/renderShowtime.js';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  withVideoEndCredits, makeVideoGraphic, videoGraphicAssetIds, retimeMotionScene, type MotionBindings, type MotionPackage, type Story, type User,
  connectShowtimeClip, defaultShowtimeTitle, insertShowtimePrimary, makeShowtimeClip, moveShowtimeClip,
  normalizeShowtimeProject, overwriteShowtimePrimary, rippleDeleteShowtimeClip,
  showtimeClipDuration, showtimeClipEnd, showtimeClipStart, showtimeDuration, splitShowtimeAt,
  trimShowtimeClip, type Asset, type ShowtimeClip, type ShowtimeCutFinding, type ShowtimeProject,
  type ShowtimeTitle, type ShowtimeTrack,
} from '@chatter/shared';
import { ShowtimeCutCheck } from './ShowtimeProgramGuide.js';

const GraphicDesigner = lazy(() => import('./Stinger.js').then(module => ({ default: module.Stinger })));

type Notice = { text: string; error?: boolean };
type DragMode = 'MOVE' | 'TRIM_IN' | 'TRIM_OUT';

export interface ShowtimeCutWorkspaceProps {
  project: ShowtimeProject;
  assets: Asset[];
  urls: Map<string, string>;
  assetDurations: Map<string, number>;
  assetFrames: Map<string, { width: number; height: number }>;
  findings: ShowtimeCutFinding[];
  initialGraphicId?: string;
  storyTitle?: string;
  byline?: string;
  onCommit: (recipe: (draft: ShowtimeProject) => void) => void;
  onShoot: () => void;
  onImport?: () => void;
  onSourceSelected?: (assetId?: string) => void;
  onFlush?: () => Promise<void>;
  onReload?: () => Promise<unknown>;
  busy?: boolean;
  mediaLoading?: boolean;
  stories?: Story[];
  me?: User;
  onNotice: (notice: Notice) => void;
  onReilyFocusChange?: (selectedTitleKind?: ShowtimeTitle['kind']) => void;
}

function time(value: number, precise = false): string {
  const safe = Math.max(0, value); const minutes = Math.floor(safe / 60); const seconds = Math.floor(safe % 60);
  if (!precise) return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(Math.floor((safe % 1) * 10))}`;
}

function snap(value: number, project: ShowtimeProject, exceptId?: string): number {
  const points = [0, showtimeDuration(project), ...project.clips.flatMap((clip) => clip.id === exceptId ? [] : [showtimeClipStart(project, clip), showtimeClipEnd(project, clip)]), ...project.titles.flatMap((title) => [title.startSec, title.endSec])];
  const nearest = points.reduce((best, point) => Math.abs(point - value) < Math.abs(best - value) ? point : best, value);
  return Math.abs(nearest - value) <= .18 ? nearest : Math.round(value * 10) / 10;
}

function sourceAt(project: ShowtimeProject, clip: ShowtimeClip, sequenceAt: number): number {
  return clip.trimInSec + Math.max(0, sequenceAt - showtimeClipStart(project, clip)) * clip.speed;
}

function trackIcon(track: ShowtimeTrack): string {
  if (track.role === 'PRIMARY') return '▣'; if (track.kind === 'VIDEO') return '◇'; if (track.kind === 'TITLE') return 'T';
  if (track.role === 'VOICE') return '◉'; if (track.role === 'MUSIC') return '♫'; return '✦';
}

export function ShowtimeCutWorkspace(props: ShowtimeCutWorkspaceProps) {
  const store = useStore();
  const [graphicSession, setGraphicSession] = useState<{ titleId?: string; packageId?: string; placementId: string; at: number }>();
  const initialGraphicOpened = useRef(false);
  useEffect(() => { if (props.initialGraphicId && !initialGraphicOpened.current) { initialGraphicOpened.current = true; setGraphicSession({ packageId: props.initialGraphicId, placementId: crypto.randomUUID(), at: 0 }); } }, [props.initialGraphicId]);
  const [graphicImages, setGraphicImages] = useState<Map<string, CanvasImageSource>>(new Map());
  const [openingGraphic, setOpeningGraphic] = useState(false);
  const project = useMemo(() => normalizeShowtimeProject(props.project), [props.project]);
  const duration = showtimeDuration(project); const tracks = project.tracks ?? [];
  const [selectedAssetId, setSelectedAssetId] = useState<string>(); const [selectedClipId, setSelectedClipId] = useState<string>(); const [selectedTitleId, setSelectedTitleId] = useState<string>();
  const [sourceIn, setSourceIn] = useState(0); const [sourceOut, setSourceOut] = useState(0); const [sourceTime, setSourceTime] = useState(0);
  const [playhead, setPlayhead] = useState(0); const [playing, setPlaying] = useState(false); const [zoom, setZoom] = useState(52); const [timelineOffset, setTimelineOffset] = useState(0);
  const [undo, setUndo] = useState<ShowtimeProject[]>([]); const [redo, setRedo] = useState<ShowtimeProject[]>([]);
  const sourceVideo = useRef<HTMLVideoElement>(null); const sourceAudio = useRef<HTMLAudioElement>(null); const programCanvas = useRef<HTMLCanvasElement>(null); const mediaElements = useRef<Map<string, HTMLMediaElement>>(new Map()); const timelineScroll = useRef<HTMLDivElement>(null);
  const selectedAssetRecord = props.assets.find((asset) => asset.id === selectedAssetId); const selectedAsset = selectedAssetRecord ? { ...selectedAssetRecord, fileName: selectedAssetRecord.creator || `${selectedAssetRecord.kind === 'AUDIO' ? 'Sound' : 'Shot'} ${Math.max(1, props.assets.findIndex((asset) => asset.id === selectedAssetRecord.id) + 1)}` } : undefined; const selectedClip = project.clips.find((clip) => clip.id === selectedClipId); const selectedTitle = project.titles.find((title) => title.id === selectedTitleId);

  useEffect(() => { props.onSourceSelected?.(selectedAssetId); }, [selectedAssetId, props.onSourceSelected]);
  useEffect(() => { if (!selectedAssetId && props.assets[0]) setSelectedAssetId(props.assets[0].id); }, [props.assets, selectedAssetId]);
  useEffect(() => { props.onReilyFocusChange?.(selectedTitle?.kind); }, [props.onReilyFocusChange, selectedTitle?.kind]);
  useEffect(() => () => props.onReilyFocusChange?.(undefined), [props.onReilyFocusChange]);
  const sourceDuration = selectedAssetId ? props.assetDurations.get(selectedAssetId) ?? 0 : 0;
  useEffect(() => { const total = sourceDuration; setSourceIn(0); setSourceOut(total); setSourceTime(0); }, [selectedAssetId, sourceDuration]);
  useEffect(() => { const element = sourceAudio.current; if (!element || selectedAsset?.kind !== 'AUDIO') return; const loaded = () => setSourceOut((value) => value || (Number.isFinite(element.duration) ? element.duration : 0)); element.addEventListener('loadedmetadata', loaded); if (element.readyState >= 1) loaded(); return () => element.removeEventListener('loadedmetadata', loaded); }, [selectedAsset?.id, selectedAsset?.kind]);
  useEffect(() => { setUndo([]); setRedo([]); setSelectedClipId(undefined); setSelectedTitleId(undefined); setPlayhead(0); setPlaying(false); }, [project.id]);

  useEffect(() => { if (props.busy) setPlaying(false); }, [props.busy]);

  const replace = useCallback((next: ShowtimeProject, remember = true) => {
    if (remember) { setUndo((rows) => [...rows.slice(-39), structuredClone(project)]); setRedo([]); }
    props.onCommit((draft) => Object.assign(draft, structuredClone(next)));
  }, [project, props]);

  const edit = useCallback((recipe: (draft: ShowtimeProject) => void) => {
    const next = structuredClone(project); recipe(next); next.updatedAt = Date.now(); replace(next);
  }, [project, replace]);

  function undoEdit() {
    const previous = undo.at(-1); if (!previous) return; setRedo((rows) => [...rows, structuredClone(project)]); setUndo((rows) => rows.slice(0, -1)); replace(previous, false);
  }
  function redoEdit() {
    const next = redo.at(-1); if (!next) return; setUndo((rows) => [...rows, structuredClone(project)]); setRedo((rows) => rows.slice(0, -1)); replace(next, false);
  }

  function sourceElement(): HTMLMediaElement | null { return selectedAsset?.kind === 'AUDIO' ? sourceAudio.current : sourceVideo.current; }
  function sourceMark(kind: 'IN' | 'OUT') {
    const element = sourceElement(); if (!element) return; const at = Math.max(0, element.currentTime);
    if (kind === 'IN') setSourceIn(Math.min(at, Math.max(0, sourceOut - .04))); else setSourceOut(Math.max(at, sourceIn + .04));
  }

  function sourceClip(): ShowtimeClip | undefined {
    if (!selectedAsset || !sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0) return undefined; const fullDuration = props.assetDurations.get(selectedAsset.id) || sourceOut || 5; const frame = props.assetFrames.get(selectedAsset.id);
    return { ...makeShowtimeClip({ assetId: selectedAsset.id, name: selectedAsset.creator || (selectedAsset.kind === 'AUDIO' ? 'Audio clip' : 'Video clip'), durationSec: fullDuration, mediaKind: selectedAsset.kind === 'AUDIO' ? 'AUDIO' : 'VIDEO', ...(frame ?? {}) }), trimInSec: sourceIn, trimOutSec: Math.max(sourceIn + .04, sourceOut || fullDuration) };
  }

  function addSource(action: 'INSERT' | 'OVERWRITE' | 'OVERLAY' | 'APPEND' | 'a1' | 'a2' | 'a3') {
    const clip = sourceClip(); if (!clip) return;
    let next: ShowtimeProject;
    if (action === 'INSERT') next = insertShowtimePrimary(project, clip, playhead);
    else if (action === 'OVERWRITE') next = overwriteShowtimePrimary(project, clip, playhead);
    else if (action === 'APPEND') {
      const primaryEnd = project.clips.filter((item) => item.trackId === 'v1').reduce((maximum, item) => Math.max(maximum, showtimeClipEnd(project, item)), 0);
      next = insertShowtimePrimary(project, clip, primaryEnd);
    } else next = connectShowtimeClip(project, clip, action === 'OVERLAY' ? 'v2' : action, playhead);
    replace(next); setSelectedClipId(clip.id); setSelectedTitleId(undefined);
  }

  useEffect(() => {
    let alive = true;
    void Promise.all(videoGraphicAssetIds(project.titles).map(async id => {
      const url = props.urls.get(id); if (!url) return undefined;
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
      return [id, image] as const;
    })).then(rows => { if (alive) setGraphicImages(new Map(rows.filter((row): row is readonly [string, HTMLImageElement] => !!row))); })
      .catch(() => { if (alive) props.onNotice({ text: 'A graphic image did not load. Check its media approval and retry.', error: true }); });
    return () => { alive = false; };
  }, [project.titles, props.urls]);

  async function openGraphic(title?: ShowtimeTitle) {
    if (props.busy || openingGraphic) return;
    setPlaying(false); setOpeningGraphic(true);
    try {
      let packageId: string | undefined;
      if (title?.motion) {
        const { id, createdAt, updatedAt, ...copy } = structuredClone(title.motion);
        const saved = await store.motionPackages.create({ ...copy, storyId: project.storyId });
        packageId = saved.id;
      }
      setGraphicSession({ titleId: title?.id, placementId: title?.id ?? crypto.randomUUID(), packageId, at: title?.startSec ?? playhead });
    } catch { props.onNotice({ text: 'The graphic designer could not open. Your timeline is unchanged.', error: true }); }
    finally { setOpeningGraphic(false); }
  }
  async function useGraphic(kit: MotionPackage, sceneId: string, bindings: MotionBindings) {
    if (!graphicSession) return;
    const title = makeVideoGraphic(kit, sceneId, graphicSession.at, bindings);
    const cueId = kit.scenes.find(scene => scene.id === sceneId)?.audioAssetId;
    const cue = cueId && props.assets.find(asset => asset.id === cueId && asset.kind === 'AUDIO');
    if (cueId && !cue) throw new Error('Approve the graphic’s sound cue and bring it into this project before adding the graphic.');
    title.id = graphicSession.placementId;
    edit(draft => {
      if (graphicSession.titleId) {
        const index = draft.titles.findIndex(item => item.id === graphicSession.titleId);
        if (index < 0) throw new Error('This title was removed. Add the graphic again.');
        title.id = graphicSession.titleId; title.projectCredits = draft.titles[index]!.projectCredits; draft.titles[index] = title;
      } else { const index = draft.titles.findIndex(item => item.id === title.id); if (index >= 0) draft.titles[index] = title; else draft.titles.push(title); }
      if (cue) { draft.clips = draft.clips.filter(clip => clip.id !== `cue-${title.id}`); draft.clips.push({ ...makeShowtimeClip({ assetId: cue.id, name: 'Graphic sound cue', durationSec: props.assetDurations.get(cue.id) || (title.endSec - title.startSec), mediaKind: 'AUDIO' }), id: `cue-${title.id}`, trackId: 'a3', startSec: title.startSec }); }
    });
    await props.onFlush?.();
    setSelectedTitleId(title.id); setSelectedClipId(undefined); setPlayhead(title.startSec + Math.min(.8, (title.endSec - title.startSec) / 2)); setGraphicSession(undefined);
    props.onNotice({ text: 'Graphic saved on the title track. Select it to change its words, timing, or design.' });
  }

  const paintProgram = useCallback((at: number) => {
    const canvas = programCanvas.current; if (!canvas) return; if (canvas.width !== project.width || canvas.height !== project.height) { canvas.width = project.width; canvas.height = project.height; }
    const context = canvas.getContext('2d'); if (!context) return; context.fillStyle = '#08070b'; context.fillRect(0, 0, canvas.width, canvas.height);
    const trackMap = new Map(tracks.map((track) => [track.id, track]));
    for (const clip of showtimeRenderStack(project, at)) {
      const element = mediaElements.current.get(clip.id);
      if (element instanceof HTMLVideoElement && element.readyState >= 2) {
        const local = at - showtimeClipStart(project, clip);
        const fraction = clip.transitionSec > 0 && local < clip.transitionSec ? Math.max(0, local / clip.transitionSec) : 1;
        const opacity = clip.trackId === 'v1' && clip.transition !== 'CUT' ? (clip.transition === 'DIP_BLACK' ? Math.max(0, (fraction - .5) * 2) : fraction) : 1;
        drawShowtimeClip(context, element, clip, canvas.width, canvas.height, opacity);
      }
    }
    if (!trackMap.get('t1')?.hidden) for (const title of project.titles) {
      if (at >= title.startSec && at < title.endSec) paintShowtimeTitle(context, title, canvas.width, canvas.height, at, graphicImages);
    }
  }, [project, tracks, graphicImages]);

  const syncProgram = useCallback((at: number, shouldPlay: boolean) => {
    const trackMap = new Map(tracks.map((track) => [track.id, track]));
    for (const clip of project.clips) {
      const element = mediaElements.current.get(clip.id); if (!element) continue; const track = trackMap.get(clip.trackId ?? 'v1'); const active = at >= showtimeClipStart(project, clip) && at < showtimeClipEnd(project, clip) && !track?.hidden;
      if (!active) { element.pause(); continue; }
      const wanted = sourceAt(project, clip, at); if (Number.isFinite(wanted) && Math.abs(element.currentTime - wanted) > .12) element.currentTime = Math.max(0, wanted);
      element.playbackRate = clip.speed; element.volume = Math.min(1, showtimeGainAt(project, clip, at));
      if (shouldPlay) void element.play().catch(() => undefined); else element.pause();
    }
    paintProgram(at);
  }, [paintProgram, project, tracks]);

  useEffect(() => { if (playing) return; syncProgram(playhead, false); }, [playhead, playing, syncProgram]);
  useEffect(() => {
    if (!playing) return; const began = performance.now(); const from = playhead; let frame = 0;
    const tick = (now: number) => { const next = from + (now - began) / 1000; if (next >= duration) { setPlayhead(duration); setPlaying(false); syncProgram(duration, false); return; } setPlayhead(next); syncProgram(next, true); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, duration, syncProgram]);

  function splitSelected() {
    if (!selectedClipId) return; const next = splitShowtimeAt(project, selectedClipId, playhead);
    if (!next) { props.onNotice({ text: 'Put the Program playhead inside the selected clip, then split.', error: true }); return; }
    const right = next.clips.find((clip) => clip.id !== selectedClipId && showtimeClipStart(next, clip) === playhead); replace(next); setSelectedClipId(right?.id);
  }

  function deleteSelected() {
    if (selectedClipId) { replace(rippleDeleteShowtimeClip(project, selectedClipId)); setSelectedClipId(undefined); }
    else if (selectedTitleId) { edit((draft) => { draft.titles = draft.titles.filter((title) => title.id !== selectedTitleId); }); setSelectedTitleId(undefined); }
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (props.busy || graphicSession || openingGraphic) return;
      const target = event.target as HTMLElement | null; if (target?.matches('input, select, textarea, [contenteditable="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redoEdit(); else undoEdit(); return; }
      if (event.key === ' ') { event.preventDefault(); setPlaying((value) => !value); }
      else if (event.key.toLowerCase() === 'i') sourceMark('IN'); else if (event.key.toLowerCase() === 'o') sourceMark('OUT');
      else if (event.key.toLowerCase() === 's') splitSelected(); else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });

  function dragClip(event: ReactPointerEvent, clip: ShowtimeClip, mode: DragMode) {
    event.preventDefault(); event.stopPropagation(); const startX = event.clientX; const original = structuredClone(clip); let moved = false;
    const finish = (up: PointerEvent) => {
      window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); const delta = (up.clientX - startX) / zoom; if (Math.abs(delta) < .04) return; moved = true;
      if (mode === 'MOVE') replace(moveShowtimeClip(project, clip.id, snap(showtimeClipStart(project, clip) + delta, project, clip.id)));
      else if (mode === 'TRIM_IN') replace(trimShowtimeClip(project, clip.id, { trimInSec: original.trimInSec + delta * original.speed }));
      else replace(trimShowtimeClip(project, clip.id, { trimOutSec: original.trimOutSec + delta * original.speed }));
    };
    window.addEventListener('pointerup', finish, { once: true }); window.addEventListener('pointercancel', finish, { once: true });
    window.setTimeout(() => { if (!moved) setSelectedClipId(clip.id); }, 0);
  }

  function updateClip(patch: Partial<ShowtimeClip>) { if (!selectedClipId) return; edit((draft) => { const clip = draft.clips.find((item) => item.id === selectedClipId); if (clip) Object.assign(clip, patch); }); }
  function updateTitle(patch: Partial<ShowtimeTitle>) { if (!selectedTitleId) return; edit((draft) => { const title = draft.titles.find((item) => item.id === selectedTitleId); if (title) Object.assign(title, patch); }); }
  function updateTrack(trackId: string, patch: Partial<ShowtimeTrack>) { edit((draft) => { const track = draft.tracks?.find((item) => item.id === trackId); if (track) Object.assign(track, patch); }); }
  function addTitle() { const title = { ...defaultShowtimeTitle(props.storyTitle ?? project.title, props.byline ?? ''), startSec: playhead, endSec: playhead + 5 }; edit((draft) => draft.titles.push(title)); setSelectedTitleId(title.id); setSelectedClipId(undefined); }

  function addEndCredits() {
    try {
      const next = withVideoEndCredits(project);
      replace(next);
      const card = next.titles.find(title => title.projectCredits !== undefined)!;
      setSelectedTitleId(card.id); setSelectedClipId(undefined); setPlaying(false); setPlayhead(card.startSec + .8);
      props.onNotice({ text: 'End credits added after the edit. Select a card to adjust its timing or graphic design.' });
    } catch (error) { props.onNotice({ text: error instanceof Error ? error.message : 'Credits could not be added.', error: true }); }
  }

  const timelineWidth = Math.max(900, duration * zoom + 160); const tickEvery = zoom >= 70 ? 1 : zoom >= 38 ? 5 : 10; const ticks = Array.from({ length: Math.ceil(Math.max(duration, 10) / tickEvery) + 1 }, (_, index) => index * tickEvery);
  const sourceUrl = selectedAssetId ? props.urls.get(selectedAssetId) : undefined;

  return <><fieldset className="video-edit-lock" disabled={props.busy || !!graphicSession || openingGraphic}><div className="showtime-cut showtime-magnetic-editor">
    <SoundConsumerTools project={project} kind="STINGER" at={playhead} trackId={selectedClip?.mediaKind === 'AUDIO' ? selectedClip.trackId : undefined} selectedClipId={selectedClipId} busy={props.busy} onCommit={edit} onFlush={props.onFlush ?? (() => Promise.resolve())} onReload={props.onReload ?? (() => Promise.resolve())} onNotice={props.onNotice} />
    <details className="video-project-credits"><summary>Project credits · {project.credits?.trim() ? 'Edit members and contributions' : 'Add your crew'}</summary>
      <label>Project credits<textarea aria-label="Project credits" rows={5} maxLength={10000} value={project.credits ?? ''} placeholder={'Name — reporting\nName — camera\nName — editing'} onChange={event => edit(draft => { draft.credits = event.target.value; })} /></label>
      <p>One member and contribution per line. These credits save with this video. Update the end cards after changing this field; updating rebuilds their text and design.</p>
      <button disabled={!project.credits?.trim()} onClick={addEndCredits}>{project.titles.some(title => title.projectCredits !== undefined) ? 'Update end credits' : 'Add end credits'}</button>
    </details>
    <div className="showtime-cut-top">
      <aside className="showtime-bin"><header><div><span className="showtime-kicker">MEDIA</span><h2>Story bin</h2></div><button onClick={props.onShoot}>Record</button>{props.onImport && <button onClick={props.onImport}>Import media</button>}</header>{props.assets.length ? <div>{props.assets.map((asset, index) => <button key={asset.id} aria-pressed={selectedAssetId === asset.id} onClick={() => setSelectedAssetId(asset.id)}><span>{asset.kind === 'AUDIO' ? '♫' : '▶'}</span><div><b>{asset.creator || `${asset.kind === 'AUDIO' ? 'Sound' : 'Shot'} ${index + 1}`}</b><small>{Math.round(asset.bytes / 1024)} KB · {asset.kind.toLowerCase()}</small></div></button>)}</div> : <p className="showtime-empty-small">Import footage or sound, or record in Showtime. Choose a source, mark the part you want, then add it to a track.</p>}</aside>

      <section className="showtime-monitor source"><header><span>SOURCE</span><b>{selectedAsset?.creator || selectedAsset?.fileName || 'Choose media from the bin'}</b></header><div className="showtime-source-stage">{selectedAsset && !sourceUrl && (props.mediaLoading ? <LoadingStatus label="Preparing source preview…" /> : <p className="video-source-unavailable">This source is unavailable here. Check its approval or import it again.</p>)}{selectedAsset?.kind === 'AUDIO' ? <audio ref={sourceAudio} controls src={sourceUrl} onTimeUpdate={(event) => setSourceTime(event.currentTarget.currentTime)} /> : <video ref={sourceVideo} controls playsInline src={sourceUrl} onTimeUpdate={(event) => setSourceTime(event.currentTarget.currentTime)} onLoadedMetadata={(event) => { if (!sourceOut) setSourceOut(event.currentTarget.duration || 0); }} />}</div><footer className="showtime-source-controls"><div><button disabled={!selectedAsset || !sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0} onClick={() => sourceMark('IN')}>I · Set In</button><button disabled={!selectedAsset || !sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0} onClick={() => sourceMark('OUT')}>O · Set Out</button><span>{time(sourceIn, true)} → {time(sourceOut, true)}</span></div>{selectedAsset?.kind === 'AUDIO' ? <div className="showtime-edit-choice"><button disabled={!sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0} onClick={() => addSource('a1')}>＋ Voice</button><button disabled={!sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0} onClick={() => addSource('a2')}>＋ Music</button><button disabled={!sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0} onClick={() => addSource('a3')}>＋ Sounds</button></div> : <div className="showtime-edit-choice"><button disabled={!selectedAsset || !sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0} onClick={() => addSource('INSERT')}>Insert</button><button disabled={!selectedAsset || !sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0} onClick={() => addSource('OVERWRITE')}>Overwrite</button><button disabled={!selectedAsset || !sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0} onClick={() => addSource('OVERLAY')}>Place on top</button><button disabled={!selectedAsset || !sourceUrl || !Number.isFinite(sourceOut) || sourceOut <= 0} onClick={() => addSource('APPEND')}>Append</button></div>}<small>Source {time(sourceTime, true)} · I and O mark the part you want.</small></footer></section>

      <section className="showtime-monitor program"><header><span>PROGRAM</span><b>{time(playhead, true)} / {time(duration, true)}</b></header><div className="showtime-program-video"><canvas ref={programCanvas} /></div><footer className="showtime-program-controls"><button disabled={!project.clips.length} onClick={() => { if (playing) { setPlaying(false); return; } void validateSoundLineage(store, project.clips).then(() => setPlaying(true)).catch(error => props.onNotice({ text: error instanceof Error ? error.message : 'Sound sources could not be checked.', error: true })); }}><ControlIcon kind={playing ? "pause" : "play"} />{playing ? "Pause" : "Play"}</button><input aria-label="Program playhead" type="range" min={0} max={Math.max(.01, duration)} step={.01} value={Math.min(playhead, duration)} onChange={(event) => { setPlaying(false); setPlayhead(Number(event.target.value)); }} /><button onClick={() => { setPlaying(false); setPlayhead(0); }}>Start</button><button onClick={() => { setPlaying(false); setPlayhead(duration); }}>End</button></footer></section>
    </div>

    <div className="showtime-edit-tools"><button disabled={!undo.length} onClick={undoEdit}><ControlIcon kind="undo" /> Undo</button><button disabled={!redo.length} onClick={redoEdit}><ControlIcon kind="redo" /> Redo</button><span className="showtime-tool-divider" /><button onClick={addTitle}>Add text</button><button disabled={openingGraphic} onClick={() => void openGraphic()}>Add graphic</button><button disabled={!selectedClip} onClick={splitSelected}><ControlIcon kind="cut" /> Split <kbd>S</kbd></button><button disabled={!selectedClip && !selectedTitle} onClick={deleteSelected}>Delete</button><span className="showtime-duration">{project.clips.length} clips · {time(duration)}</span><label className="showtime-zoom">Zoom <input type="range" min={22} max={120} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label></div>

    <div className="showtime-timeline-shell">
      <div className="showtime-track-corner"><b>TRACKS</b><small>Click a lane to cue</small></div>
      <div className="showtime-timeline-scroll" ref={timelineScroll} onScroll={(event) => setTimelineOffset(event.currentTarget.scrollLeft)}>
        <div className="showtime-ruler" style={{ width: timelineWidth }} onPointerDown={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setPlaying(false); setPlayhead(Math.max(0, Math.min(duration, (event.clientX - rect.left) / zoom))); }}>{ticks.map((tick) => <span key={tick} style={{ left: tick * zoom }}>{time(tick)}</span>)}<i className="showtime-playhead" style={{ left: playhead * zoom }} /></div>
      </div>
      <div className="showtime-track-stack">
        {tracks.map((track) => <div className={`showtime-track-row ${track.kind.toLowerCase()} ${track.role.toLowerCase()}`} key={track.id}>
          <div className="showtime-track-head"><span>{trackIcon(track)}</span><label><b>{track.id.toUpperCase()}</b><input aria-label={`${track.id} track name`} value={track.name} onChange={(event) => updateTrack(track.id, { name: event.target.value })} /></label><div><button title="Mute track" aria-pressed={track.muted} onClick={() => updateTrack(track.id, { muted: !track.muted })}>Mute</button><button title="Lock track" aria-pressed={track.locked} onClick={() => updateTrack(track.id, { locked: !track.locked })}>Lock</button>{track.kind !== 'AUDIO' && <button title="Show or hide track" aria-pressed={!track.hidden} onClick={() => updateTrack(track.id, { hidden: !track.hidden })}>Show</button>}</div></div>
          <div className="showtime-track-viewport" onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button')) return; const rect = event.currentTarget.getBoundingClientRect(); setPlaying(false); setPlayhead(Math.max(0, Math.min(duration, (event.clientX - rect.left + timelineOffset) / zoom))); }}><div className="showtime-track-lane" style={{ width: timelineWidth, transform: `translateX(${-timelineOffset}px)` }}><i className="showtime-playhead" style={{ left: playhead * zoom }} />{track.kind === 'TITLE' ? project.titles.map((title) => <button className="showtime-title-clip" key={title.id} aria-pressed={selectedTitleId === title.id} style={{ left: title.startSec * zoom, width: Math.max(34, (title.endSec - title.startSec) * zoom), background: title.background, color: title.color }} onClick={() => { setSelectedTitleId(title.id); setSelectedClipId(undefined); setPlayhead(title.startSec); }}>{title.text}</button>) : project.clips.filter((clip) => clip.trackId === track.id).map((clip) => <button className={`showtime-timeline-clip ${clip.mediaKind === 'AUDIO' ? 'audio' : 'video'}`} key={clip.id} aria-pressed={selectedClipId === clip.id} style={{ left: showtimeClipStart(project, clip) * zoom, width: Math.max(38, showtimeClipDuration(clip) * zoom) }} onPointerDown={(event) => !track.locked && dragClip(event, clip, 'MOVE')} onClick={() => { setSelectedClipId(clip.id); setSelectedTitleId(undefined); }}><i className="trim in" title="Trim start" onPointerDown={(event) => !track.locked && dragClip(event, clip, 'TRIM_IN')} /><span><small>{clip.mediaKind === 'AUDIO' ? 'WAVE' : clip.trackId === 'v1' ? 'STORY' : 'B-ROLL'}</small><b>{clip.name}</b><em>{time(showtimeClipDuration(clip), true)}</em></span><i className="trim out" title="Trim end" onPointerDown={(event) => !track.locked && dragClip(event, clip, 'TRIM_OUT')} /></button>)}</div></div>
        </div>)}
      </div>
    </div>

    <div className="showtime-magnetic-hint"><b>MAGNETIC STORYLINE</b><span>V1 closes its own gaps. Clips above and below stay attached when the story moves.</span><span><kbd>Space</kbd> play · <kbd>I</kbd>/<kbd>O</kbd> marks · <kbd>S</kbd> split · <kbd>⌘Z</kbd> undo</span></div>
    <ShowtimeCutCheck findings={props.findings} onSelect={(finding) => { if (finding.clipId) { const clip = project.clips.find((item) => item.id === finding.clipId); setSelectedClipId(finding.clipId); setSelectedTitleId(undefined); if (clip) setPlayhead(showtimeClipStart(project, clip)); } else if (finding.titleId) { const title = project.titles.find((item) => item.id === finding.titleId); setSelectedTitleId(finding.titleId); setSelectedClipId(undefined); if (title) setPlayhead(title.startSec); } else if (finding.railId) { const rail = project.programPlan?.rails.find((item) => item.id === finding.railId); setPlayhead(Math.min(duration, rail?.startSec ?? duration)); } }} />

    <div className="showtime-inspector">{selectedClip ? <><header><span>{selectedClip.trackId?.toUpperCase()} CLIP</span><h2>{selectedClip.name}</h2></header><div className="showtime-inspector-grid"><label>Name<input value={selectedClip.name} onChange={(event) => updateClip({ name: event.target.value })} /></label><label>Starts<input type="number" min={0} step={.1} value={Number(showtimeClipStart(project, selectedClip).toFixed(2))} disabled={selectedClip.trackId === 'v1'} onChange={(event) => replace(moveShowtimeClip(project, selectedClip.id, Number(event.target.value)))} /></label><label>In point<input type="number" min={0} max={selectedClip.trimOutSec - .04} step={.04} value={Number(selectedClip.trimInSec.toFixed(2))} onChange={(event) => replace(trimShowtimeClip(project, selectedClip.id, { trimInSec: Number(event.target.value) }))} /></label><label>Out point<input type="number" min={selectedClip.trimInSec + .04} max={selectedClip.sourceDurationSec} step={.04} value={Number(selectedClip.trimOutSec.toFixed(2))} onChange={(event) => replace(trimShowtimeClip(project, selectedClip.id, { trimOutSec: Number(event.target.value) }))} /></label><label>Speed<select value={selectedClip.speed} onChange={(event) => updateClip({ speed: Number(event.target.value) })}><option value={.5}>50%</option><option value={.75}>75%</option><option value={1}>100%</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label><label>Volume<input type="range" min={0} max={1.5} step={.05} value={selectedClip.volume} disabled={selectedClip.muted} onChange={(event) => updateClip({ volume: Number(event.target.value) })} /></label><label>Fade in<input type="number" min={0} max={showtimeClipDuration(selectedClip) / 2} step={.1} value={selectedClip.fadeInSec ?? 0} onChange={(event) => updateClip({ fadeInSec: Number(event.target.value) })} /></label><label>Fade out<input type="number" min={0} max={showtimeClipDuration(selectedClip) / 2} step={.1} value={selectedClip.fadeOutSec ?? 0} onChange={(event) => updateClip({ fadeOutSec: Number(event.target.value) })} /></label>{selectedClip.mediaKind !== 'AUDIO' && <><label>Fit<select value={selectedClip.fit ?? 'COVER'} onChange={(event) => updateClip({ fit: event.target.value as ShowtimeClip['fit'] })}><option value="COVER">Fill frame</option><option value="CONTAIN">Show whole image</option></select></label><label>Scale<input type="range" min={.25} max={2.5} step={.05} value={selectedClip.scale ?? 1} onChange={(event) => updateClip({ scale: Number(event.target.value) })} /></label><label>Left / right<input type="range" min={-1} max={1} step={.02} value={selectedClip.positionX ?? 0} onChange={(event) => updateClip({ positionX: Number(event.target.value) })} /></label><label>Up / down<input type="range" min={-1} max={1} step={.02} value={selectedClip.positionY ?? 0} onChange={(event) => updateClip({ positionY: Number(event.target.value) })} /></label><label>Opacity<input type="range" min={0} max={1} step={.05} value={selectedClip.opacity ?? 1} onChange={(event) => updateClip({ opacity: Number(event.target.value) })} /></label><label>Transition<select value={selectedClip.transition} disabled={selectedClip.trackId !== 'v1'} onChange={(event) => updateClip({ transition: event.target.value as ShowtimeClip['transition'], transitionSec: event.target.value === 'CUT' ? 0 : Math.max(.25, selectedClip.transitionSec) })}><option value="CUT">Cut</option><option value="DISSOLVE">Dissolve</option><option value="DIP_BLACK">Dip to black</option></select></label></>}<label className="showtime-toggle"><input type="checkbox" checked={selectedClip.muted} onChange={(event) => updateClip({ muted: event.target.checked })} /> Mute clip</label></div></> : selectedTitle?.motion ? <><header><span>TITLE TRACK</span><h2>{selectedTitle.text}</h2><button onClick={() => void openGraphic(selectedTitle)}>Edit graphic design</button></header><div className="showtime-inspector-grid">
      <label>Starts<input type="number" min={0} step={.1} value={selectedTitle.startSec} onChange={event => { const at = Math.max(0, Number(event.target.value)); updateTitle({ startSec: at, endSec: at + selectedTitle.endSec - selectedTitle.startSec }); }} /></label>
      <label>Duration<input type="number" min={.5} max={120} step={.1} value={selectedTitle.endSec - selectedTitle.startSec} onChange={event => { const seconds = Math.max(.5, Math.min(120, Number(event.target.value))); edit(draft => { const title = draft.titles.find(item => item.id === selectedTitle.id)!; title.endSec = title.startSec + seconds; title.motion!.scenes[0] = retimeMotionScene(title.motion!.scenes[0]!, seconds * 1000); }); }} /></label>
      {selectedTitle.motion.scenes[0]?.elements.filter(element => element.kind === 'TEXT').map(element => <label key={element.id}>{element.name || 'Graphic text'}<textarea aria-label={element.name || 'Graphic text'} rows={(element.text ?? '').includes('\n') ? 5 : 2} value={element.text ?? ''} onChange={event => edit(draft => { const layer = draft.titles.find(item => item.id === selectedTitle.id)!.motion!.scenes[0]!.elements.find(item => item.id === element.id)!; layer.text = event.target.value; layer.binding = 'CUSTOM'; })} /></label>)}
      </div></> : selectedTitle ? <><header><span>T1 GRAPHIC</span><h2>{selectedTitle.kind.replace('_', ' ').toLowerCase()}</h2></header><div className="showtime-inspector-grid"><label>Type<select value={selectedTitle.kind} onChange={(event) => updateTitle({ kind: event.target.value as ShowtimeTitle['kind'] })}><option value="HEADLINE">Headline</option><option value="LOWER_THIRD">Lower third</option><option value="CAPTION">Caption card</option></select></label><label>Words<input value={selectedTitle.text} onChange={(event) => updateTitle({ text: event.target.value })} /></label><label>Second line<input value={selectedTitle.subtext} onChange={(event) => updateTitle({ subtext: event.target.value })} /></label><label>Starts<input type="number" min={0} step={.1} value={selectedTitle.startSec} onChange={(event) => updateTitle({ startSec: Number(event.target.value) })} /></label><label>Ends<input type="number" min={0} step={.1} value={selectedTitle.endSec} onChange={(event) => updateTitle({ endSec: Number(event.target.value) })} /></label><label>Position<select value={selectedTitle.position} onChange={(event) => updateTitle({ position: event.target.value as ShowtimeTitle['position'] })}><option value="TOP">Top</option><option value="MIDDLE">Middle</option><option value="BOTTOM">Bottom</option></select></label><label>Card color<input type="color" value={selectedTitle.background} onChange={(event) => updateTitle({ background: event.target.value })} /></label><label>Type color<input type="color" value={selectedTitle.color} onChange={(event) => updateTitle({ color: event.target.value })} /></label></div></> : <div className="showtime-inspector-empty"><b>Select a timeline clip.</b><span>Drag clips to move them. Grab either edge to trim. Picture, sound, fades, and titles open here.</span></div>}</div>

    <div className="showtime-hidden-media" aria-hidden="true">{project.clips.map((clip) => clip.mediaKind === 'AUDIO' ? <audio key={clip.id} ref={(node) => { if (node) mediaElements.current.set(clip.id, node); else mediaElements.current.delete(clip.id); }} src={props.urls.get(clip.assetId)} preload="auto" /> : <video key={clip.id} ref={(node) => { if (node) mediaElements.current.set(clip.id, node); else mediaElements.current.delete(clip.id); }} src={props.urls.get(clip.assetId)} playsInline preload="auto" onSeeked={() => paintProgram(playhead)} />)}</div>
  </div></fieldset>
    {openingGraphic && <LoadingStatus label="Opening the graphic designer…" />}
    {graphicSession && <div className="video-graphic-overlay" role="dialog" aria-modal="true" aria-label="Graphic designer"><Suspense fallback={<LoadingStatus label="Loading graphic tools…" />}><GraphicDesigner stories={props.stories ?? []} me={props.me} forStoryId={project.storyId} initialProjectId={graphicSession.packageId} onUseGraphic={useGraphic} onReturn={() => setGraphicSession(undefined)} /></Suspense></div>}
  </>;
}
