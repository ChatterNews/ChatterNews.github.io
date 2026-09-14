import { newId } from './ids.js';
import type {
  MotionBinding, MotionEase, MotionElement, MotionFormat, MotionKeyframe,
  MotionPackage, MotionPreset, MotionScene, MotionSceneKind, MotionTheme,
} from './types.js';
import type { TranscriptSegment } from './transcribe.js';
import { MOTION_RECIPE_FAMILIES, makeMotionRecipeScene, resolveMotionRecipe } from './stinger-recipes.js';

/* Transcript helpers remain exported for Showtime, where cutting tape belongs. */
export function captionAt(segments: readonly TranscriptSegment[], at: number): TranscriptSegment | undefined {
  return segments.find((segment) => at >= segment.start && at < segment.end);
}

export function captionLines(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) line = candidate;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

export function clipWindow(segments: readonly TranscriptSegment[], fromIndex: number, maxSeconds: number): { start: number; end: number } {
  if (!segments.length) return { start: 0, end: 0 };
  const first = segments[Math.min(Math.max(0, fromIndex), segments.length - 1)]!;
  const last = segments[segments.length - 1]!;
  return { start: first.start, end: Math.min(last.end, first.start + maxSeconds) };
}

export const MOTION_FORMATS: Record<MotionFormat, { label: string; width: number; height: number }> = {
  WIDE: { label: '16:9 Show', width: 1920, height: 1080 },
  VERTICAL: { label: '9:16 Social', width: 1080, height: 1920 },
  SQUARE: { label: '1:1 Square', width: 1080, height: 1080 },
};

export const MOTION_SCENE_KINDS: Array<{ kind: MotionSceneKind; label: string; hint: string }> = [
  { kind: 'OPEN', label: 'Show open', hint: 'Names the whole show' },
  { kind: 'HEADLINE', label: 'Headline', hint: 'Introduces one story' },
  { kind: 'LOWER_THIRD', label: 'Lower third', hint: 'Names a person on screen' },
  { kind: 'QUOTE', label: 'Quote', hint: 'Makes a strong line visible' },
  { kind: 'STAT', label: 'Big number', hint: 'Turns a fact into a graphic' },
  { kind: 'COMING_UP', label: 'Coming up', hint: 'Teases what is next' },
  { kind: 'TRANSITION', label: 'Transition', hint: 'Moves between stories' },
  { kind: 'END', label: 'End card', hint: 'Closes the show' },
];

export interface MotionTemplate {
  id: string;
  label: string;
  description: string;
  theme: MotionTheme;
  bestFor?: string;
}

export const MOTION_PACKAGE_TEMPLATES: MotionTemplate[] = MOTION_RECIPE_FAMILIES.map((family) => ({
  id: family.id,
  label: family.name,
  description: family.job,
  bestFor: family.bestFor,
  theme: family.directions[0].theme,
}));

export function createMotionPackage(templateId: MotionTemplate['id'], input: { title?: string; authorId?: string; storyId?: string } = {}): MotionPackage {
  const { family, direction } = resolveMotionRecipe(templateId);
  const now = Date.now(); const { width, height } = MOTION_FORMATS.WIDE;
  const sceneKinds = templateId === 'bulletin' || templateId === 'clean-desk' || templateId === 'yearbook-pop' || templateId === 'sports-desk'
    ? (['OPEN', 'HEADLINE', 'LOWER_THIRD', 'TRANSITION', 'END'] as MotionSceneKind[])
    : family.sceneKinds;
  return {
    id: newId(), createdAt: now, updatedAt: now, title: input.title ?? `${family.name} package`,
    authorId: input.authorId, storyId: input.storyId, format: 'WIDE', width, height, theme: structuredClone(direction.theme),
    scenes: sceneKinds.map((kind) => makeMotionRecipeScene(family.id, direction.id, kind, width, height)),
    creativeRecipe: { familyId: family.id, directionId: direction.id, mode: 'GUIDED' },
  };
}

export function createMotionScene(kind: MotionSceneKind, project: Pick<MotionPackage, 'theme' | 'width' | 'height' | 'creativeRecipe'>): MotionScene {
  return makeMotionRecipeScene(project.creativeRecipe?.familyId ?? 'morning-news', project.creativeRecipe?.directionId, kind, project.width, project.height);
}

export function cloneMotionScene(source: MotionScene): MotionScene {
  return { ...structuredClone(source), id: newId(), name: `${source.name} copy`, elements: source.elements.map((item) => ({ ...structuredClone(item), id: newId(), keyframes: item.keyframes.map((frame) => ({ ...frame, id: newId() })) })) };
}

