import { newId } from './ids.js';
import { resolveMotionText, validateMotionPackage, type MotionBindings } from './stinger.js';
import type { MotionPackage, ShowtimeProject, ShowtimeTitle } from './types.js';

/** A timeline placement owns its copy, so later kit edits cannot change a finished cut. */
export function makeVideoGraphic(source: MotionPackage, sceneId: string, startSec: number, bindings: MotionBindings = {}): ShowtimeTitle {
  const sourceScene = source.scenes.find(scene => scene.id === sceneId);
  if (!sourceScene) throw new Error('Choose a graphic before adding it to the video.');
  const scene = structuredClone(sourceScene);
  // Sound is placed on an audio track by the editor, with its own mute/trim controls.
  delete scene.audioAssetId;
  scene.elements = scene.elements.map(element => element.kind === 'TEXT'
    ? { ...element, text: resolveMotionText(element, bindings), binding: 'CUSTOM' } : element);
  const start = Math.max(0, startSec);
  return { id: newId(), kind: scene.kind === 'LOWER_THIRD' ? 'LOWER_THIRD' : 'HEADLINE', text: scene.name,
    subtext: '', startSec: start, endSec: start + scene.durationMs / 1000, position: 'MIDDLE',
    background: source.theme.primary, color: source.theme.ink,
    motion: { ...structuredClone(source), scenes: [scene] } };
}

export function videoGraphicAssetIds(titles: ShowtimeTitle[]): string[] {
  return [...new Set(titles.flatMap(title => title.motion ? [title.motion.theme.logoAssetId,
    ...title.motion.scenes.flatMap(scene => scene.elements.map(element => element.imageAssetId))] : [])
    .filter((id): id is string => !!id))];
}

export function videoProjectAssetIds(project: Pick<ShowtimeProject, 'clips' | 'titles'>): string[] {
  return [...new Set([...project.clips.map(clip => clip.assetId), ...videoGraphicAssetIds(project.titles)])];
}

export function remapVideoGraphics(titles: ShowtimeTitle[], assets: Map<string, string>): ShowtimeTitle[] {
  return titles.map(title => !title.motion ? title : { ...title, motion: { ...title.motion,
    theme: { ...title.motion.theme, logoAssetId: title.motion.theme.logoAssetId ? assets.get(title.motion.theme.logoAssetId) : undefined },
    scenes: title.motion.scenes.map(scene => ({ ...scene, audioAssetId: undefined,
      elements: scene.elements.map(element => ({ ...element, imageAssetId: element.imageAssetId ? assets.get(element.imageAssetId) : undefined })) })) } });
}

/** Embedded graphics are optional on old cuts; malformed new snapshots are rejected before import. */
export function isVideoGraphic(value: unknown): value is MotionPackage {
  try {
    const graphic = value as MotionPackage;
    return !!graphic && typeof graphic.title === 'string'
      && Number.isFinite(graphic.width) && graphic.width > 0 && graphic.width <= 8192
      && Number.isFinite(graphic.height) && graphic.height > 0 && graphic.height <= 8192
      && !!graphic.theme && typeof graphic.theme.primary === 'string' && typeof graphic.theme.ink === 'string'
      && Array.isArray(graphic.scenes) && graphic.scenes.length === 1
      && graphic.scenes.every(scene => Number.isFinite(scene.durationMs) && typeof scene.background === 'string'
        && Array.isArray(scene.elements) && scene.elements.length <= 500
        && scene.elements.every(element => ['TEXT', 'SHAPE', 'IMAGE'].includes(element.kind)
          && Number.isFinite(element.startMs) && Number.isFinite(element.endMs)
          && Array.isArray(element.keyframes) && element.keyframes.length <= 500))
      && validateMotionPackage(graphic).length === 0;
  } catch { return false; }
}
