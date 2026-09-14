import { useSessionCheckpoint } from '../store/useSessionCheckpoint.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  applyShowtimeRecipe, completeRecipeProduction, createShowtimeProject, defaultShowtimeTitle, JobQueue, makeShowtimeClip, newId, saveDeliverable,
  SHOWTIME_FORMATS, showtimeClipDuration, showtimeCutCheck, showtimeDuration, splitShowtimeClip, validateShowtimeProject,
  type Asset, type Credit, type MotionPackage, type ShowtimeClip, type ShowtimeFormat, type ShowtimeProject,
  type ShowtimeCutFinding, type ShowtimeRecipeId, type ShowtimeTitle, type Story, type Transcript, type User,
} from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { paintMotionFrame } from '../video/renderMotion.js';
import { chooseVideoRecorderMime, drawVideoCover, renderShowtimeSequence, videoBlobMetadata, type ShowtimeSource } from '../video/renderShowtime.js';
import { captureErrorMessage, captureShowtimeCamera, captureShowtimeMicrophone, stopShowtimeStream } from '../video/showtime-capture.js';
import { showtimeWorkingAssetIds } from '../video/showtime-working-set.js';
import { LookInside } from '../components/LookInside.js';
import { ShowtimeCutCheck, ShowtimeRecipePicker, ShowtimeRundownRail } from './ShowtimeProgramGuide.js';
import { ShowtimeCutWorkspace } from './ShowtimeCutWorkspace.js';
import { useReilyFocus, useReilyRecovery } from '../components/ReilyContextProvider.js';
import { showtimeReilyFocus, showtimeReilyRecovery } from '../components/reily-room-focus.js';
import './Showtime.css';

type Mode = 'ROLL' | 'LIVE' | 'CUT';
type LiveSource = 'CAMERA' | 'SCREEN' | 'BLACK' | `ASSET:${string}`;
type Notice = { text: string; error?: boolean };
type HydratedSource = ShowtimeSource & { url: string; duration?: number; frame?: { width: number; height: number } };

function omitBase(project: ShowtimeProject): Omit<ShowtimeProject, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = project; return input;
}