export function resizeMotionPackage(project: MotionPackage, format: MotionFormat): MotionPackage {
  const next = MOTION_FORMATS[format]; const sx = next.width / project.width; const sy = next.height / project.height;
  return { ...project, format, width: next.width, height: next.height, scenes: project.scenes.map((scene) => ({ ...scene, elements: scene.elements.map((item) => ({
    ...item, x: item.x * sx, y: item.y * sy, width: item.width * sx, height: item.height * sy, fontSize: item.fontSize * Math.min(sx, sy),
    shadowX: item.shadowX === undefined ? undefined : item.shadowX * sx, shadowY: item.shadowY === undefined ? undefined : item.shadowY * sy,
    shadowBlur: item.shadowBlur === undefined ? undefined : item.shadowBlur * Math.min(sx, sy),
    keyframes: item.keyframes.map((frame) => ({ ...frame, x: frame.x === undefined ? undefined : frame.x * sx, y: frame.y === undefined ? undefined : frame.y * sy })),
  })) })) };
}

/** Resize the scene's clock while preserving every layer's relative cue. */
export function retimeMotionScene(scene: MotionScene, requestedDurationMs: number): MotionScene {
  if (!Number.isFinite(requestedDurationMs)) return structuredClone(scene);
  const durationMs = Math.round(Math.max(500, Math.min(30_000, requestedDurationMs)));
  const scale = durationMs / Math.max(1, scene.durationMs);
  return {
    ...structuredClone(scene),
    durationMs,
    elements: scene.elements.map((item) => {
      const startMs = Math.max(0, Math.min(durationMs - 1, Math.round(item.startMs * scale)));
      const endMs = Math.max(startMs + 1, Math.min(durationMs, Math.round(item.endMs * scale)));
      return {
        ...structuredClone(item),
        startMs,
        endMs,
        keyframes: item.keyframes.map((frame) => ({
          ...structuredClone(frame),
          atMs: Math.max(startMs, Math.min(endMs, Math.round(frame.atMs * scale))),
        })),
      };
    }),
  };
}

