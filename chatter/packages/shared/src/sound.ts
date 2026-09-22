import type { Base } from './types.js';
import { newId } from './ids.js';

export interface SoundAttribution {
  creator: string; sourceUrl: string; license: string; licenseUrl: string; notes: string;
}
export interface SoundGenerator {
  version: 1; kind: 'NOISE' | 'TONE'; seed: number; duration: number;
  frequency: number; endFrequency: number; attack: number; release: number;
  pulseHz: number; color: 'WHITE' | 'LOW';
}
export interface SoundClip {
  id: string; name: string; trackId: string; assetId?: string; libraryItemId?: string; generator?: SoundGenerator;
  start: number; sourceIn: number; sourceOut: number; rate: number; repeats: number;
  gainDb: number; fadeIn: number; fadeOut: number;
}
export interface SoundTrack {
  id: string; name: string; gainDb: number; pan: number; muted: boolean;
  filterHz: number; delaySec: number; delayMix: number; reverbMix: number;
}
export interface SoundProject extends Base {
  schemaVersion: 1; revision: number; storyId?: string; name: string; credits: string;
  tracks: SoundTrack[]; clips: SoundClip[]; bpm: number; snap: 'SECONDS' | 'BEATS' | 'OFF';
  exportStart: number; exportEnd: number; loop: boolean; loopCrossfade?: number;
}
export interface SoundLibraryItem extends Base {
  assetId: string; name: string; attribution: SoundAttribution; tags: string[];
  collectionIds: string[]; favorite: boolean; archived: boolean; duration: number;
  peaks: number[]; revisionId?: string; projectId?: string;
}
export interface SoundCollection extends Base { name: string }
export interface SoundRevision extends Base {
  projectId: string; assetId: string; snapshot: SoundProject; sourceAssetIds: string[];
  attribution: SoundAttribution[]; sourceAttribution?: { assetId: string; attribution: SoundAttribution }[]; recipeHash: string; duration: number;
}

export const emptySoundAttribution = (): SoundAttribution => ({ creator: '', sourceUrl: '', license: '', licenseUrl: '', notes: '' });

export interface SoundOperation extends Base {
  state: 'STAGED' | 'COMMITTED'; item?: SoundLibraryItem; revision?: SoundRevision;
  imported?: { projects: SoundProject[]; revisions: SoundRevision[]; items: SoundLibraryItem[]; collections: SoundCollection[]; maps: { projects: [string, string][]; revisions: [string, string][]; items: [string, string][]; assets: [string, string][] } };
}
export const SOUND_LIMITS = { tracks: 8, clips: 64, duration: 300, sourceBytes: 64 * 1024 * 1024 } as const;
export function makeSoundProject(name: string, storyId?: string): SoundProject {
  const now = Date.now();
  return { id: newId(), createdAt: now, updatedAt: now, schemaVersion: 1, revision: 0, name,
    ...(storyId ? { storyId } : {}), credits: '', tracks: [{ id: newId(), name: 'Track 1', gainDb: 0,
      pan: 0, muted: false, filterHz: 20000, delaySec: 0, delayMix: 0, reverbMix: 0 }],
    clips: [], bpm: 120, snap: 'SECONDS', exportStart: 0, exportEnd: 5, loop: false };
}
const text = (value: unknown, max: number, required = false): value is string =>
  typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const num = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const id = (v: unknown) => text(v, 160, true);