function safeName(value: string) { return value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'showtime-video'; }
function time(value: number) { const seconds = Math.max(0, Math.round(value)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

function drawSource(context: CanvasRenderingContext2D, source: LiveSource, width: number, height: number, camera?: HTMLVideoElement | null, screen?: HTMLVideoElement | null, assets?: Map<string, HTMLVideoElement>) {
  context.fillStyle = '#09070d'; context.fillRect(0, 0, width, height);
  const element = source === 'CAMERA' ? camera : source === 'SCREEN' ? screen : source.startsWith('ASSET:') ? assets?.get(source.slice(6)) : undefined;
  if (element?.readyState && element.videoWidth) drawVideoCover(context, element, element.videoWidth, element.videoHeight, width, height);
  else if (source !== 'BLACK') { context.fillStyle = '#372d49'; context.fillRect(0, 0, width, height); context.fillStyle = '#fff6e4'; context.textAlign = 'center'; context.font = `900 ${Math.max(18, height * .04)}px Nunito`; context.fillText(source === 'CAMERA' ? 'START CAMERA' : source === 'SCREEN' ? 'SHARE A SCREEN' : 'CLIP LOADING', width / 2, height / 2); }
}

export function Showtime({ stories, me, storyId }: { stories: Story[]; me?: User; storyId?: string }) {
  const store = useStore(); const { gate } = useGate(); const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('ROLL'); const [projects, setProjects] = useState<ShowtimeProject[]>([]); const [project, setProject] = useState<ShowtimeProject>();
  const [assets, setAssets] = useState<Asset[]>([]); const [credits, setCredits] = useState<Credit[]>([]); const [motion, setMotion] = useState<MotionPackage[]>([]); const [transcripts, setTranscripts] = useState<Transcript[]>([]); const [urls, setUrls] = useState<Map<string, string>>(new Map()); const [assetDurations, setAssetDurations] = useState<Map<string, number>>(new Map()); const [assetFrames, setAssetFrames] = useState<Map<string, { width: number; height: number }>>(new Map()); const [availableAssetIds, setAvailableAssetIds] = useState<Set<string>>(); const sourceBytes = useRef<Map<string, ShowtimeSource>>(new Map());
  const [dirty, setDirty] = useState(false); const [notice, setNotice] = useState<Notice>(); const [busy, setBusy] = useState(''); const [renderProgress, setRenderProgress] = useState<number>();
  const [selectedAssetId, setSelectedAssetId] = useState<string>(); const [selectedClipId, setSelectedClipId] = useState<string>(); const [selectedTitleId, setSelectedTitleId] = useState<string>(); const [recipePickerOpen, setRecipePickerOpen] = useState(false); const saveTimer = useRef<number>(); const editRevision = useRef(0); const importPicker = useRef<HTMLInputElement>(null);
  const [cutReilyTitleKind, setCutReilyTitleKind] = useState<ShowtimeTitle['kind']>(); const [reilyProblem, setReilyProblem] = useState<'camera' | 'microphone' | 'media' | 'export'>();
  const [previewSource, setPreviewSource] = useState<LiveSource>('CAMERA'); const [programSource, setProgramSource] = useState<LiveSource>('BLACK');
  const hydratedSources = useRef<Map<string, HydratedSource>>(new Map()); const hydrationRevision = useRef(0);
  const initializedFor = useRef<string>();

  const story = stories.find((item) => item.id === (project?.storyId ?? storyId)) ?? stories[0];
  const videoAssets = useMemo(() => { const storyIds = new Set(credits.filter((item) => !story || item.storyId === story.id).map((item) => item.assetId)); const clipIds = new Set(project?.clips.map((item) => item.assetId) ?? []); return assets.filter((item) => item.kind === 'VIDEO' && item.gateStatus === 'APPROVED' && (storyIds.has(item.id) || clipIds.has(item.id))); }, [assets, credits, story, project?.clips]);
  const cutAssets = useMemo(() => { const storyIds = new Set(credits.filter((item) => !story || item.storyId === story.id).map((item) => item.assetId)); const clipIds = new Set(project?.clips.map((item) => item.assetId) ?? []); return assets.filter((item) => (item.kind === 'VIDEO' || item.kind === 'AUDIO') && item.gateStatus === 'APPROVED' && (storyIds.has(item.id) || clipIds.has(item.id))); }, [assets, credits, story, project?.clips]);
  const selectedClip = project?.clips.find((item) => item.id === selectedClipId); const selectedTitle = project?.titles.find((item) => item.id === selectedTitleId); const duration = project ? showtimeDuration(project) : 0;
  const cutFindings = useMemo(() => project ? showtimeCutCheck(project, { ...(availableAssetIds ? { availableAssetIds } : {}), transcripts }) : [], [project, availableAssetIds, transcripts]);
  useReilyFocus(showtimeReilyFocus({ mode, selectedTitleKind: mode === 'CUT' ? cutReilyTitleKind : undefined }));
  useReilyRecovery(reilyProblem && notice?.error ? { kind: showtimeReilyRecovery(reilyProblem), workChanged: false } : undefined);

  const reload = useCallback(async () => {
    const [saved, media, nextCredits, packages, nextTranscripts] = await Promise.all([store.showtimeProjects.list(), store.assets.list(), store.credits.list(), store.motionPackages.list(), store.transcripts.list()]);
    setProjects(saved.sort((a, b) => b.updatedAt - a.updatedAt)); setAssets(media); setCredits(nextCredits); setMotion(packages); setTranscripts(nextTranscripts);
    setProject((current) => current ?? saved.find((item) => item.storyId === storyId) ?? saved[0]);
    return saved;
  }, [store, storyId]);

  useEffect(() => { const contextKey = storyId ?? 'standalone'; if (initializedFor.current === contextKey) return; initializedFor.current = contextKey; void (async () => { const saved = await reload(); const matching = storyId ? saved.find((item) => item.storyId === storyId) : saved[0]; if (!matching) { const linkedStory = stories.find((item) => item.id === storyId); const draft = createShowtimeProject({ title: linkedStory ? `${linkedStory.title} video` : 'New video', storyId: storyId ?? stories[0]?.id, authorId: me?.id }); const created = await store.showtimeProjects.create(omitBase(draft)); setProjects((rows) => [created, ...rows.filter((item) => item.id !== created.id)]); setProject(created); } else setProject(matching); })(); }, [reload, store, stories, storyId, me?.id]);
  const workingAssetIds = useMemo(() => showtimeWorkingAssetIds(project, selectedAssetId, previewSource, programSource), [project?.clips, selectedAssetId, previewSource, programSource]);
  useEffect(() => {
    const revision = ++hydrationRevision.current;
    const cache = hydratedSources.current;
    for (const [id, source] of cache) {
      if (workingAssetIds.has(id)) continue;
      URL.revokeObjectURL(source.url);
      cache.delete(id);
    }

    const publish = () => {
      if (revision !== hydrationRevision.current) return;
      sourceBytes.current = new Map([...cache].map(([id, source]) => [id, { bytes: source.bytes, mime: source.mime }]));
      setUrls(new Map([...cache].map(([id, source]) => [id, source.url])));
      setAssetDurations(new Map([...cache].flatMap(([id, source]) => source.duration === undefined ? [] : [[id, source.duration]])));
      setAssetFrames(new Map([...cache].flatMap(([id, source]) => source.frame ? [[id, source.frame]] : [])));
      setAvailableAssetIds(new Set(cache.keys()));
    };

    publish();
    void (async () => {
      const wanted = assets.filter((asset) => workingAssetIds.has(asset.id) && (asset.kind === 'VIDEO' || asset.kind === 'AUDIO'));
      for (const asset of wanted) {
        if (cache.has(asset.id)) continue;
        const bytes = await store.blobs.get(asset.path);
        if (!bytes || revision !== hydrationRevision.current) continue;
        const blob = new Blob([bytes as unknown as BlobPart], { type: asset.mime });
        const hydrated: HydratedSource = { bytes, mime: asset.mime, url: URL.createObjectURL(blob) };
        if (asset.kind === 'VIDEO') {
          try {
            const info = await videoBlobMetadata(blob);
            hydrated.duration = info.duration;
            if (info.width && info.height) hydrated.frame = { width: info.width, height: info.height };
          } catch { /* The editor still accepts the clip with a safe fallback. */ }
        }
        if (revision !== hydrationRevision.current) { URL.revokeObjectURL(hydrated.url); continue; }
        cache.set(asset.id, hydrated);
      }
      publish();
    })();
  }, [assets, store, workingAssetIds]);
  useEffect(() => () => {
    hydrationRevision.current += 1;
    for (const source of hydratedSources.current.values()) URL.revokeObjectURL(source.url);
    hydratedSources.current.clear();
  }, []);
  useEffect(() => { if (!dirty || !project) return; window.clearTimeout(saveTimer.current); const revision = editRevision.current; saveTimer.current = window.setTimeout(() => { void store.showtimeProjects.update(project.id, omitBase(project)).then((saved) => { if (revision !== editRevision.current) return; setProject(saved); setDirty(false); setProjects((rows) => rows.map((item) => item.id === saved.id ? saved : item)); }).catch(() => setNotice({ text: 'The video project did not save. Your edit remains in this tab.', error: true })); }, 700); return () => window.clearTimeout(saveTimer.current); }, [dirty, project, store]);

  function commit(recipe: (draft: ShowtimeProject) => void) { editRevision.current += 1; setProject((current) => { if (!current) return current; const next = structuredClone(current); recipe(next); next.updatedAt = Date.now(); return next; }); setDirty(true); }
  async function newProject() { const draft = createShowtimeProject({ title: story ? `${story.title} video` : 'New video', storyId: story?.id, authorId: me?.id }); const saved = await store.showtimeProjects.create(omitBase(draft)); setProjects((rows) => [saved, ...rows]); setProject(saved); setSelectedClipId(undefined); setSelectedTitleId(undefined); setRecipePickerOpen(true); setMode('CUT'); }
  function chooseRecipe(recipeId: ShowtimeRecipeId) { commit((draft) => Object.assign(draft, applyShowtimeRecipe(draft, recipeId))); setRecipePickerOpen(false); setMode('CUT'); }

  useSessionCheckpoint(store, async () => {
    if (busy || rollRecording || liveRecording || countdown !== undefined) throw new Error('Stop and save the Showtime recording or wait for its current job, then retry.');
    window.clearTimeout(saveTimer.current);
    if (project && dirty) { const saved = await store.showtimeProjects.update(project.id, omitBase(project)); setProject(saved); setDirty(false); }
  });

  const cameraVideo = useRef<HTMLVideoElement>(null); const screenVideo = useRef<HTMLVideoElement>(null); const cameraStream = useRef<MediaStream>(); const screenStream = useRef<MediaStream>(); const startingCamera = useRef<Promise<void>>(); const startingMicrophone = useRef<Promise<void>>(); const cameraRequestId = useRef(0); const microphoneRequestId = useRef(0);
  const [cameraState, setCameraState] = useState<'OFF' | 'ASKING' | 'READY'>('OFF'); const [microphoneState, setMicrophoneState] = useState<'OFF' | 'ASKING' | 'READY'>('OFF'); const [devices, setDevices] = useState<MediaDeviceInfo[]>([]); const [cameraId, setCameraId] = useState(''); const [microphoneId, setMicrophoneId] = useState(''); const [mirror, setMirror] = useState(true); const [guides, setGuides] = useState(true); const [countIn, setCountIn] = useState(3); const [countdown, setCountdown] = useState<number>();
  const rollRecorder = useRef<MediaRecorder>(); const rollChunks = useRef<Blob[]>([]); const [rollRecording, setRollRecording] = useState(false); const [recordSeconds, setRecordSeconds] = useState(0); const recordTimer = useRef<number>();

  useEffect(() => {
    const camera = cameraVideo.current; const screen = screenVideo.current;
    if (camera && cameraStream.current) { camera.srcObject = cameraStream.current; void camera.play().catch(() => undefined); }
    if (screen && screenStream.current) { screen.srcObject = screenStream.current; void screen.play().catch(() => undefined); }
  }, [mode, cameraState]);

  async function startCamera() {
    if (startingCamera.current) return startingCamera.current;
    if (!navigator.mediaDevices?.getUserMedia) { setReilyProblem('camera'); setNotice({ text: 'Camera capture needs a current browser on localhost or HTTPS.', error: true }); return; }
    const requestId = ++cameraRequestId.current;
    const request = (async () => {
      setNotice(undefined); setReilyProblem(undefined); setCameraState('ASKING');
      try {
        const result = await captureShowtimeCamera({ mediaDevices: navigator.mediaDevices, cameraId, width: project?.width ?? 1280, height: project?.height ?? 720 });
        if (requestId !== cameraRequestId.current) { stopShowtimeStream(result.stream); return; }
        microphoneRequestId.current += 1; const previous = cameraStream.current; cameraStream.current = result.stream;
        if (cameraVideo.current) { cameraVideo.current.srcObject = result.stream; await cameraVideo.current.play(); }
        stopShowtimeStream(previous);
        const found = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]); setDevices(found);
        setCameraId(result.cameraTrack.getSettings().deviceId ?? ''); setMicrophoneId(''); setMicrophoneState('OFF'); setCameraState('READY'); setNotice({ text: 'Camera ready. Check your frame, then switch on the microphone.' });
      } catch (error) { if (requestId === cameraRequestId.current) { setCameraState('OFF'); setReilyProblem('camera'); setNotice({ text: captureErrorMessage(error), error: true }); } }
    })();
    startingCamera.current = request;
    try { await request; } finally { if (startingCamera.current === request) startingCamera.current = undefined; }
  }

  async function startMicrophone() {
    if (startingMicrophone.current) return startingMicrophone.current;
    if (!cameraStream.current || cameraState !== 'READY') { setNotice({ text: 'Start the camera first, then switch on the microphone.', error: true }); return; }
    const requestId = ++microphoneRequestId.current;
    const request = (async () => {
      setNotice(undefined); setReilyProblem(undefined); setMicrophoneState('ASKING');
      try {
        const track = await captureShowtimeMicrophone({ mediaDevices: navigator.mediaDevices, microphoneId });
        if (requestId !== microphoneRequestId.current || !cameraStream.current) { track.stop(); return; }
        cameraStream.current.getAudioTracks().forEach((old) => { cameraStream.current?.removeTrack(old); old.stop(); }); cameraStream.current.addTrack(track);
        const found = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]); setDevices(found); setMicrophoneId(track.getSettings().deviceId ?? ''); setMicrophoneState('READY'); setNotice({ text: 'Camera and microphone are ready. Check the frame and sound before rolling.' });
      } catch (error) { if (requestId === microphoneRequestId.current) { setMicrophoneState('OFF'); setReilyProblem('microphone'); setNotice({ text: `Camera is still ready. ${captureErrorMessage(error).replace('camera', 'microphone').replace('Camera', 'Microphone')}`, error: true }); } }
    })();
    startingMicrophone.current = request;
    try { await request; } finally { if (startingMicrophone.current === request) startingMicrophone.current = undefined; }
  }

  async function saveVideo(blob: Blob, name: string, origin: 'RECORDING' | 'UPLOAD', addToCut = true) {
    if (!project) return; setBusy('Saving video…'); setNotice(undefined); setReilyProblem(undefined);
    try { const bytes = new Uint8Array(await blob.arrayBuffer()); const info = await videoBlobMetadata(blob); const durationSec = info.duration; const result = await gate.ingest({ source: origin === 'RECORDING' ? 'recording' : 'upload', bytes, ownDevice: origin === 'RECORDING', meta: { kind: 'VIDEO', mime: blob.type || 'video/webm', origin, storyId: project.storyId, actor: me?.id } }); if (!result.assetId) throw new Error('The video could not enter the project.');
      if (result.status !== 'APPROVED') { await reload(); setNotice({ text: `${name} is saved but waits for an adviser’s media check before editing.`, error: false }); return; }
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'; await saveDeliverable(store, { bytes, title: name, fileName: `${safeName(name)}.${extension}`, kind: 'VIDEO', room: 'SHOWTIME', stage: 'WORKING', mime: blob.type || 'video/webm', storyId: project.storyId, authorId: me?.id, sourceAssetId: result.assetId, durationSec, width: project.width, height: project.height });
      await new JobQueue(store).enqueue('transcribe', { assetId: result.assetId, ...(project.storyId ? { storyId: project.storyId } : {}) }).catch(() => undefined);
      await reload(); if (addToCut) { const clip = makeShowtimeClip({ assetId: result.assetId, name, durationSec, width: info.width, height: info.height }); commit((draft) => draft.clips.push(clip)); setSelectedClipId(clip.id); }
      setNotice({ text: `${name} saved to the Media Bin, added to Cut, and queued for a word-boundary check.` });
    } catch (error) {
      setReilyProblem('media');
      setNotice({ text: error instanceof Error ? error.message : 'That video could not be read or saved.', error: true });
    } finally { setBusy(''); }
  }

  async function startRoll() {
    if (!cameraStream.current) { await startCamera(); return; } if (countIn) for (let value = countIn; value > 0; value -= 1) { setCountdown(value); await new Promise<void>((resolve) => window.setTimeout(resolve, 1000)); } setCountdown(undefined);
    const mime = chooseVideoRecorderMime(); const recorder = new MediaRecorder(cameraStream.current, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 160_000 } : undefined); rollChunks.current = []; recorder.ondataavailable = (event) => { if (event.data.size) rollChunks.current.push(event.data); }; recorder.onstop = () => { const blob = new Blob(rollChunks.current, { type: recorder.mimeType || 'video/webm' }); void saveVideo(blob, `${story?.title ?? 'Story'} camera take`, 'RECORDING'); }; recorder.start(1_000); rollRecorder.current = recorder; setRollRecording(true); setRecordSeconds(0); recordTimer.current = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000);
  }
  function stopRoll() { rollRecorder.current?.stop(); window.clearInterval(recordTimer.current); setRollRecording(false); }
  async function importVideo(file: File) { if (file.size > 1_500_000_000) { setReilyProblem('media'); setNotice({ text: 'That file is larger than 1.5 GB. Trim it on the camera first.', error: true }); return; } await saveVideo(file, file.name.replace(/\.[^.]+$/, ''), 'UPLOAD'); if (importPicker.current) importPicker.current.value = ''; }

  const previewCanvas = useRef<HTMLCanvasElement>(null); const programCanvas = useRef<HTMLCanvasElement>(null); const liveAssetVideos = useRef<Map<string, HTMLVideoElement>>(new Map()); const [transitionKind, setTransitionKind] = useState<'CUT' | 'DISSOLVE' | 'DIP_BLACK'>('DISSOLVE'); const [transitionMs, setTransitionMs] = useState(400); const transition = useRef<{ old: LiveSource; next: LiveSource; start: number; duration: number; kind: typeof transitionKind }>();
  const [graphicsOn, setGraphicsOn] = useState(false); const [motionId, setMotionId] = useState(''); const [sceneId, setSceneId] = useState(''); const liveRecorder = useRef<MediaRecorder>(); const liveChunks = useRef<Blob[]>([]); const [liveRecording, setLiveRecording] = useState(false); const liveSeconds = useRef(0); const [liveClock, setLiveClock] = useState(0); const liveTimer = useRef<number>();
  const chosenMotion = motion.find((item) => item.id === motionId) ?? motion.find((item) => item.storyId === story?.id); const chosenScene = chosenMotion?.scenes.find((item) => item.id === sceneId) ?? chosenMotion?.scenes[0];

  async function shareScreen() { if (!navigator.mediaDevices?.getDisplayMedia) { setNotice({ text: 'Screen sharing is not available in this browser.', error: true }); return; } try { screenStream.current?.getTracks().forEach((track) => track.stop()); const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); screenStream.current = stream; if (screenVideo.current) { screenVideo.current.srcObject = stream; await screenVideo.current.play(); } stream.getVideoTracks()[0]?.addEventListener('ended', () => { setPreviewSource('CAMERA'); setProgramSource((value) => value === 'SCREEN' ? 'BLACK' : value); }); setPreviewSource('SCREEN'); } catch { setNotice({ text: 'Screen share cancelled. Nothing changed.' }); } }
  function take() { if (previewSource === programSource) return; if (transitionKind === 'CUT') setProgramSource(previewSource); else { transition.current = { old: programSource, next: previewSource, start: performance.now(), duration: transitionMs, kind: transitionKind }; setProgramSource(previewSource); } }

  useEffect(() => {
    if (mode !== 'LIVE') return;
    let frame = 0; let lastPaint = 0; const paint = (now = performance.now()) => { if (now - lastPaint < 1000 / 30) { frame = requestAnimationFrame(paint); return; } lastPaint = now; const size = project ? { width: project.width, height: project.height } : { width: 1280, height: 720 }; const draw = (canvas: HTMLCanvasElement | null, source: LiveSource, isProgram: boolean) => { if (!canvas) return; if (canvas.width !== size.width) { canvas.width = size.width; canvas.height = size.height; } const context = canvas.getContext('2d'); if (!context) return; const change = isProgram ? transition.current : undefined;
        if (change && performance.now() < change.start + change.duration) { const progress = (performance.now() - change.start) / change.duration; drawSource(context, change.old, size.width, size.height, cameraVideo.current, screenVideo.current, liveAssetVideos.current); if (change.kind === 'DISSOLVE') { context.save(); context.globalAlpha = progress; drawSource(context, change.next, size.width, size.height, cameraVideo.current, screenVideo.current, liveAssetVideos.current); context.restore(); } else { context.fillStyle = `rgba(0,0,0,${progress < .5 ? progress * 2 : (1 - progress) * 2})`; context.fillRect(0, 0, size.width, size.height); if (progress >= .5) drawSource(context, change.next, size.width, size.height, cameraVideo.current, screenVideo.current, liveAssetVideos.current); } }
        else { if (isProgram) transition.current = undefined; drawSource(context, source, size.width, size.height, cameraVideo.current, screenVideo.current, liveAssetVideos.current); }
        if (graphicsOn && chosenMotion && chosenScene) { context.save(); context.scale(size.width / chosenMotion.width, size.height / chosenMotion.height); paintMotionFrame(context, chosenMotion, chosenScene, performance.now() % chosenScene.durationMs, { showName: chosenMotion.theme.showName, storyTitle: story?.title, byline: me?.penName, channel: story?.channels.join(' • '), quote: story?.brief?.angle }, new Map(), false); context.restore(); }
      }; draw(previewCanvas.current, previewSource, false); draw(programCanvas.current, programSource, true); frame = requestAnimationFrame(paint); }; paint(); return () => cancelAnimationFrame(frame);
  }, [mode, project, previewSource, programSource, graphicsOn, chosenMotion, chosenScene, story, me?.penName]);

  async function toggleLiveRecord() {
    if (liveRecorder.current?.state === 'recording') { liveRecorder.current.stop(); window.clearInterval(liveTimer.current); setLiveRecording(false); return; }
    const canvas = programCanvas.current; if (!canvas || !('captureStream' in canvas)) { setNotice({ text: 'This browser cannot record the Program monitor.', error: true }); return; }
    const stream = canvas.captureStream(30); const audioTrack = cameraStream.current?.getAudioTracks()[0] ?? screenStream.current?.getAudioTracks()[0]; if (audioTrack) stream.addTrack(audioTrack.clone()); const mime = chooseVideoRecorderMime(); const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 160_000 } : undefined); liveChunks.current = []; liveSeconds.current = 0; recorder.ondataavailable = (event) => { if (event.data.size) liveChunks.current.push(event.data); }; recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); const blob = new Blob(liveChunks.current, { type: recorder.mimeType || 'video/webm' }); void saveVideo(blob, `${story?.title ?? 'Story'} live cut`, 'RECORDING'); }; recorder.start(1_000); liveRecorder.current = recorder; setLiveRecording(true); setLiveClock(0); liveTimer.current = window.setInterval(() => { liveSeconds.current += 1; setLiveClock(liveSeconds.current); }, 1000);
  }

  const cutVideo = useRef<HTMLVideoElement>(null); const [sequencePlaying, setSequencePlaying] = useState(false); const [sequenceIndex, setSequenceIndex] = useState(0); const [playhead, setPlayhead] = useState(0); const currentSequenceClip = project?.clips[sequenceIndex];
  useEffect(() => { if (!sequencePlaying || !currentSequenceClip || !cutVideo.current) return; const video = cutVideo.current; video.src = urls.get(currentSequenceClip.assetId) ?? ''; video.playbackRate = currentSequenceClip.speed; video.volume = currentSequenceClip.muted ? 0 : currentSequenceClip.volume; const ready = () => { video.currentTime = currentSequenceClip.trimInSec; void video.play(); }; if (video.readyState >= 1) ready(); else video.addEventListener('loadedmetadata', ready, { once: true }); return () => video.removeEventListener('loadedmetadata', ready); }, [sequencePlaying, currentSequenceClip, urls]);
  function updateSequenceTime() { const video = cutVideo.current; const clip = currentSequenceClip; if (!video || !clip || !project) return; const before = project.clips.slice(0, sequenceIndex).reduce((sum, item, index) => sum + showtimeClipDuration(item) - (index ? item.transitionSec : 0), 0); setPlayhead(before + Math.max(0, (video.currentTime - clip.trimInSec) / clip.speed)); if (sequencePlaying && video.currentTime >= clip.trimOutSec - .02) { if (sequenceIndex < project.clips.length - 1) setSequenceIndex((value) => value + 1); else { setSequencePlaying(false); setSequenceIndex(0); } } }
  function addAsset(asset: Asset) { const durationSec = assetDurations.get(asset.id) ?? 5; const frame = assetFrames.get(asset.id); const clip = makeShowtimeClip({ assetId: asset.id, name: asset.creator || `Shot ${project?.clips.length ? project.clips.length + 1 : 1}`, durationSec, ...(frame ? frame : {}) }); commit((draft) => draft.clips.push(clip)); setSelectedClipId(clip.id); setSelectedAssetId(asset.id); }
  function updateClip(patch: Partial<ShowtimeClip>) { if (!selectedClipId) return; commit((draft) => { const clip = draft.clips.find((item) => item.id === selectedClipId); if (clip) Object.assign(clip, patch); }); }
  function updateTitle(patch: Partial<ShowtimeTitle>) { if (!selectedTitleId) return; commit((draft) => { const title = draft.titles.find((item) => item.id === selectedTitleId); if (title) Object.assign(title, patch); }); }

  async function exportProject(downloadAfter = true, handoff = false) {
    if (!project) return; const problems = validateShowtimeProject(project); if (problems.length) { setNotice({ text: problems.join(' '), error: true }); return; } const blockers = cutFindings.filter((finding) => finding.severity === 'BLOCKING'); if (blockers.length) { setNotice({ text: blockers.map((finding) => finding.message).join(' '), error: true }); return; } setReilyProblem(undefined); setRenderProgress(0); setBusy('Rendering in real time… keep this tab open.');
    try {
      const needed = new Map<string, ShowtimeSource>();
      for (const id of new Set(project.clips.map((item) => item.assetId))) {
        const source = sourceBytes.current.get(id); if (source) needed.set(id, source);
      }
      const blob = await renderShowtimeSequence({ project, sources: needed, onProgress: setRenderProgress });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const gateResult = await gate.ingest({ source: 'generated', bytes, ownDevice: true, meta: { kind: 'VIDEO', mime: blob.type || 'video/webm', origin: 'GENERATED', storyId: project.storyId, actor: me?.id } });
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `${safeName(project.title)}-final.${extension}`;
      await saveDeliverable(store, { bytes, title: `${project.title} · final cut`, fileName, kind: 'VIDEO', room: 'SHOWTIME', stage: handoff ? 'REVIEW' : 'FINAL', mime: blob.type || 'video/webm', storyId: project.storyId, authorId: me?.id, sourceAssetId: gateResult.assetId, sourceProjectId: project.id, durationSec: showtimeDuration(project), width: project.width, height: project.height });
      if (downloadAfter) download(blob, fileName);
      if (handoff && project.storyId) {
        await store.stories.update(project.storyId, { durationSec: showtimeDuration(project) });
        await completeRecipeProduction(store, project.storyId, 'SHOWTIME'); navigate(`/greenlight/${project.storyId}`);
      } else setNotice({ text: `Final ${extension === 'mp4' ? 'MP4' : 'WebM'} saved to the Media Bin${downloadAfter ? ' and downloaded' : ''}.` });
    }
    catch (error) { setReilyProblem('export'); setNotice({ text: error instanceof Error ? error.message : 'The final video did not render.', error: true }); }
    finally { setRenderProgress(undefined); setBusy(''); }
  }
  async function exportPackage() {
    if (!project) return;
    setNotice(undefined); setReilyProblem(undefined);
    try {
      const bytes = new TextEncoder().encode(JSON.stringify({ format: 'chatter-showtime', version: 1, project }, null, 2)); const fileName = `${safeName(project.title)}.showtime.json`;
      await saveDeliverable(store, { bytes, title: `${project.title} · editable cut`, fileName, kind: 'PACKAGE', room: 'SHOWTIME', stage: 'WORKING', mime: 'application/json', storyId: project.storyId, authorId: me?.id, sourceProjectId: project.id });
      download(new Blob([bytes as unknown as BlobPart], { type: 'application/json' }), fileName); setNotice({ text: 'Editable Showtime package saved to the Media Bin and downloaded.' });
    } catch (error) {
      setReilyProblem('export');
      setNotice({ text: error instanceof Error ? error.message : 'The editable video package did not save.', error: true });
    }
  }

  useEffect(() => () => { cameraRequestId.current += 1; microphoneRequestId.current += 1; stopShowtimeStream(cameraStream.current); stopShowtimeStream(screenStream.current); window.clearInterval(recordTimer.current); window.clearInterval(liveTimer.current); }, []);
  useEffect(() => { if (mode !== 'CUT' || !project || project.clips.every((clip) => transcripts.some((item) => item.assetId === clip.assetId))) return; const timer = window.setInterval(() => { void store.transcripts.list().then(setTranscripts); }, 4000); return () => window.clearInterval(timer); }, [mode, project, store, transcripts]);
  if (!project) return <section className="view on showtime-room"><div className="newsroom-empty"><h1>Loading video studio…</h1></div></section>;
  const format = SHOWTIME_FORMATS[project.format]; const overlayPackages = motion.filter((item) => !story || !item.storyId || item.storyId === story.id); const deliveryChecks = validateShowtimeProject(project).length + cutFindings.length; const cutBlocked = cutFindings.some((finding) => finding.severity === 'BLOCKING'); const legacyCut: boolean = false;

  return <section className="view on showtime-room">
    <header className="showtime-head"><div><span>SHOWTIME</span><h1>Video studio</h1><p>Record cameras, switch the programme, and edit the final cut.</p></div><div className="showtime-project-controls"><label>Project<select value={project.id} onChange={(event) => { const next = projects.find((item) => item.id === event.target.value); if (next) setProject(next); }}>{projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button onClick={() => void newProject()}>＋ New</button><button onClick={() => navigate('/files')}>▣ Media Bin</button></div></header>
    <div className="showtime-project-strip"><input aria-label="Video project title" value={project.title} onChange={(event) => commit((draft) => { draft.title = event.target.value; })} /><label>Story<select value={project.storyId ?? ''} onChange={(event) => commit((draft) => { draft.storyId = event.target.value || undefined; })}><option value="">Standalone</option>{stories.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Frame<select value={project.format} onChange={(event) => commit((draft) => { const next = SHOWTIME_FORMATS[event.target.value as ShowtimeFormat]; draft.format = event.target.value as ShowtimeFormat; draft.width = next.width; draft.height = next.height; })}>{Object.entries(SHOWTIME_FORMATS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label><span>{dirty ? 'Saving…' : '✓ Saved here'}</span></div>
    {(!project.programPlan || recipePickerOpen) ? <ShowtimeRecipePicker onChoose={chooseRecipe} /> : <ShowtimeRundownRail project={project} onChangeRecipe={() => setRecipePickerOpen(true)} />}
    <div className="modes" role="tablist" aria-label="Showtime workspace">{([['ROLL', '◉', 'Roll', 'Shoot'], ['LIVE', '⌁', 'Live', 'Switch'], ['CUT', '✂', 'Cut', 'Edit']] as const).map(([id, icon, label, sub]) => <button className="mode" role="tab" aria-selected={mode === id} aria-pressed={mode === id} key={id} onClick={() => setMode(id)}><b>{icon}</b><span>{label}<small>{sub}</small></span></button>)}</div>
    {notice && <div className={`showtime-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
    {busy && <div className="showtime-busy" role="status"><b>{busy}</b>{renderProgress !== undefined && <><progress value={renderProgress} max={1} /><span>{Math.round(renderProgress * 100)}%</span></>}</div>}

    {mode === 'ROLL' && <div className="showtime-roll">
      <div className="showtime-camera-stage" style={{ aspectRatio: `${format.width}/${format.height}` }}><video ref={cameraVideo} muted playsInline className={mirror ? 'mirror' : ''} />{guides && <div className="showtime-guides" />}{cameraState !== 'READY' && <button disabled={cameraState === 'ASKING'} onClick={() => void startCamera()}>{cameraState === 'ASKING' ? 'Opening camera…' : 'Start camera'}</button>}{countdown && <strong className="showtime-countdown">{countdown}</strong>}{rollRecording && <span className="showtime-rec">● REC {time(recordSeconds)}</span>}</div>
      <aside className="showtime-camera-panel"><span className="showtime-kicker">CAMERA SETUP</span><h2>Frame it before you roll.</h2><div className="showtime-device-state"><span className={cameraState === 'READY' ? 'on' : ''}>{cameraState === 'ASKING' ? '◌' : cameraState === 'READY' ? '●' : '○'} Camera</span><span className={microphoneState === 'READY' ? 'on' : ''}>{microphoneState === 'ASKING' ? '◌' : microphoneState === 'READY' ? '●' : '○'} Microphone</span></div><label>Camera<select disabled={cameraState === 'ASKING'} value={cameraId} onChange={(event) => setCameraId(event.target.value)}><option value="">Browser default</option>{devices.filter((item) => item.kind === 'videoinput').map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `Camera ${index + 1}`}</option>)}</select></label><label>Microphone<select disabled={microphoneState === 'ASKING'} value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)}><option value="">Browser default</option>{devices.filter((item) => item.kind === 'audioinput').map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `Microphone ${index + 1}`}</option>)}</select></label><div className="showtime-checks"><label><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} /> Mirror preview</label><label><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} /> Composition guides</label></div><label>Count-in<select value={countIn} onChange={(event) => setCountIn(Number(event.target.value))}><option value={0}>None</option><option value={3}>3 seconds</option><option value={5}>5 seconds</option></select></label><div className="showtime-device-buttons"><button disabled={cameraState === 'ASKING'} onClick={() => void startCamera()}>↻ Check camera</button><button disabled={cameraState !== 'READY' || microphoneState === 'ASKING'} onClick={() => void startMicrophone()}>{microphoneState === 'ASKING' ? 'Opening microphone…' : microphoneState === 'READY' ? '↻ Check microphone' : '＋ Start microphone'}</button></div><button className={rollRecording ? 'danger' : 'primary'} disabled={!!busy || cameraState !== 'READY'} onClick={() => rollRecording ? stopRoll() : void startRoll()}>{rollRecording ? '■ Stop + save take' : microphoneState === 'READY' ? '● Record take' : '● Record picture-only take'}</button><hr/><input ref={importPicker} hidden type="file" accept="video/*,.mp4,.mov,.webm,.m4v" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importVideo(file); }} /><button onClick={() => importPicker.current?.click()}>Import footage</button><small>Camera takes go straight to Cut. Imported footage waits for the same adviser media check used everywhere else.</small></aside>
    </div>}

    {mode === 'LIVE' && <div className="showtime-live">
      <div className="gobar"><button className={`golive ${liveRecording ? 'on' : ''}`} onClick={() => void toggleLiveRecord()}>{liveRecording ? '■ STOP PROGRAM' : '● RECORD PROGRAM'}</button><div className="stat">{liveRecording ? time(liveClock) : 'STANDBY'}<small>{liveRecording ? 'program is being saved' : 'set preview, then take'}</small></div><label>Transition<select value={transitionKind} onChange={(event) => setTransitionKind(event.target.value as typeof transitionKind)}><option value="CUT">Cut</option><option value="DISSOLVE">Dissolve</option><option value="DIP_BLACK">Dip to black</option></select></label><label>Speed<input type="number" min={0} max={2000} step={50} value={transitionMs} disabled={transitionKind === 'CUT'} onChange={(event) => setTransitionMs(Number(event.target.value))} /> ms</label><button className="takebtn" disabled={previewSource === programSource} onClick={take}>TAKE →</button></div>
      <div className="showtime-live-grid"><aside className="showtime-sources"><span className="showtime-kicker">SOURCES</span><button aria-pressed={previewSource === 'CAMERA'} onClick={() => { setPreviewSource('CAMERA'); if (!cameraStream.current) void startCamera(); }}>▣ Camera</button><button aria-pressed={previewSource === 'SCREEN'} onClick={() => screenStream.current ? setPreviewSource('SCREEN') : void shareScreen()}>▤ Screen / tab</button><button aria-pressed={previewSource === 'BLACK'} onClick={() => setPreviewSource('BLACK')}>■ Black</button>{videoAssets.map((asset, index) => <button key={asset.id} aria-pressed={previewSource === `ASSET:${asset.id}`} onClick={() => { setPreviewSource(`ASSET:${asset.id}`); const video = liveAssetVideos.current.get(asset.id); if (video) { video.currentTime = 0; void video.play(); } }}>▶ Clip {index + 1}</button>)}<button onClick={() => void shareScreen()}>＋ Share another screen</button></aside>
        <div className="mons"><div><header><span>PREVIEW</span><b>Next</b></header><canvas ref={previewCanvas} /></div><div className="program"><header><span>PROGRAM</span><b>{liveRecording ? 'ON TAPE' : 'Audience'}</b></header><canvas ref={programCanvas} /></div></div>
        <aside className="showtime-graphics"><span className="showtime-kicker">GRAPHICS</span><label className="showtime-toggle"><input type="checkbox" checked={graphicsOn} onChange={(event) => setGraphicsOn(event.target.checked)} /> Key over both monitors</label><label>Stinger package<select value={chosenMotion?.id ?? ''} onChange={(event) => { setMotionId(event.target.value); setSceneId(''); }}><option value="">No package</option>{overlayPackages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Graphic<select value={chosenScene?.id ?? ''} onChange={(event) => setSceneId(event.target.value)}><option value="">Choose scene</option>{chosenMotion?.scenes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button onClick={() => navigate(story ? `/stinger/${story.id}` : '/stinger')}>Build graphics in Stinger →</button><p>Preview is private. Program is what the recording gets. Call “ready,” then TAKE.</p></aside>
      </div>{videoAssets.map((asset) => <video key={asset.id} ref={(node) => { if (node) liveAssetVideos.current.set(asset.id, node); else liveAssetVideos.current.delete(asset.id); }} src={urls.get(asset.id)} muted loop playsInline hidden />)}<video ref={cameraVideo} muted playsInline hidden /><video ref={screenVideo} muted playsInline hidden />
    </div>}

    {mode === 'CUT' && <><ShowtimeCutWorkspace project={project} assets={cutAssets} urls={urls} assetDurations={assetDurations} assetFrames={assetFrames} findings={cutFindings} storyTitle={story?.title} byline={me?.penName} onCommit={commit} onShoot={() => setMode('ROLL')} onNotice={setNotice} onReilyFocusChange={setCutReilyTitleKind} />
      <footer className="showtime-deliver"><div><span>DELIVER</span><b>{deliveryChecks ? `${deliveryChecks} check${deliveryChecks === 1 ? '' : 's'} left` : 'Ready to render'}</b><small>WebM · {project.width}×{project.height} · sound included · {time(duration)}</small></div><button onClick={() => void exportPackage()}>Save editable package</button><button disabled={!!busy || cutBlocked} onClick={() => void exportProject(true, false)}>Export final WebM</button><button className="primary" disabled={!!busy || !project.storyId || cutBlocked} onClick={() => void exportProject(false, true)}>Render + send to Green Light →</button></footer></>}

    {legacyCut && mode === 'CUT' && <div className="showtime-cut">
      <div className="showtime-cut-top"><aside className="showtime-bin"><header><div><span className="showtime-kicker">MEDIA</span><h2>Story bin</h2></div><button onClick={() => setMode('ROLL')}>＋ Shoot</button></header>{videoAssets.length ? <div>{videoAssets.map((asset, index) => <button key={asset.id} aria-pressed={selectedAssetId === asset.id} onClick={() => setSelectedAssetId(asset.id)}><span>▶</span><div><b>{asset.creator || `Story shot ${index + 1}`}</b><small>{Math.round(asset.bytes / 1024)} KB · {asset.origin.toLowerCase()}</small></div></button>)}</div> : <p className="showtime-empty-small">Shoot a take in Roll or import footage.</p>}</aside>
        <section className="showtime-monitor"><header><span>SOURCE</span><b>{videoAssets.find((item) => item.id === selectedAssetId)?.creator || 'Choose a clip from the bin'}</b></header><video controls src={selectedAssetId ? urls.get(selectedAssetId) : undefined} /><footer><button disabled={!selectedAssetId} onClick={() => { const asset = videoAssets.find((item) => item.id === selectedAssetId); if (asset) addAsset(asset); }}>Insert at end ↓</button></footer></section>
        <section className="showtime-monitor program"><header><span>PROGRAM</span><b>{time(playhead)} / {time(duration)}</b></header><div className="showtime-program-video"><video ref={cutVideo} controls onTimeUpdate={updateSequenceTime} onEnded={updateSequenceTime} />{project.titles.filter((title) => playhead >= title.startSec && playhead <= title.endSec).map((title) => <div className={`showtime-title-preview ${title.position.toLowerCase()}`} style={{ background: title.background, color: title.color }} key={title.id}><b>{title.text}</b><span>{title.subtext}</span></div>)}</div><footer><button disabled={!project.clips.length} onClick={() => { setSequenceIndex(0); setSequencePlaying((value) => !value); }}>{sequencePlaying ? '❚❚ Pause sequence' : '▶ Play sequence'}</button></footer></section>
      </div>
      <div className="showtime-edit-tools"><button onClick={() => { const title = defaultShowtimeTitle(story?.title ?? project.title, me?.penName ?? ''); commit((draft) => draft.titles.push(title)); setSelectedTitleId(title.id); setSelectedClipId(undefined); }}>＋ Title / lower third</button><button disabled={!selectedClip || !cutVideo.current} onClick={() => { if (!selectedClip || !cutVideo.current) return; const at = Math.max(0, (cutVideo.current.currentTime - selectedClip.trimInSec) / selectedClip.speed); const pieces = splitShowtimeClip(selectedClip, at); if (!pieces) { setNotice({ text: 'Move the source playhead inside the selected shot before splitting.', error: true }); return; } commit((draft) => { const index = draft.clips.findIndex((item) => item.id === selectedClip.id); draft.clips.splice(index, 1, ...pieces); }); setSelectedClipId(pieces[1].id); }}>⌁ Split at source playhead</button><button disabled={!selectedClip} onClick={() => { if (!selectedClip) return; const clone = { ...selectedClip, id: newId(), name: `${selectedClip.name} copy` }; commit((draft) => draft.clips.splice(draft.clips.findIndex((item) => item.id === selectedClip.id) + 1, 0, clone)); }}>Duplicate</button><button disabled={!selectedClip && !selectedTitle} onClick={() => { commit((draft) => { if (selectedClipId) draft.clips = draft.clips.filter((item) => item.id !== selectedClipId); if (selectedTitleId) draft.titles = draft.titles.filter((item) => item.id !== selectedTitleId); }); setSelectedClipId(undefined); setSelectedTitleId(undefined); }}>Delete</button><span className="showtime-duration">{project.clips.length} shots · {time(duration)}</span></div>
      <div className="showtime-timeline"><div className="showtime-track-labels"><b>V1</b><span>Picture + sound</span><b>G1</b><span>Titles</span></div><div className="showtime-tracks"><div className="showtime-video-track">{project.clips.map((clip, index) => <button key={clip.id} aria-pressed={selectedClipId === clip.id} style={{ flexGrow: Math.max(1, showtimeClipDuration(clip)) }} onClick={() => { setSelectedClipId(clip.id); setSelectedTitleId(undefined); setSequenceIndex(index); }}><small>{index + 1}</small><b>{clip.name}</b><span>{time(showtimeClipDuration(clip))}</span></button>)}</div><div className="showtime-title-track">{project.titles.map((title) => <button key={title.id} aria-pressed={selectedTitleId === title.id} style={{ marginLeft: `${duration ? title.startSec / duration * 100 : 0}%`, width: `${duration ? Math.max(4, (title.endSec - title.startSec) / duration * 100) : 12}%`, background: title.background, color: title.color }} onClick={() => { setSelectedTitleId(title.id); setSelectedClipId(undefined); }}>{title.text}</button>)}</div></div></div>
      <ShowtimeCutCheck findings={cutFindings} onSelect={(finding: ShowtimeCutFinding) => { if (finding.clipId) { setSelectedClipId(finding.clipId); setSelectedTitleId(undefined); const index = project.clips.findIndex((clip) => clip.id === finding.clipId); if (index >= 0) setSequenceIndex(index); } else if (finding.titleId) { setSelectedTitleId(finding.titleId); setSelectedClipId(undefined); } else if (finding.railId) { const rail = project.programPlan?.rails.find((item) => item.id === finding.railId); setPlayhead(Math.min(duration, rail?.startSec ?? duration)); setSequenceIndex(Math.max(0, project.clips.length - 1)); } }} />
      <div className="showtime-inspector">{selectedClip ? <><header><span>SHOT INSPECTOR</span><h2>{selectedClip.name}</h2></header><div className="showtime-inspector-grid"><label>Name<input value={selectedClip.name} onChange={(event) => updateClip({ name: event.target.value })} /></label><label>In point<input type="number" min={0} max={selectedClip.trimOutSec - .04} step={.04} value={Number(selectedClip.trimInSec.toFixed(2))} onChange={(event) => updateClip({ trimInSec: Number(event.target.value) })} /></label><label>Out point<input type="number" min={selectedClip.trimInSec + .04} max={selectedClip.sourceDurationSec} step={.04} value={Number(selectedClip.trimOutSec.toFixed(2))} onChange={(event) => updateClip({ trimOutSec: Number(event.target.value) })} /></label><label>Speed<select value={selectedClip.speed} onChange={(event) => updateClip({ speed: Number(event.target.value) })}><option value={.5}>50%</option><option value={.75}>75%</option><option value={1}>100%</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label><label>Volume<input type="range" min={0} max={1.5} step={.05} value={selectedClip.volume} disabled={selectedClip.muted} onChange={(event) => updateClip({ volume: Number(event.target.value) })} /></label><label>Transition<select value={selectedClip.transition} onChange={(event) => updateClip({ transition: event.target.value as ShowtimeClip['transition'], transitionSec: event.target.value === 'CUT' ? 0 : Math.max(.25, selectedClip.transitionSec) })}><option value="CUT">Cut</option><option value="DISSOLVE">Dissolve</option><option value="DIP_BLACK">Dip to black</option></select></label><label>Transition seconds<input type="number" min={0} max={2} step={.05} disabled={selectedClip.transition === 'CUT'} value={selectedClip.transitionSec} onChange={(event) => updateClip({ transitionSec: Number(event.target.value) })} /></label><label className="showtime-toggle"><input type="checkbox" checked={selectedClip.muted} onChange={(event) => updateClip({ muted: event.target.checked })} /> Mute shot</label></div><div className="showtime-order"><button disabled={project.clips[0]?.id === selectedClip.id} onClick={() => commit((draft) => { const index = draft.clips.findIndex((item) => item.id === selectedClip.id); [draft.clips[index - 1], draft.clips[index]] = [draft.clips[index]!, draft.clips[index - 1]!]; })}>← Earlier</button><button disabled={project.clips.at(-1)?.id === selectedClip.id} onClick={() => commit((draft) => { const index = draft.clips.findIndex((item) => item.id === selectedClip.id); [draft.clips[index], draft.clips[index + 1]] = [draft.clips[index + 1]!, draft.clips[index]!]; })}>Later →</button></div></> : selectedTitle ? <><header><span>GRAPHIC INSPECTOR</span><h2>{selectedTitle.kind.replace('_', ' ').toLowerCase()}</h2></header><div className="showtime-inspector-grid"><label>Type<select value={selectedTitle.kind} onChange={(event) => updateTitle({ kind: event.target.value as ShowtimeTitle['kind'] })}><option value="HEADLINE">Headline</option><option value="LOWER_THIRD">Lower third</option><option value="CAPTION">Caption card</option></select></label><label>Words<input value={selectedTitle.text} onChange={(event) => updateTitle({ text: event.target.value })} /></label><label>Second line<input value={selectedTitle.subtext} onChange={(event) => updateTitle({ subtext: event.target.value })} /></label><label>Starts<input type="number" min={0} max={duration} step={.1} value={selectedTitle.startSec} onChange={(event) => updateTitle({ startSec: Number(event.target.value) })} /></label><label>Ends<input type="number" min={0} max={duration} step={.1} value={selectedTitle.endSec} onChange={(event) => updateTitle({ endSec: Number(event.target.value) })} /></label><label>Position<select value={selectedTitle.position} onChange={(event) => updateTitle({ position: event.target.value as ShowtimeTitle['position'] })}><option value="TOP">Top</option><option value="MIDDLE">Middle</option><option value="BOTTOM">Bottom</option></select></label><label>Card color<input type="color" value={selectedTitle.background} onChange={(event) => updateTitle({ background: event.target.value })} /></label><label>Type color<input type="color" value={selectedTitle.color} onChange={(event) => updateTitle({ color: event.target.value })} /></label></div></> : <div className="showtime-inspector-empty"><b>Select a shot or title.</b><span>Trim points, volume, speed, transitions, and graphics open here.</span></div>}</div>
      <footer className="showtime-deliver"><div><span>DELIVER</span><b>{deliveryChecks ? `${deliveryChecks} check${deliveryChecks === 1 ? '' : 's'} left` : 'Ready to render'}</b><small>WebM · {project.width}×{project.height} · sound included · {time(duration)}</small></div><button onClick={() => void exportPackage()}>Save editable package</button><button disabled={!!busy || cutBlocked} onClick={() => void exportProject(true, false)}>Export final WebM</button><button className="primary" disabled={!!busy || !project.storyId || cutBlocked} onClick={() => void exportProject(false, true)}>Render + send to Green Light →</button></footer>
    </div>}

    <LookInside room="Showtime" intro="The same habits work in a school studio, a live switcher, and a full editing suite." rows={[{ nm: 'Roll for clean source', sb: <>Set the frame, check the microphone, record a complete take, and keep rolling for two quiet seconds at the end. Clean handles make edits easier.</> }, { nm: 'Preview is private', sb: <>In Live, choose the next source in Preview. Program is the recorded picture. Call the source, then press TAKE on purpose.</> }, { nm: 'Cut with two monitors', sb: <>Source is the original clip; Program is the assembled story. Set In and Out points without changing the camera file.</> }, { nm: 'Sound is half the picture', sb: <>Balance dialogue before adding polish. Mute unusable camera sound, then bring music and effects in only when they help the story.</> }, { nm: 'Deliver the real file', sb: <>Render the final sequence, watch it all the way through, then send that exact version to Green Light.</> }]} />
  </section>;
}