/** A pure clock step for editor preview; elapsed time can never run backward. */
export function advanceMotionPlayhead(startAtMs: number, elapsedMs: number, durationMs: number): { atMs: number; complete: boolean } {
  const safeDuration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  const safeStart = Math.max(0, Math.min(safeDuration, Number.isFinite(startAtMs) ? startAtMs : 0));
  const atMs = Math.min(safeDuration, safeStart + Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  return { atMs, complete: atMs >= safeDuration };
}

export interface MotionBindings { showName?: string; storyTitle?: string; byline?: string; channel?: string; quote?: string }
export function resolveMotionText(item: MotionElement, bindings: MotionBindings): string {
  const values: Record<MotionBinding, string | undefined> = { CUSTOM: item.text, SHOW_NAME: bindings.showName, STORY_TITLE: bindings.storyTitle, BYLINE: bindings.byline, CHANNEL: bindings.channel, QUOTE: bindings.quote };
  return values[item.binding ?? 'CUSTOM'] || item.text || '';
}

export interface MotionFrameElement extends MotionElement { frameX: number; frameY: number; frameScale: number; frameRotation: number; frameOpacity: number; frameReveal: number; visibleText: string }
function ease(value: number, kind: MotionEase): number {
  const t = Math.max(0, Math.min(1, value));
  if (kind === 'LINEAR') return t;
  if (kind === 'EASE_IN_OUT') return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  if (kind === 'BACK_OUT') { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  return 1 - Math.pow(1 - t, 3);
}

function interpolateFrames(item: MotionElement, atMs: number) {
  const base = { atMs: item.startMs, x: item.x, y: item.y, scale: item.scale, rotation: item.rotation, opacity: item.opacity };
  const frames = [base, ...item.keyframes].sort((a, b) => a.atMs - b.atMs);
  const nextIndex = frames.findIndex((frame) => frame.atMs >= atMs);
  if (nextIndex <= 0) return { ...base, ...frames[Math.max(0, nextIndex)] };
  if (nextIndex === -1) return { ...base, ...frames[frames.length - 1] };
  const before = frames[nextIndex - 1]!; const after = frames[nextIndex]!; const t = ease((atMs - before.atMs) / Math.max(1, after.atMs - before.atMs), item.ease);
  const number = (key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity') => { const a = before[key] ?? base[key]; const b = after[key] ?? a; return a + (b - a) * t; };
  return { atMs, x: number('x'), y: number('y'), scale: number('scale'), rotation: number('rotation'), opacity: number('opacity') };
}

function presetOffset(preset: MotionPreset, progress: number, width: number, height: number) {
  const remaining = 1 - progress;
  return { x: preset === 'SLIDE_LEFT' ? width * remaining : preset === 'SLIDE_RIGHT' ? -width * remaining : 0, y: preset === 'SLIDE_UP' ? height * .3 * remaining : 0, scale: preset === 'POP' ? .6 + .4 * progress : preset === 'SPIN' ? .7 + .3 * progress : 1, rotation: preset === 'SPIN' ? -180 * remaining : 0, opacity: ['FADE', 'SLIDE_LEFT', 'SLIDE_RIGHT', 'SLIDE_UP', 'POP', 'SPIN'].includes(preset) ? progress : 1, reveal: preset === 'WIPE' ? progress : 1 };
}

/** Pure, deterministic evaluation used by both editor preview and encoder. */
export function motionFrameState(item: MotionElement, atMs: number, scene: MotionScene, bindings: MotionBindings = {}): MotionFrameElement {
  const local = Math.max(item.startMs, Math.min(item.endMs, atMs)); const keyed = interpolateFrames(item, local);
  const enterDuration = Math.min(650, Math.max(1, (item.endMs - item.startMs) * .25)); const exitDuration = Math.min(500, Math.max(1, (item.endMs - item.startMs) * .2));
  const entering = presetOffset(item.enter, ease((atMs - item.startMs) / enterDuration, item.ease), item.width, item.height);
  const exiting = presetOffset(item.exit, ease((item.endMs - atMs) / exitDuration, item.ease), item.width, item.height);
  const active = !item.hidden && atMs >= item.startMs && atMs <= Math.min(item.endMs, scene.durationMs); const text = resolveMotionText(item, bindings);
  const typeProgress = item.enter === 'TYPE_ON' ? Math.max(0, Math.min(1, (atMs - item.startMs) / Math.min(1200, enterDuration * 2))) : 1;
  return { ...item, frameX: (keyed.x ?? item.x) + entering.x + exiting.x, frameY: (keyed.y ?? item.y) + entering.y + exiting.y, frameScale: (keyed.scale ?? item.scale) * entering.scale * exiting.scale, frameRotation: (keyed.rotation ?? item.rotation) + entering.rotation + exiting.rotation, frameOpacity: active ? (keyed.opacity ?? item.opacity) * entering.opacity * exiting.opacity : 0, frameReveal: Math.min(entering.reveal, exiting.reveal), visibleText: text.slice(0, Math.ceil(text.length * typeProgress)) };
}

export function validateMotionPackage(project: MotionPackage): string[] {
  const problems: string[] = [];
  if (!project.title.trim()) problems.push('Give the package a title.');
  if (!project.scenes.length) problems.push('Add at least one scene.');
  for (const scene of project.scenes) {
    if (scene.durationMs < 500 || scene.durationMs > 30_000) problems.push(`${scene.name}: duration must be between 0.5 and 30 seconds.`);
    for (const item of scene.elements) {
      if (item.startMs < 0 || item.endMs > scene.durationMs || item.endMs <= item.startMs) problems.push(`${scene.name} / ${item.name}: layer timing falls outside the scene.`);
      if (![item.x, item.y, item.width, item.height, item.opacity, item.scale].every(Number.isFinite)) problems.push(`${scene.name} / ${item.name}: a layer value is not a number.`);
      if (item.keyframes.some((frame: MotionKeyframe) => frame.atMs < item.startMs || frame.atMs > item.endMs)) problems.push(`${scene.name} / ${item.name}: a keyframe falls outside the layer.`);
    }
  }
  return problems;
}

/* Compatibility for older callers while clip editing migrates to Showtime. */
export type TemplateId = 'name-bar' | 'topic-bar' | 'phone-shape' | 'show-art' | 'ending-card';
export interface TemplateFields { title?: string; penName?: string; gradeBand?: string; kicker?: string; quote?: string }
export interface TemplateData { id: TemplateId; lines: string[]; shape: 'vertical' | 'wide' }
const SHAPES: Record<TemplateId, 'vertical' | 'wide'> = { 'name-bar': 'wide', 'topic-bar': 'wide', 'phone-shape': 'vertical', 'show-art': 'wide', 'ending-card': 'wide' };
export function templateData(id: TemplateId, fields: TemplateFields): TemplateData {
  const map: Record<TemplateId, Array<string | undefined>> = { 'name-bar': [fields.penName, fields.gradeBand], 'topic-bar': [fields.title, fields.kicker], 'phone-shape': [fields.quote ?? fields.title], 'show-art': ['Chatter', fields.title], 'ending-card': ['THE END'] };
  return { id, lines: map[id].filter((line): line is string => !!line), shape: SHAPES[id] };
}
export const TEMPLATES = ([['name-bar', 'Name bar'], ['topic-bar', 'Topic bar'], ['phone-shape', 'Phone shape'], ['show-art', 'Show art'], ['ending-card', 'Ending card']] as const).map(([id, label]) => ({ id, label }));
