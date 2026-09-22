import { ControlIcon } from '../components/ControlIcon.js';
import { LoadingStatus } from '../components/LoadingStatus.js';
import { workspaceStorage } from '../portable/workspace-context.js';
import { useSessionCheckpoint } from '../store/useSessionCheckpoint.js';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  MOTION_FORMATS, MOTION_SCENE_KINDS, cloneMotionScene,
  advanceMotionPlayhead, createMotionPackage, createMotionScene, motionFrameState, resolveMotionText, resizeMotionPackage, retimeMotionScene, saveDeliverable,
  validateMotionPackage, type Asset, type MotionBinding, type MotionElement, type MotionFormat,
  type MotionBindings, type MotionPackage, type MotionPreset, type Story, type User,
  MOTION_RECIPE_FAMILIES, makeMotionRecipeScene, remixMotionPackage, type CreativeFinding,
} from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { useNavigate, useParams } from 'react-router-dom';
import { canRenderMotionVideo, renderMotionScene } from '../video/renderMotion.js';
import { Icon } from '../components/Sprite.js';
import { FontSelect } from '../components/FontSelect.js';
import { waitForEditorFonts } from '../styles/fonts.js';
import { inspectorTabsFor, resolveInspectorTab, type InspectorTab } from './stinger-inspector.js';
import { checkMotionPackage } from './stinger-quality.js';
import { isStingerTemplateShelfVisible } from './stinger-template-shelf.js';
import { StingerReadyCheck } from './StingerReadyCheck.js';
import { StingerGraphicPalette } from './StingerGraphicPalette.js';
import { buildStingerGraphic, insertStingerGraphicElements, makeStingerKeyframeAtPlayhead, moveStingerGraphicGroup, type StingerGraphicCategory, type StingerGraphicTemplate } from './stinger-graphics.js';
import { isCurrentStingerSave } from './stinger-save.js';
import { selectStoryWorkspace } from '../story-navigation.js';
import { useReilyFocus, useReilyRecovery } from '../components/ReilyContextProvider.js';
import { stingerReilyFocus, stingerReilyRecovery } from '../components/reily-room-focus.js';
import './Stinger.css';

const PRESETS: MotionPreset[] = ['NONE', 'FADE', 'SLIDE_LEFT', 'SLIDE_RIGHT', 'SLIDE_UP', 'POP', 'WIPE', 'TYPE_ON', 'SPIN'];
const INSPECTOR_TABS: Array<{ id: InspectorTab; icon: string; label: string }> = [
  { id: 'DESIGN', icon: 'Aa', label: 'Look' }, { id: 'MOTION', icon: '↝', label: 'Move' },
  { id: 'DATA', icon: '⌁', label: 'Story' }, { id: 'BRAND', icon: '★', label: 'Show' },
];

const copy = <T,>(value: T): T => structuredClone(value);
const safeName = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'stinger-package';
function download(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function loadImage(url: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('One of this scene’s images could not be prepared for export.')); image.src = url; }); }
function storedRecentGraphics(): string[] {
  try {
    const value = JSON.parse(workspaceStorage(window.localStorage).getItem('chatter-stinger-recent-graphics') ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 6) : [];
  } catch { return []; }
}

function omitBase(project: MotionPackage): Omit<MotionPackage, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = project;
  return input;
}