function fail(message: string): never { throw new Error(`Sound: ${message}`); }
export function validateSoundAttribution(value: SoundAttribution): void {
  if (!value || !text(value.creator, 300) || !text(value.license, 200) || !text(value.notes, 4000)) fail('source details are too long or invalid.');
  for (const url of [value.sourceUrl, value.licenseUrl]) {
    if (!text(url, 2048)) fail('source link is too long.');
    if (url) { try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('use a public http or https source link.'); } catch { fail('use a valid http or https source link.'); } }
  }
}
export function validateSoundProject(p: SoundProject): void {
  if (!p || p.schemaVersion !== 1 || !id(p.id) || !text(p.name, 200, true) || !text(p.credits, 10000) ||
      !num(p.revision, 0, Number.MAX_SAFE_INTEGER) || !Number.isInteger(p.revision) || !num(p.createdAt, 0, 1e16) || !num(p.updatedAt, 0, 1e16) ||
      (p.storyId !== undefined && !id(p.storyId))) fail('invalid project identity or credits.');
  if (!Array.isArray(p.tracks) || p.tracks.length < 1 || p.tracks.length > 8 || !Array.isArray(p.clips) || p.clips.length > 64) fail('use up to eight tracks and 64 clips.');
  if (!num(p.exportStart, 0, 300) || !num(p.exportEnd, p.exportStart + .001, 300) || !num(p.bpm, 30, 300) || !['SECONDS', 'BEATS', 'OFF'].includes(p.snap) || typeof p.loop !== 'boolean') fail('choose an export range within five minutes.');
  if (p.loopCrossfade !== undefined && !num(p.loopCrossfade, 0, 2)) fail('invalid loop crossfade.');
  const tracks = new Set<string>(); const clips = new Set<string>();
  for (const t of p.tracks) {
    if (!t || !id(t.id) || tracks.has(t.id) || !text(t.name, 200) || !num(t.gainDb, -60, 12) || !num(t.pan, -1, 1) || typeof t.muted !== 'boolean' || !num(t.filterHz, 20, 24000) || !num(t.delaySec, 0, 2) || !num(t.delayMix, 0, 1) || !num(t.reverbMix, 0, 1)) fail('invalid track or effect setting.');
    tracks.add(t.id);
  }
  for (const c of p.clips) {
    if (!c || !id(c.id) || clips.has(c.id) || !tracks.has(c.trackId) || !text(c.name, 200) || (!!c.assetId === !!c.generator) || (c.assetId !== undefined && !id(c.assetId)) || (c.libraryItemId !== undefined && !id(c.libraryItemId)) || !num(c.start, 0, 300) || !num(c.sourceIn, 0, 300) || !num(c.sourceOut, c.sourceIn + .00001, 300) || !num(c.rate, .25, 4) || !num(c.repeats, 1, 64) || !Number.isInteger(c.repeats) || !num(c.gainDb, -60, 12) || !num(c.fadeIn, 0, 300) || !num(c.fadeOut, 0, 300)) fail('invalid clip, source, or trim.');
    clips.add(c.id);
    if (c.generator) {
      const g = c.generator;
      if (g.version !== 1 || !['NOISE', 'TONE'].includes(g.kind) || !['WHITE', 'LOW'].includes(g.color) || !num(g.seed, 0, 0xffffffff) || !Number.isInteger(g.seed) || !num(g.duration, .001, 300) || !num(g.frequency, 20, 20000) || !num(g.endFrequency, 20, 20000) || !num(g.attack, 0, 300) || !num(g.release, 0, 300) || !num(g.pulseHz, 0, 100) || c.sourceOut > g.duration) fail('invalid generator recipe.');
    }
  }
}
export function soundSourceAssetIds(project: SoundProject): string[] {
  return [...new Set(project.clips.flatMap(c => c.assetId ? [c.assetId] : []))];
}
export function validateSoundItem(item: SoundLibraryItem): void {
  if (!item || !id(item.id) || !id(item.assetId) || !text(item.name, 200, true) || !num(item.duration, 0, 300) ||
      !Array.isArray(item.tags) || item.tags.length > 40 || !item.tags.every(t => text(t, 80, true)) ||
      !Array.isArray(item.collectionIds) || item.collectionIds.length > 100 || !item.collectionIds.every(id) ||
      typeof item.favorite !== 'boolean' || typeof item.archived !== 'boolean' || !Array.isArray(item.peaks) || item.peaks.length > 2048 || !item.peaks.every(p => num(p, 0, 1))) fail('invalid library details.');
  validateSoundAttribution(item.attribution);
}

export function validateSoundCollection(collection: SoundCollection): void {
  if (!collection || !id(collection.id) || !text(collection.name, 200, true)) fail('invalid collection name.');
}
export function validateSoundRevision(revision: SoundRevision): void {
  if (!revision || !id(revision.id) || !id(revision.projectId) || !id(revision.assetId) || revision.projectId !== revision.snapshot?.id ||
      !Array.isArray(revision.sourceAssetIds) || revision.sourceAssetIds.length > 2000 || !revision.sourceAssetIds.every(id) ||
      !Array.isArray(revision.attribution) || revision.attribution.length > 2000 || !text(revision.recipeHash, 160, true) || !num(revision.duration, .00001, 300)) fail('invalid saved revision.');
  validateSoundProject(revision.snapshot); revision.attribution.forEach(validateSoundAttribution);
  if (soundSourceAssetIds(revision.snapshot).some(id => !revision.sourceAssetIds.includes(id))) fail('incomplete source lineage.');
  if (revision.sourceAttribution) {
    if (!Array.isArray(revision.sourceAttribution) || revision.sourceAttribution.length > 2000) fail('invalid source credits.');
    for (const source of revision.sourceAttribution) { if (!id(source.assetId) || !revision.sourceAssetIds.includes(source.assetId)) fail('invalid credited source.'); validateSoundAttribution(source.attribution); }
  }
}