function shapeClip(shape: MotionElement['shape']): CSSProperties {
  if (shape === 'ELLIPSE') return { borderRadius: '50%' };
  if (shape === 'TRIANGLE') return { clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' };
  return {};
}

function StingerTemplateShelf({
  familyId,
  onChooseFamily,
  onChooseDirection,
  onClose,
}: {
  familyId: string;
  onChooseFamily: (familyId: string) => void;
  onChooseDirection: (familyId: string, directionId: string) => void;
  onClose?: () => void;
}) {
  const family = MOTION_RECIPE_FAMILIES.find((item) => item.id === familyId) ?? MOTION_RECIPE_FAMILIES[0]!;
  return (
    <section className="stinger-template-shelf">
      <header><div><span className="stinger-eyebrow">START WITH THE BROADCAST JOB</span><h2>What needs to go on screen?</h2></div><p>Choose the job, then audition three complete visual directions.</p>{onClose && <button className="stinger-template-close" onClick={onClose} aria-label="Close templates">×</button>}</header>
      <div className="stinger-job-strip">{MOTION_RECIPE_FAMILIES.map((item) => <button key={item.id} aria-pressed={item.id === familyId} onClick={() => onChooseFamily(item.id)}><b>{item.name}</b><small>{item.job}</small></button>)}</div>
      <div className="stinger-job-brief"><b>{family.name}</b><span>{family.bestFor}</span><em>{family.sceneKinds.map((kind) => kind.replace('_', ' ')).join(' · ')}</em></div>
      <div className="stinger-template-grid stinger-direction-grid">{family.directions.map((direction) => <button key={direction.id} className="stinger-template" onClick={() => onChooseDirection(family.id, direction.id)} style={{ '--kit-primary': direction.theme.primary, '--kit-secondary': direction.theme.secondary, '--kit-accent': direction.theme.accent, '--kit-paper': direction.theme.paper } as CSSProperties}><StingerTemplatePreview familyId={family.id} directionId={direction.id} /><strong>{direction.name}</strong><small>{direction.note}</small><span className="stinger-use">Build this kit →</span></button>)}</div>
    </section>
  );
}

function StingerTemplatePreview({ familyId, directionId }: { familyId: string; directionId: string }) {
  const scene = makeMotionRecipeScene(familyId, directionId, 'HEADLINE');
  return <span className="stinger-template-art stinger-template-stage" style={{ background: scene.background }} aria-hidden="true">
    {scene.elements.map((item) => <i key={item.id} className={`stinger-template-piece kind-${item.kind.toLowerCase()} role-${item.role?.toLowerCase() ?? 'piece'}`} style={{
      left: `${item.x / 1920 * 100}%`, top: `${item.y / 1080 * 100}%`, width: `${item.width / 1920 * 100}%`, height: `${item.height / 1080 * 100}%`,
      color: item.fill, background: item.kind === 'TEXT' ? 'transparent' : item.fill, borderColor: item.stroke, borderWidth: item.strokeWidth ? `${Math.max(1, item.strokeWidth / 3)}px` : 0,
      borderStyle: 'solid', borderRadius: item.shape === 'ELLIPSE' ? '50%' : `${Math.min(10, item.radius / 3)}px`, transform: `rotate(${item.rotation}deg)`,
      fontFamily: item.fontFamily, fontSize: item.kind === 'TEXT' ? `${item.fontSize / 1920 * 100}cqw` : undefined, fontWeight: item.fontWeight, lineHeight: item.lineHeight, textAlign: item.align,
    }} >{item.kind === 'TEXT' ? item.text : null}</i>)}
  </span>;
}

export function Stinger({ stories, me, initialProjectId, forStoryId, onUseGraphic, onReturn }: {
  stories: Story[]; me?: User; initialProjectId?: string; forStoryId?: string;
  onUseGraphic?: (project: MotionPackage, sceneId: string, bindings: MotionBindings) => Promise<void>;
  onReturn?: () => void;
}) {
  const store = useStore();
  const { gate } = useGate();
  const navigate = useNavigate();
  const { storyId: paramStoryId } = useParams();
  const routeStoryId = forStoryId ?? paramStoryId;
  const [placing, setPlacing] = useState(false);
  const [projects, setProjects] = useState<MotionPackage[]>([]);
  const [project, setProject] = useState<MotionPackage>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [sceneId, setSceneId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [inspector, setInspector] = useState<InspectorTab>('DESIGN');
  const [atMs, setAtMs] = useState(800);
  const [playing, setPlaying] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string>();
  const [reilyProblem, setReilyProblem] = useState<'import' | 'export'>();
  const [exporting, setExporting] = useState<number>();
  const [undo, setUndo] = useState<MotionPackage[]>([]);
  const [redo, setRedo] = useState<MotionPackage[]>([]);
  const [starterFamilyId, setStarterFamilyId] = useState(MOTION_RECIPE_FAMILIES[0]!.id);
  const [templateShelfOpen, setTemplateShelfOpen] = useState(false);
  const [showReadyCheck, setShowReadyCheck] = useState(false);
  const [pendingExport, setPendingExport] = useState(false);
  const [graphicCategory, setGraphicCategory] = useState<StingerGraphicCategory>('HEADLINES');
  const [graphicQuery, setGraphicQuery] = useState('');
  const [showAllGraphics, setShowAllGraphics] = useState(false);
  const [recentGraphicIds, setRecentGraphicIds] = useState(storedRecentGraphics);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>();
  const dragRef = useRef<{ mode: 'MOVE' | 'RESIZE'; x: number; y: number; item: MotionElement; members: MotionElement[] }>();
  const saveTimer = useRef<number>();
  const projectRef = useRef<MotionPackage>();
  const dirtyRef = useRef(false);
  const editRevision = useRef(0);
  const playheadRef = useRef(atMs);

  const reload = useCallback(async () => {
    const [saved, media] = await Promise.all([store.motionPackages.list(), store.assets.list()]);
    const ordered = saved.sort((a, b) => b.updatedAt - a.updatedAt);
    setProjects(ordered); setAssets(media.filter((asset) => asset.gateStatus === 'APPROVED'));
    setProject((current) => current && (!routeStoryId || current.storyId === routeStoryId) ? current : selectStoryWorkspace(ordered, { storyId: routeStoryId, projectId: initialProjectId }));
  }, [store, routeStoryId, initialProjectId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    try { workspaceStorage(window.localStorage).setItem('chatter-stinger-recent-graphics', JSON.stringify(recentGraphicIds)); } catch { /* Recent is a convenience; storage restrictions must not block editing. */ }
  }, [recentGraphicIds]);
  useEffect(() => {
    const urls: string[] = [];
    void (async () => {
      const map = new Map<string, string>();
      for (const asset of assets) {
        const bytes = await store.blobs.get(asset.path);
        if (!bytes) continue;
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: asset.mime })); urls.push(url); map.set(asset.id, url);
      }
      setImageUrls(map);
    })();
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [assets, store]);

  const scene = project?.scenes.find((item) => item.id === sceneId) ?? project?.scenes[0];
  const selectedSource = scene?.elements.find((item) => item.id === selectedId);
  const linkedStoryId = project?.storyId ?? routeStoryId;
  const story = linkedStoryId ? stories.find((item) => item.id === linkedStoryId) : undefined;
  const bindings = useMemo(() => ({ showName: project?.theme.showName, storyTitle: story?.title, byline: me?.penName ?? 'Student reporter', channel: story?.channels.join(' • ') || 'SCHOOL NEWS', quote: selectedSource?.text || story?.title }), [project, story, me, selectedSource?.text]);
  const selected = selectedSource?.kind === 'TEXT' ? { ...selectedSource, text: resolveMotionText(selectedSource, bindings) } : selectedSource;
  const inspectorTabs = inspectorTabsFor(selected?.kind);
  const activeInspector = resolveInspectorTab(inspector, selected?.kind);
  useReilyFocus(stingerReilyFocus({ inspector: activeInspector, selectedKind: selected?.kind }));
  useReilyRecovery(reilyProblem && note ? { kind: stingerReilyRecovery(reilyProblem), workChanged: false } : undefined);

  useEffect(() => {
    if (!project) return;
    if (!sceneId || !project.scenes.some((item) => item.id === sceneId)) setSceneId(project.scenes[0]?.id);
  }, [project, sceneId]);
  useEffect(() => { if (scene) setAtMs(Math.min(800, scene.durationMs)); }, [scene?.id]);
  useEffect(() => { playheadRef.current = atMs; }, [atMs]);
  useEffect(() => { if (scene) { setPlaying(false); setAtMs((current) => Math.max(0, Math.min(current, scene.durationMs))); } }, [scene?.durationMs]);
  useEffect(() => { if (activeInspector !== inspector) setInspector(activeInspector); }, [activeInspector, inspector]);

  const save = useCallback(async (target: MotionPackage, quiet = false, requestedRevision = editRevision.current) => {
    const problems = validateMotionPackage(target);
    if (problems.length) throw new Error(problems[0]);
    const saved = await store.motionPackages.update(target.id, target);
    if (isCurrentStingerSave(projectRef.current?.id, editRevision.current, saved.id, requestedRevision)) {
      projectRef.current = saved; dirtyRef.current = false; setProject(saved); setDirty(false);
      setProjects((rows) => [saved, ...rows.filter((item) => item.id !== saved.id)].sort((a, b) => b.updatedAt - a.updatedAt));
      if (!quiet) setNote('Saved. This package is ready to reuse in any show.');
    }
    return saved;
  }, [store]);

  useEffect(() => {
    if (!dirty || !project) return;
    window.clearTimeout(saveTimer.current);
    const requestedRevision = editRevision.current;
    saveTimer.current = window.setTimeout(() => { void save(project, true, requestedRevision).catch((error) => { setReilyProblem('export'); setNote(error instanceof Error ? error.message : 'This package did not save. Your edit remains open.'); }); }, 900);
    return () => window.clearTimeout(saveTimer.current);
  }, [dirty, project, save]);

  useEffect(() => () => {
    window.clearTimeout(saveTimer.current);
    if (dirtyRef.current && projectRef.current) void store.motionPackages.update(projectRef.current.id, projectRef.current);
  }, [store]);

  const commit = useCallback((recipe: (draft: MotionPackage) => void, history = true) => {
    editRevision.current += 1; dirtyRef.current = true; setDirty(true);
    setProject((current) => {
      if (!current) return current;
      if (history) { setUndo((rows) => [...rows.slice(-39), copy(current)]); setRedo([]); }
      const next = copy(current); recipe(next); projectRef.current = next; return next;
    });
  }, []);

  async function flushProject() {
    window.clearTimeout(saveTimer.current);
    const target = projectRef.current;
    if (dirtyRef.current && target) await save(target, true, editRevision.current);
  }

  useSessionCheckpoint(store, async () => {
    if (exporting !== undefined) throw new Error('Wait for Stinger to finish exporting, then retry.');
    await flushProject();
  });

  function adoptProject(next: MotionPackage | undefined) {
    editRevision.current += 1; projectRef.current = next; dirtyRef.current = false;
    setProject(next); setDirty(false); setSelectedId(undefined);
  }

  function replaceEditedProject(next: MotionPackage) {
    editRevision.current += 1; projectRef.current = next; dirtyRef.current = true;
    setProject(next); setDirty(true);
  }

  async function switchProject(next: MotionPackage) {
    if (next.id === projectRef.current?.id) return;
    try { await flushProject(); adoptProject(next); }
    catch (error) { setNote(error instanceof Error ? error.message : 'This package did not save, so Stinger kept it open.'); }
  }

  async function leaveStinger(path?: string) {
    try { await flushProject(); if (path) navigate(path); else adoptProject(undefined); }
    catch (error) { setNote(error instanceof Error ? error.message : 'This package did not save, so Stinger kept it open.'); }
  }

  const updateScene = (recipe: (draft: NonNullable<typeof scene>) => void, history = true) => commit((draft) => {
    const target = draft.scenes.find((item) => item.id === scene?.id);
    if (!target) return;
    const before = copy(target);
    recipe(target);
    if (target.durationMs !== before.durationMs) Object.assign(target, retimeMotionScene(before, target.durationMs));
  }, history);
  const updateSelected = (patch: Partial<MotionElement>, history = true) => updateScene((draft) => {
    const target = draft.elements.find((item) => item.id === selectedId);
    if (!target) return;
    Object.assign(target, patch);
    if (patch.startMs !== undefined || patch.endMs !== undefined) {
      target.startMs = Math.max(0, Math.min(draft.durationMs - 1, Number.isFinite(target.startMs) ? target.startMs : 0));
      target.endMs = Math.max(target.startMs + 1, Math.min(draft.durationMs, Number.isFinite(target.endMs) ? target.endMs : draft.durationMs));
      target.keyframes = target.keyframes.map((frame) => ({ ...frame, atMs: Math.max(target.startMs, Math.min(target.endMs, frame.atMs)) }));
    }
  }, history);

  async function start(templateId: Parameters<typeof createMotionPackage>[0], directionId?: string) {
    try { await flushProject(); } catch (error) { setNote(error instanceof Error ? error.message : 'This package did not save, so Stinger kept it open.'); return; }
    let draft = createMotionPackage(templateId, { authorId: me?.id, storyId: routeStoryId ?? stories[0]?.id });
    if (directionId && draft.creativeRecipe?.directionId !== directionId) draft = remixMotionPackage(draft, directionId);
    const saved = await store.motionPackages.create(omitBase(draft));
    adoptProject(saved); setProjects((rows) => [saved, ...rows]); setSceneId(saved.scenes[0]?.id); setTemplateShelfOpen(false); setNote('Package created. Pick a scene, then make it yours.');
  }

  function remix(directionId: string) {
    if (!project?.creativeRecipe) return;
    setUndo((rows) => [...rows.slice(-39), copy(project)]); setRedo([]);
    const next = remixMotionPackage(project, directionId); replaceEditedProject(next); setSceneId(next.scenes[0]?.id);
  }

  function repairFinding(finding: CreativeFinding) {
    if (!finding.sceneId || !finding.elementId || !project) return;
    commit((draft) => {
      const targetScene = draft.scenes.find((item) => item.id === finding.sceneId); const item = targetScene?.elements.find((entry) => entry.id === finding.elementId);
      if (!targetScene || !item) return;
      if (finding.repair === 'EXTEND_TIMING') item.endMs = targetScene.durationMs;
      if (finding.repair === 'MOVE_TO_SAFE_ZONE') { const mx = draft.width * .05; const my = draft.height * .05; item.x = Math.max(mx, Math.min(item.x, draft.width - mx - item.width)); item.y = Math.max(my, Math.min(item.y, draft.height - my - item.height)); }
    });
  }

  async function duplicateProject() {
    if (!project) return;
    try {
      await flushProject(); const source = projectRef.current ?? project;
      const draft = copy(source); draft.title = `${source.title} copy`; draft.scenes = source.scenes.map(cloneMotionScene);
      const saved = await store.motionPackages.create(omitBase(draft)); setProjects((rows) => [saved, ...rows]); adoptProject(saved); setSceneId(saved.scenes[0]?.id); setNote('Made a separate copy.');
    } catch (error) { setNote(error instanceof Error ? error.message : 'The original package did not save, so Stinger did not make a copy.'); }
  }

  function undoOnce() {
    const previous = undo.at(-1); if (!previous || !project) return;
    setRedo((rows) => [...rows, copy(project)]); setUndo((rows) => rows.slice(0, -1)); replaceEditedProject(previous);
  }
  function redoOnce() {
    const next = redo.at(-1); if (!next || !project) return;
    setUndo((rows) => [...rows, copy(project)]); setRedo((rows) => rows.slice(0, -1)); replaceEditedProject(next);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redoOnce() : undoOnce(); }
      if (event.code === 'Space') { event.preventDefault(); togglePreview(); }
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedId) { event.preventDefault(); updateScene((draft) => { draft.elements = draft.elements.filter((item) => item.id !== selectedId); }); setSelectedId(undefined); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!playing || !scene) return;
    let frame = 0; const startedAt = performance.now(); const startAtMs = playheadRef.current;
    const tick = (now: number) => {
      const next = advanceMotionPlayhead(startAtMs, now - startedAt, scene.durationMs);
      if (next.complete) { setAtMs(scene.durationMs); setPlaying(false); return; }
      setAtMs(next.atMs); frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, scene?.id, scene?.durationMs]);

  useEffect(() => {
    audioRef.current?.pause(); audioRef.current = undefined;
    if (!playing || !scene?.audioAssetId) return;
    const url = imageUrls.get(scene.audioAssetId); if (!url) return;
    const audio = new Audio(url); audio.currentTime = atMs / 1000; audioRef.current = audio; void audio.play().catch(() => setNote('Press Preview again to allow this scene’s sound cue.'));
    return () => { audio.pause(); if (audioRef.current === audio) audioRef.current = undefined; };
    // Audio starts once per play gesture; the animation clock updates independently.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, scene?.id, scene?.audioAssetId, imageUrls]);

  function pointerDown(event: ReactPointerEvent, item: MotionElement, mode: 'MOVE' | 'RESIZE') {
    if (item.locked || !project) return; event.stopPropagation(); setSelectedId(item.id);
    const members = mode === 'MOVE' && item.groupId ? scene?.elements.filter((entry) => entry.groupId === item.groupId) ?? [item] : [item];
    setUndo((rows) => [...rows.slice(-39), copy(project)]); setRedo([]); dragRef.current = { mode, x: event.clientX, y: event.clientY, item: copy(item), members: copy(members) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent) {
    const drag = dragRef.current; const canvas = canvasRef.current; if (!drag || !project || !canvas) return;
    const scale = project.width / canvas.getBoundingClientRect().width; const dx = (event.clientX - drag.x) * scale; const dy = (event.clientY - drag.y) * scale;
    if (drag.mode === 'MOVE') {
      const moved = new Map(moveStingerGraphicGroup(drag.members, drag.item.id, dx, dy).map((item) => [item.id, item]));
      updateScene((draft) => draft.elements.forEach((item) => { const next = moved.get(item.id); if (next) { item.x = next.x; item.y = next.y; item.keyframes = next.keyframes; } }), false);
    } else updateSelected({ width: Math.max(40, drag.item.width + dx), height: Math.max(24, drag.item.height + dy) }, false);
  }
  function pointerUp() { dragRef.current = undefined; }

  function addGraphic(template: StingerGraphicTemplate) {
    if (!scene || !project) return;
    const elements = buildStingerGraphic(template.id, {
      width: project.width,
      height: project.height,
      durationMs: scene.durationMs,
      theme: project.theme,
      imageAssetId: assets.find((asset) => asset.kind === 'IMAGE')?.id,
    });
    if (!elements.length) return;
    updateScene((draft) => { draft.elements = insertStingerGraphicElements(draft.elements, elements, template.category); });
    const firstEditable = template.needsImage && !assets.some((asset) => asset.kind === 'IMAGE')
      ? elements.find((item) => item.kind === 'IMAGE')
      : elements.find((item) => item.kind === 'TEXT' && item.role !== 'DECORATION') ?? elements.find((item) => item.kind === 'IMAGE');
    const selectedElement = firstEditable ?? elements[0]!;
    setSelectedId(selectedElement.id);
    setInspector('DESIGN');
    setRecentGraphicIds((current) => {
      return [template.id, ...current.filter((id) => id !== template.id)].slice(0, 6);
    });
    setNote(`${template.name} added. Change any layer in the inspector.`);
  }

  function addKeyframe() {
    if (!selected || !scene) return;
    updateSelected({ keyframes: [...selected.keyframes.filter((frame) => Math.abs(frame.atMs - atMs) > 20), makeStingerKeyframeAtPlayhead(selected, atMs, scene)].sort((a, b) => a.atMs - b.atMs) });
    setNote(`Keyframe added at ${(atMs / 1000).toFixed(2)}s.`);
  }

  function togglePreview() {
    if (!scene) return;
    if (playing) { setPlaying(false); return; }
    if (atMs < 0 || atMs >= scene.durationMs) setAtMs(0);
    setPlaying(true);
  }

  async function importPhoto(file: File) {
    const targetId = selectedId;
    if (!targetId || !project) return;
    setNote(undefined); setReilyProblem(undefined);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await gate.ingest({
        source: 'upload',
        bytes,
        meta: {
          kind: 'IMAGE', mime: file.type || 'image/jpeg', origin: 'UPLOAD', license: 'OWN',
          storyId: project.storyId, actor: me?.id, creator: me?.penName ?? 'Chatter crew',
        },
      });
      if (result.status !== 'APPROVED' || !result.assetId) {
        setReilyProblem('import');
        setNote(result.status === 'QUARANTINED'
          ? 'That photo is saved for an adviser media check. Choose it here after approval.'
          : 'That photo could not join this graphic. Try a different image.');
        return;
      }
      const asset = await store.assets.get(result.assetId);
      if (asset) setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      updateScene((draft) => { const target = draft.elements.find((item) => item.id === targetId); if (target?.kind === 'IMAGE') target.imageAssetId = result.assetId; });
      setNote(`${file.name} is in the frame.`);
    } catch {
      setReilyProblem('import');
      setNote('That picture could not be read. Choose it again or try a different file.');
    } finally {
      if (imageInput.current) imageInput.current.value = '';
    }
  }

  async function exportVideo() {
    if (!project || !scene) return; setNote(undefined); setReilyProblem(undefined); setExporting(0);
    try { await waitForEditorFonts(); const images = new Map<string, CanvasImageSource>(); for (const id of new Set(scene.elements.map((item) => item.imageAssetId).filter((id): id is string => !!id))) { const url = imageUrls.get(id); if (url) images.set(id, await loadImage(url)); } const blob = await renderMotionScene({ project, scene, bindings, images, onProgress: setExporting }); const fileName = `${safeName(project.title)}-${safeName(scene.name)}.webm`; const bytes = new Uint8Array(await blob.arrayBuffer()); await saveDeliverable(store, { bytes, title: `${project.title} · ${scene.name}`, fileName, kind: 'VIDEO', room: 'STINGER', stage: 'WORKING', mime: 'video/webm', storyId: project.storyId, authorId: me?.id, sourceProjectId: project.id, durationSec: scene.durationMs / 1000, width: project.width, height: project.height }); download(fileName, blob); setNote('Scene saved to the Media Bin and downloaded as WebM.'); }
    catch (error) { setReilyProblem('export'); setNote((error as Error).message); } finally { setExporting(undefined); }
  }

  function requestVideoExport() {
    if (!project) return;
    if (checkMotionPackage(project).some((item) => item.severity === 'BLOCKING')) { setPendingExport(true); setShowReadyCheck(true); return; }
    void exportVideo();
  }

  async function exportPackage() {
    if (!project) return;
    setReilyProblem(undefined);
    try { const fileName = `${safeName(project.title)}.stinger.json`; const bytes = new TextEncoder().encode(JSON.stringify(project, null, 2)); await saveDeliverable(store, { bytes, title: `${project.title} · editable package`, fileName, kind: 'PACKAGE', room: 'STINGER', stage: 'WORKING', mime: 'application/json', storyId: project.storyId, authorId: me?.id, sourceProjectId: project.id }); download(fileName, new Blob([bytes as unknown as BlobPart], { type: 'application/json' })); setNote('Editable package saved to the Media Bin and downloaded.'); }
    catch (error) { setReilyProblem('export'); setNote(error instanceof Error ? error.message : 'The package file did not save. Try again.'); }
  }

  const returnToVideo = async () => {
    try { await flushProject(); onReturn?.(); }
    catch (error) { setNote(error instanceof Error ? error.message : 'Save this graphic before returning.'); }
  };
  const useInVideo = async () => {
    if (!project || !scene || !onUseGraphic || placing) return;
    setPlacing(true); setPlaying(false);
    try { await flushProject(); await onUseGraphic(projectRef.current ?? project, scene.id, bindings); }
    catch (error) { setNote(error instanceof Error ? error.message : 'This graphic could not join the video.'); }
    finally { setPlacing(false); }
  };
  const videoBar = onReturn && <div className="video-graphic-return"><div><b>Graphic designer</b><span>Choose a scene, change its words, then put it on your video.</span></div><button disabled={placing} onClick={() => void returnToVideo()}>Back to video</button>{project && <button className="primary" disabled={placing || exporting !== undefined} onClick={() => void useInVideo()}>{placing ? 'Saving graphic…' : 'Use this graphic in video'}</button>}</div>;

  if (!project) return (
    <section className="view on stinger-home">
      {videoBar}
      {note && <p role="alert">{note}</p>}
      <header className="stinger-home-hero"><div><span className="stinger-eyebrow">STINGER · ON-SCREEN GRAPHICS</span><h1>Give the show its look.</h1><p>Build the headlines, name bars, openers, transitions, and end cards that appear over or between video.</p><div className="stinger-home-steps"><span><i>1</i> Pick a package</span><span><i>2</i> Choose a graphic</span><span><i>3</i> Change the words and motion</span><span><i>4</i> Add it to your video</span></div></div><div className="stinger-home-monitor"><i>ON AIR</i><b>CHATTER</b><strong>WEEKLY HEADLINES</strong><span>STINGER</span></div></header>
      {projects.length > 0 && <section className="stinger-existing"><div><span className="stinger-eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Your show packages</h2></div><div>{projects.map((item) => <button key={item.id} onClick={() => adoptProject(item)}><i>▶</i><b>{item.title}</b><span>{item.scenes.length} graphics · {MOTION_FORMATS[item.format].label}</span></button>)}</div></section>}
      <StingerTemplateShelf familyId={starterFamilyId} onChooseFamily={setStarterFamilyId} onChooseDirection={(familyId, directionId) => void start(familyId, directionId)} />
    </section>
  );

  const scaleStyle = { '--stage-ratio': `${project.width} / ${project.height}` } as CSSProperties;
  return (
    <section className={`view on stinger-room ${project.creativeRecipe?.mode === 'GUIDED' ? 'stinger-guided' : 'stinger-freeform'}`}>
      {videoBar}
      <input ref={imageInput} hidden type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPhoto(file); }} />
      <div className="stinger-topbar">
        <div className="stinger-title"><span className="stinger-eyebrow">STINGER · SHOW PACKAGE</span><input aria-label="Package title" value={project.title} onChange={(event) => commit((draft) => { draft.title = event.target.value; })} /><button className="stinger-template-button" onClick={() => setTemplateShelfOpen(true)}><b>▦</b><span>Templates</span></button></div>
        <div className="stinger-project-menu"><label>Open kit<select aria-label="Open another package" value={project.id} onChange={(event) => { const next = projects.find((item) => item.id === event.target.value); if (next) void switchProject(next); }}><option value={project.id}>{project.title}</option>{projects.filter((item) => item.id !== project.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><span className={`stinger-save-state ${dirty ? 'dirty' : ''}`}>{dirty ? 'Saving…' : 'Saved'}</span></div>
        <div className="stinger-history"><button className="stinger-icon-button" onClick={undoOnce} disabled={!undo.length} title="Undo"><ControlIcon kind="undo" /><small>Undo</small></button><button className="stinger-icon-button" onClick={redoOnce} disabled={!redo.length} title="Redo"><ControlIcon kind="redo" /><small>Redo</small></button></div>
        {project.creativeRecipe && <div className="stinger-recipe-controls"><button onClick={() => commit((draft) => { if (draft.creativeRecipe) draft.creativeRecipe.mode = draft.creativeRecipe.mode === 'GUIDED' ? 'FREEFORM' : 'GUIDED'; })}>{project.creativeRecipe.mode === 'GUIDED' ? 'Guided' : 'Freeform'}</button><label>Try another look<select value={project.creativeRecipe.directionId} onChange={(event) => remix(event.target.value)}>{MOTION_RECIPE_FAMILIES.find((item) => item.id === project.creativeRecipe?.familyId)?.directions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>}
        <details className="stinger-file-menu"><summary>Kit menu</summary><div><button onClick={() => void leaveStinger()}>Start another kit</button><button onClick={() => void duplicateProject()}>Duplicate this kit</button><button onClick={() => void exportPackage()}>Download editable kit</button><button onClick={() => void leaveStinger('/files')}>Open Media Bin</button></div></details>
        <div className="stinger-delivery-actions" role="group" aria-label="Check and export graphic">
          <button className="stinger-ready-button" onClick={() => setShowReadyCheck((value) => !value)}>Signal Check <b>{checkMotionPackage(project).filter((item) => item.severity === 'BLOCKING').length}</b></button>
          <button className="stinger-export" disabled={exporting !== undefined || !canRenderMotionVideo()} onClick={requestVideoExport}><Icon name="ic-bolt" /><span>{exporting === undefined ? 'Export this graphic' : `Rendering ${Math.round(exporting * 100)}%`}</span><small>Silent WebM</small></button>
        </div>
      </div>

      {isStingerTemplateShelfVisible({ hasOpenProject: true, shelfRequested: templateShelfOpen }) && <div className="stinger-template-overlay" role="dialog" aria-modal="true" aria-label="Stinger templates"><button className="stinger-template-backdrop" aria-label="Close templates" onClick={() => setTemplateShelfOpen(false)} /><div className="stinger-template-dialog"><StingerTemplateShelf familyId={starterFamilyId} onChooseFamily={setStarterFamilyId} onChooseDirection={(familyId, directionId) => void start(familyId, directionId)} onClose={() => setTemplateShelfOpen(false)} /></div></div>}

      {exporting !== undefined && <LoadingStatus label="Rendering your graphic…" progress={exporting} detail="Keep this tab open until the file is ready." />}
      {note && <div className="stinger-note" role="status"><span>{note}</span><button aria-label="Dismiss message" onClick={() => setNote(undefined)}>×</button></div>}
      {showReadyCheck && <StingerReadyCheck findings={checkMotionPackage(project)} onClose={() => { setShowReadyCheck(false); setPendingExport(false); }} onContinue={pendingExport ? () => { setPendingExport(false); setShowReadyCheck(false); void exportVideo(); } : undefined} onRepair={repairFinding} onFocus={(targetSceneId, elementId) => { setSceneId(targetSceneId); setSelectedId(elementId); setShowReadyCheck(false); setPendingExport(false); }} />}
      {project.creativeRecipe?.mode === 'GUIDED' && <nav className="stinger-guided-strip" aria-label="Guided graphics steps"><span><b>GUIDED SWITCHER</b><small>Work left to right. The package keeps its visual system.</small></span><button onClick={() => { const item = scene?.elements.find((entry) => entry.kind === 'TEXT'); setSelectedId(item?.id); setInspector('DESIGN'); }}>1 · Words</button><button onClick={() => setInspector('BRAND')}>2 · Show look</button><button onClick={() => { const item = scene?.elements.find((entry) => entry.kind === 'TEXT'); setSelectedId(item?.id); setInspector('MOTION'); }}>3 · Timing</button><button onClick={togglePreview}>4 · Preview</button></nav>}

      <div className="stinger-scenes"><div className="stinger-scenes-label"><i>1</i><b>Choose a screen</b><span>Every card is one reusable screen in this kit.</span></div>{project.scenes.map((item, index) => <button key={item.id} className={item.id === scene?.id ? 'active' : ''} onClick={() => { setSceneId(item.id); setSelectedId(undefined); setAtMs(Math.min(800, item.durationMs)); }}><span>{index + 1}</span><b>{item.name}</b><small>{(item.durationMs / 1000).toFixed(1)}s · {item.background === 'transparent' ? 'over video' : 'full screen'}</small></button>)}<details className="stinger-add-scene"><summary>＋ Add screen</summary><div>{MOTION_SCENE_KINDS.map((item) => <button key={item.kind} onClick={() => { const made = createMotionScene(item.kind, project); commit((draft) => draft.scenes.push(made)); setSceneId(made.id); }}><b>{item.label}</b><small>{item.hint}</small></button>)}</div></details></div>

      <div className="stinger-workspace">
        <StingerGraphicPalette
          sceneKind={scene?.kind ?? 'HEADLINE'}
          category={graphicCategory}
          query={graphicQuery}
          recentIds={recentGraphicIds}
          showAll={showAllGraphics}
          hasImages={assets.some((item) => item.kind === 'IMAGE')}
          theme={project.theme}
          onCategory={(next) => { setGraphicCategory(next); setGraphicQuery(''); }}
          onQuery={setGraphicQuery}
          onToggleAll={() => setShowAllGraphics((value) => !value)}
          onAdd={addGraphic}
        />

        <main className="stinger-stage-area">
          <div className="stinger-stage-controls"><label>Screen size<select value={project.format} onChange={(event) => { const next = resizeMotionPackage(project, event.target.value as MotionFormat); setUndo((rows) => [...rows, copy(project)]); replaceEditedProject(next); }} >{Object.entries(MOTION_FORMATS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label><label>Fill words from<select value={project.storyId ?? ''} onChange={(event) => commit((draft) => { draft.storyId = event.target.value || undefined; })}><option value="">No linked story</option>{stories.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button className="stinger-preview" onClick={togglePreview}>{playing ? '❚❚ Pause preview' : '▶ Preview this graphic'}</button><span>{(atMs / 1000).toFixed(2)} / {((scene?.durationMs ?? 0) / 1000).toFixed(2)}s</span></div>
          <div className="stinger-stage-wrap" style={scaleStyle}><div ref={canvasRef} className={`stinger-stage ${scene?.background === 'transparent' ? 'transparent' : ''}`} style={{ width: `min(100%, ${510 * project.width / project.height}px)`, aspectRatio: `${project.width}/${project.height}`, background: scene?.backgroundSecondary ? `linear-gradient(135deg, ${scene.background}, ${scene.backgroundSecondary})` : scene?.background }} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onPointerDown={() => setSelectedId(undefined)}>
            <div className="stinger-safe-zone" />
            {scene?.elements.map((source) => { const item = motionFrameState(source, atMs, scene, bindings); const style: CSSProperties = { left: `${item.frameX / project.width * 100}%`, top: `${item.frameY / project.height * 100}%`, width: `${item.width / project.width * 100}%`, height: `${item.height / project.height * 100}%`, opacity: item.frameOpacity, transform: `rotate(${item.frameRotation}deg) scale(${item.frameScale})`, transformOrigin: 'center', color: item.fill, fontFamily: item.fontFamily, fontSize: `${item.fontSize / project.width * 100}cqw`, fontWeight: item.fontWeight, textAlign: item.align, letterSpacing: `${item.letterSpacing / project.width * 100}cqw`, lineHeight: item.lineHeight, textShadow: item.shadowBlur || item.shadowX || item.shadowY ? `${item.shadowX ?? 0}px ${item.shadowY ?? 0}px ${item.shadowBlur ?? 0}px ${item.shadowColor ?? '#000'}` : undefined, background: item.kind === 'SHAPE' ? item.fill : undefined, border: item.strokeWidth ? `${item.strokeWidth / project.width * 100}cqw solid ${item.stroke}` : undefined, borderRadius: item.radius / project.width * 100 + 'cqw', ...shapeClip(item.shape) };
              style.clipPath = item.frameReveal < .999 ? `inset(0 ${(1 - item.frameReveal) * 100}% 0 0)` : style.clipPath;
              return <div key={item.id} className={`stinger-layer ${item.kind.toLowerCase()} ${selectedId === item.id ? 'selected' : ''} ${item.locked ? 'locked' : ''}`} style={style} onPointerDown={(event) => pointerDown(event, source, 'MOVE')} onDoubleClick={() => setInspector('DESIGN')}>{item.kind === 'TEXT' ? item.visibleText : item.kind === 'IMAGE' && item.imageAssetId && imageUrls.get(item.imageAssetId) ? <img src={imageUrls.get(item.imageAssetId)} alt="" /> : null}{selectedId === item.id && !item.locked && <button className="stinger-resize" aria-label="Resize layer" onPointerDown={(event) => pointerDown(event, source, 'RESIZE')} />}</div>;
            })}
          </div></div>
        </main>

        <aside className="stinger-inspector"><div className="stinger-inspector-heading"><i>3</i><div><b>Shape the graphic</b><span>{selected ? `Editing ${selected.name}` : 'Pick something on the screen'}</span></div></div><div className="stinger-inspector-tabs">{INSPECTOR_TABS.map((tab) => { const state = inspectorTabs.find((item) => item.id === tab.id)!; return <button key={tab.id} className={activeInspector === tab.id ? 'active' : ''} disabled={!state.available} title={state.unavailableReason} aria-label={state.unavailableReason ? `${tab.label}. ${state.unavailableReason}` : tab.label} onClick={() => setInspector(tab.id)}><b>{tab.icon}</b><span>{tab.label}</span></button>; })}</div>
          {activeInspector === 'BRAND' ? <div className="stinger-panel"><h3>Show identity</h3><label>Show name<input value={project.theme.showName} onChange={(event) => commit((draft) => { draft.theme.showName = event.target.value; })} /></label><div className="stinger-color-grid">{(['primary', 'secondary', 'accent', 'paper', 'ink'] as const).map((key) => <label key={key}>{key}<input type="color" value={project.theme[key]} onChange={(event) => commit((draft) => { draft.theme[key] = event.target.value; })} /></label>)}</div><label>Display type<FontSelect value={project.theme.fontDisplay} sample={project.theme.showName} ariaLabel="Package display font" onChange={(fontFamily) => commit((draft) => { draft.theme.fontDisplay = fontFamily; })} /></label><button className="b sm" onClick={() => commit((draft) => { draft.scenes.forEach((entry) => { entry.elements.forEach((item) => { if (item.kind === 'TEXT') item.fontFamily = item.name === 'Headline' ? draft.theme.fontDisplay : draft.theme.fontBody; }); }); })}>Apply type to package</button><p className="stinger-help">Brand changes stay linked to this package. Duplicate it before making a different show identity.</p></div>
          : !selected ? <div className="stinger-panel"><h3>{scene?.name}</h3><p className="stinger-help">Select a layer to edit it, or change this scene.</p><label>Scene name<input value={scene?.name ?? ''} onChange={(event) => updateScene((draft) => { draft.name = event.target.value; })} /></label><label>Duration (seconds)<input type="number" min="0.5" max="30" step="0.1" value={(scene?.durationMs ?? 0) / 1000} onChange={(event) => updateScene((draft) => { const duration = Number(event.target.value) * 1000; draft.durationMs = duration; draft.elements.forEach((item) => { item.endMs = Math.min(item.endMs, duration); }); })} /></label><label>Background<input type="color" value={scene?.background === 'transparent' ? project.theme.primary : scene?.background} onChange={(event) => updateScene((draft) => { draft.background = event.target.value; })} /></label><label className="stinger-check"><input type="checkbox" checked={scene?.background === 'transparent'} onChange={(event) => updateScene((draft) => { draft.background = event.target.checked ? 'transparent' : project.theme.primary; })} />Overlay on video</label><label>Sound cue<select value={scene?.audioAssetId ?? ''} onChange={(event) => updateScene((draft) => { draft.audioAssetId = event.target.value || undefined; })}><option value="">No sound cue</option>{assets.filter((item) => item.kind === 'AUDIO').map((item) => <option key={item.id} value={item.id}>{item.creator || 'Club audio'} · {Math.round(item.bytes / 1024)} KB</option>)}</select></label>{scene?.audioAssetId && imageUrls.get(scene.audioAssetId) && <audio className="stinger-audio" controls src={imageUrls.get(scene.audioAssetId)} />}<p className="stinger-help">The cue previews here and travels with the editable package. Use this graphic in video to place its sound on the Sounds track. Visual WebM export stays silent.</p><div className="stinger-row"><button disabled={project.scenes[0]?.id === scene?.id} onClick={() => { if (!scene) return; commit((draft) => { const index = draft.scenes.findIndex((item) => item.id === scene.id); [draft.scenes[index - 1], draft.scenes[index]] = [draft.scenes[index]!, draft.scenes[index - 1]!]; }); }}>← Earlier</button><button disabled={project.scenes.at(-1)?.id === scene?.id} onClick={() => { if (!scene) return; commit((draft) => { const index = draft.scenes.findIndex((item) => item.id === scene.id); [draft.scenes[index], draft.scenes[index + 1]] = [draft.scenes[index + 1]!, draft.scenes[index]!]; }); }}>Later →</button></div><div className="stinger-row"><button onClick={() => { if (!scene) return; const made = cloneMotionScene(scene); commit((draft) => draft.scenes.splice(draft.scenes.findIndex((item) => item.id === scene.id) + 1, 0, made)); setSceneId(made.id); }}>Duplicate scene</button><button disabled={project.scenes.length <= 1} onClick={() => { if (!scene) return; commit((draft) => { draft.scenes = draft.scenes.filter((item) => item.id !== scene.id); }); setSceneId(project.scenes.find((item) => item.id !== scene.id)?.id); }}>Remove</button></div></div>
          : activeInspector === 'DESIGN' ? <div className="stinger-panel"><h3>{selected.name}</h3>{selected.kind === 'TEXT' && <><label>Text<textarea value={selected.text ?? ''} onChange={(event) => updateSelected({ text: event.target.value, binding: 'CUSTOM' })} /></label><label>Font<FontSelect value={selected.fontFamily} sample={selected.text ?? 'Aa'} ariaLabel="Layer font" onChange={(fontFamily) => updateSelected({ fontFamily })} /></label><div className="stinger-two"><label>Size<input type="number" value={Math.round(selected.fontSize)} onChange={(event) => updateSelected({ fontSize: Number(event.target.value) })} /></label><label>Weight<input type="number" min="100" max="900" step="100" value={selected.fontWeight} onChange={(event) => updateSelected({ fontWeight: Number(event.target.value) })} /></label></div><div className="stinger-segmented">{(['left', 'center', 'right'] as const).map((value) => <button key={value} className={selected.align === value ? 'active' : ''} onClick={() => updateSelected({ align: value })}>{value}</button>)}</div></>}{selected.kind === 'SHAPE' && <label>Shape<select value={selected.shape} onChange={(event) => updateSelected({ shape: event.target.value as MotionElement['shape'] })}><option value="RECTANGLE">Rectangle</option><option value="ELLIPSE">Circle</option><option value="TRIANGLE">Triangle</option><option value="LINE">Line</option></select></label>}{selected.kind === 'IMAGE' && <><label>Approved media<select value={selected.imageAssetId ?? ''} onChange={(event) => updateSelected({ imageAssetId: event.target.value })}><option value="">Choose a photo</option>{assets.filter((item) => item.kind === 'IMAGE').map((item) => <option key={item.id} value={item.id}>{item.creator || 'Club image'} · {Math.round(item.bytes / 1024)} KB</option>)}</select></label><button className="b sm" onClick={() => imageInput.current?.click()}>Import a photo</button>{!assets.some((item) => item.kind === 'IMAGE') && <p className="stinger-help">No approved photos are in this story yet. Import one here; if it needs an adviser check, the frame stays ready while it waits.</p>}</>}<div className="stinger-two"><label>Fill<input type="color" value={selected.fill} onChange={(event) => updateSelected({ fill: event.target.value })} /></label><label>Opacity<input type="number" min="0" max="100" value={Math.round(selected.opacity * 100)} onChange={(event) => updateSelected({ opacity: Number(event.target.value) / 100 })} /></label></div><div className="stinger-two"><label>X<input type="number" value={Math.round(selected.x)} onChange={(event) => updateSelected({ x: Number(event.target.value) })} /></label><label>Y<input type="number" value={Math.round(selected.y)} onChange={(event) => updateSelected({ y: Number(event.target.value) })} /></label><label>Width<input type="number" value={Math.round(selected.width)} onChange={(event) => updateSelected({ width: Number(event.target.value) })} /></label><label>Height<input type="number" value={Math.round(selected.height)} onChange={(event) => updateSelected({ height: Number(event.target.value) })} /></label><label>Rotate<input type="number" value={Math.round(selected.rotation)} onChange={(event) => updateSelected({ rotation: Number(event.target.value) })} /></label><label>Corner<input type="number" value={Math.round(selected.radius)} onChange={(event) => updateSelected({ radius: Number(event.target.value) })} /></label></div><div className="stinger-row"><label className="stinger-check"><input type="checkbox" checked={selected.locked} onChange={(event) => updateSelected({ locked: event.target.checked })} />Lock</label><label className="stinger-check"><input type="checkbox" checked={selected.hidden} onChange={(event) => updateSelected({ hidden: event.target.checked })} />Hide</label></div><div className="stinger-row"><button disabled={scene?.elements[0]?.id === selected.id} onClick={() => updateScene((draft) => { const index = draft.elements.findIndex((item) => item.id === selected.id); [draft.elements[index - 1], draft.elements[index]] = [draft.elements[index]!, draft.elements[index - 1]!]; })}>Send back</button><button disabled={scene?.elements.at(-1)?.id === selected.id} onClick={() => updateScene((draft) => { const index = draft.elements.findIndex((item) => item.id === selected.id); [draft.elements[index], draft.elements[index + 1]] = [draft.elements[index + 1]!, draft.elements[index]!]; })}>Bring forward</button></div><button className="stinger-danger" onClick={() => { updateScene((draft) => { draft.elements = draft.elements.filter((item) => item.id !== selected.id); }); setSelectedId(undefined); }}>Delete layer</button></div>
          : activeInspector === 'MOTION' ? <div className="stinger-panel"><h3>Motion</h3><label>Entrance<select value={selected.enter} onChange={(event) => updateSelected({ enter: event.target.value as MotionPreset })}>{PRESETS.map((value) => <option key={value}>{value}</option>)}</select></label><label>Exit<select value={selected.exit} onChange={(event) => updateSelected({ exit: event.target.value as MotionPreset })}>{PRESETS.map((value) => <option key={value}>{value}</option>)}</select></label><label>Easing<select value={selected.ease} onChange={(event) => updateSelected({ ease: event.target.value as MotionElement['ease'] })}><option value="EASE_OUT">Easy out</option><option value="EASE_IN_OUT">Easy both</option><option value="BACK_OUT">Overshoot</option><option value="LINEAR">Linear</option></select></label><div className="stinger-two"><label>Starts<input type="number" step="0.1" min="0" value={(selected.startMs / 1000).toFixed(1)} onChange={(event) => updateSelected({ startMs: Number(event.target.value) * 1000 })} /></label><label>Ends<input type="number" step="0.1" min="0" value={(selected.endMs / 1000).toFixed(1)} onChange={(event) => updateSelected({ endMs: Number(event.target.value) * 1000 })} /></label></div><button className="b go" onClick={addKeyframe}>◆ Keyframe at playhead</button><div className="stinger-key-list">{selected.keyframes.map((frame) => <button key={frame.id} onClick={() => setAtMs(frame.atMs)}><span>◆</span>{(frame.atMs / 1000).toFixed(2)}s<i onClick={(event) => { event.stopPropagation(); updateSelected({ keyframes: selected.keyframes.filter((item) => item.id !== frame.id) }); }}>×</i></button>)}</div><p className="stinger-help">Move the playhead, move or resize the layer, then add another keyframe. Stinger fills in the movement.</p></div>
          : <div className="stinger-panel"><h3>Live story data</h3>{selected.kind === 'TEXT' ? <><label>Text source<select value={selected.binding ?? 'CUSTOM'} onChange={(event) => updateSelected({ binding: event.target.value as MotionBinding })}><option value="CUSTOM">Custom text</option><option value="SHOW_NAME">Show name</option><option value="STORY_TITLE">Story headline</option><option value="BYLINE">Reporter byline</option><option value="CHANNEL">Story channel</option><option value="QUOTE">Story quote</option></select></label><div className="stinger-data-preview"><small>On screen now</small><b>{motionFrameState(selected, atMs, scene!, bindings).visibleText || 'Nothing yet'}</b></div><p className="stinger-help">Bound text updates when this package is used with another story. No retyping every lower third.</p></> : <p className="stinger-help">Data binding is available for text layers. Select a text layer or add one.</p>}</div>}
        </aside>
      </div>

      <div className="stinger-timeline"><div className="stinger-transport"><header><i>4</i><div><b>Layer timing</b><span>Play the graphic or scrub to any moment.</span></div></header><div><button onClick={() => { setPlaying(false); setAtMs(0); }}>│◀</button><button className="play" onClick={togglePreview}>{playing ? '❚❚' : '▶'}</button><b>{(atMs / 1000).toFixed(2)}s</b></div><input aria-label="Timeline playhead" type="range" min="0" max={scene?.durationMs ?? 0} step="10" value={atMs} onChange={(event) => { setPlaying(false); setAtMs(Math.max(0, Number(event.target.value))); }} /></div><div className="stinger-tracks">{scene?.elements.map((item) => <button key={item.id} className={selectedId === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}><span>{item.kind === 'TEXT' ? 'T' : item.kind === 'IMAGE' ? '▧' : '◆'} {item.name}</span><i style={{ left: `${item.startMs / scene.durationMs * 100}%`, width: `${(item.endMs - item.startMs) / scene.durationMs * 100}%` }}>{item.keyframes.map((frame) => <em key={frame.id} style={{ left: `${(frame.atMs - item.startMs) / Math.max(1, item.endMs - item.startMs) * 100}%` }}>◆</em>)}</i></button>)}</div></div>
    </section>
  );
}
