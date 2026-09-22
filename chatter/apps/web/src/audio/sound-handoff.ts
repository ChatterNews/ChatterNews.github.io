import { connectShowtimeClip, normalizeShowtimeProject, makeShowtimeClip, makePodcastClip, sha256, type Asset, type Store, type ShowtimeProject, type PodcastProject, type SoundLibraryItem, type SoundRevision } from '@chatter/shared';

type Consumer = ShowtimeProject | PodcastProject;
export interface SoundRequest {
  id: string; projectId: string; trackId: string; at: number;
  destinationFingerprint: string; replaceClipId?: string;
}
export interface ResolvedSound { item: SoundLibraryItem; asset: Asset; revision?: SoundRevision }

/** Stable across saves; every edit, including credits, invalidates a pending handoff. */
export function soundDestinationFingerprint(project: Consumer): string {
  const { createdAt: _created, updatedAt: _updated, ...content } = 'titles' in project ? normalizeShowtimeProject(project) : project;
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
  const json = JSON.stringify(canonical(content));
  // A change detector, not an authorization token. Source permissions are checked separately.
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) hash = Math.imul(hash ^ json.charCodeAt(i), 16777619);
  return `${json.length}:${(hash >>> 0).toString(16)}`;
}
export function makeSoundRequest(project: Consumer, trackId: string, at: number, replaceClipId?: string): SoundRequest {
  return { id: crypto.randomUUID(), projectId: project.id, trackId, at: Math.max(0, at), destinationFingerprint: soundDestinationFingerprint(project), ...(replaceClipId ? { replaceClipId } : {}) };
}
export function readSoundRequest(raw: string | null): SoundRequest | undefined {
  if (!raw || raw.length > 3000) return undefined;
  try {
    const r = JSON.parse(raw) as SoundRequest;
    return r && typeof r.id === 'string' && !!r.id && typeof r.projectId === 'string' && !!r.projectId && typeof r.trackId === 'string' && !!r.trackId && Number.isFinite(r.at) && r.at >= 0 && typeof r.destinationFingerprint === 'string' && (!r.replaceClipId || typeof r.replaceClipId === 'string') ? r : undefined;
  } catch { return undefined; }
}
export function soundConsumerReturnTo(kind: 'STINGER' | 'CHATTERBOX', request: SoundRequest): string {
  return `${kind === 'STINGER' ? '/stinger' : '/chatterbox'}?${new URLSearchParams({ project: request.projectId, soundRequest: JSON.stringify(request) })}`;
}
export function soundReturnUrl(returnTo: string, itemId: string): string {
  const url = new URL(returnTo, 'https://orbit.invalid');
  const request = readSoundRequest(url.searchParams.get('soundRequest'));
  if (!returnTo.startsWith('/') || returnTo.startsWith('//') || url.origin !== 'https://orbit.invalid' || !['/stinger', '/chatterbox'].includes(url.pathname) || !request || url.searchParams.get('project') !== request.projectId) throw new Error('Open Add sound from the destination editor again.');
  url.searchParams.set('soundItem', itemId);
  return `${url.pathname}${url.search}`;
}
export function soundEditUrl(returnTo: string, clip?: { soundProjectId?: string; soundRevisionId?: string }): string {
  const query = new URLSearchParams({ returnTo });
  if (clip?.soundProjectId && clip.soundRevisionId) { query.set('project', clip.soundProjectId); query.set('revision', clip.soundRevisionId); }
  return `/foley?${query}`;
}

async function requireAudio(store: Store, id: string): Promise<Asset> {
  const asset = await store.assets.get(id);
  if (!asset || asset.kind !== 'AUDIO' || asset.gateStatus !== 'APPROVED') throw new Error(`Sound ${asset?.creator || id} is missing or needs media approval. Open Media Bin to restore or review it.`);
  const bytes = await store.blobs.get(asset.path);
  if (!bytes || await sha256(bytes) !== asset.sha256) throw new Error(`The original bytes for ${asset.creator || id} are missing or damaged. Restore this sound before use.`);
  return asset;
}
/** Follow the immutable render graph, including nested rendered assets, at every use/export. */
export async function validateSoundLineage(store: Store, clips: Array<{ assetId: string; soundRevisionId?: string; soundProjectId?: string }>): Promise<void> {
  const revisions = await store.soundRevisions.list();
  const checked = new Set<string>();
  const visit = async (id: string, ancestry = new Set<string>()) => {
    if (ancestry.has(id)) throw new Error('This sound contains a circular source reference. Restore a valid sound version.');
    if (checked.has(id)) return;
    await requireAudio(store, id);
    const next = new Set(ancestry).add(id);
    for (const revision of revisions.filter(row => row.assetId === id)) {
      const sources = new Set([...revision.sourceAssetIds, ...revision.snapshot.clips.flatMap(clip => clip.assetId ? [clip.assetId] : [])]);
      for (const source of sources) await visit(source, next);
    }
    checked.add(id);
  };
  for (const clip of clips) {
    if (clip.soundRevisionId) {
      const revision = revisions.find(row => row.id === clip.soundRevisionId);
      if (!revision || revision.assetId !== clip.assetId || revision.projectId !== clip.soundProjectId) throw new Error('A placed sound version no longer matches its frozen source. Restore the sound pack before export.');
    } else if (clip.soundProjectId) throw new Error('This sound is missing its saved version. Choose it again from Add sound.');
    // Ordinary imported audio remains valid without Foley fields; derived audio is still checked.
    if (clip.soundRevisionId || revisions.some(row => row.assetId === clip.assetId)) await visit(clip.assetId);
  }
}
export async function resolveSound(store: Store, itemId: string): Promise<ResolvedSound> {
  const item = await store.soundItems.get(itemId);
  if (!item || item.archived || !Number.isFinite(item.duration) || item.duration <= 0) throw new Error('This library sound is unavailable. Choose another sound.');
  const asset = await requireAudio(store, item.assetId);
  const revision = item.revisionId ? await store.soundRevisions.get(item.revisionId) : undefined;
  await validateSoundLineage(store, [{ assetId: item.assetId, soundRevisionId: item.revisionId, soundProjectId: item.projectId }]);
  return { item, asset, revision };
}
export async function linkSoundUsage(store: Store, sound: ResolvedSound, project: Consumer): Promise<void> {
  const storyIds = 'storyIds' in project ? project.storyIds : project.storyId ? [project.storyId] : [];
  const existing = await store.credits.list();
  for (const storyId of storyIds.length ? storyIds : [undefined]) {
    for (const assetId of new Set([sound.asset.id, ...(sound.revision?.sourceAssetIds ?? [])])) {
      const usedIn = `FOLEY:${project.id}`;
      if (!existing.some(row => row.assetId === assetId && row.storyId === storyId && row.usedIn === usedIn)) existing.push(await store.credits.create({ assetId, storyId, usedIn }));
    }
  }
}
function placementCheck(project: Consumer, request: SoundRequest): boolean {
  if (project.id !== request.projectId) throw new Error('The destination project changed. Open Add sound from the intended edit.');
  if (project.clips.some(clip => clip.soundRequestId === request.id)) return false;
  if (soundDestinationFingerprint(project) !== request.destinationFingerprint) throw new Error('This edit changed while Foley was open. The sound is saved; choose its track and position again with Add sound.');
  if (!Number.isFinite(request.at) || request.at < 0) throw new Error('Choose a valid sound position.');
  const track = project.tracks?.find(row => row.id === request.trackId);
  if (!track || ('locked' in track && track.locked) || ('role' in track && track.kind !== 'AUDIO')) throw new Error('Choose an unlocked audio track for this sound.');
  return true;
}
function pin(sound: ResolvedSound, request: SoundRequest) {
  return { soundItemId: sound.item.id, soundProjectId: sound.item.projectId, soundRevisionId: sound.item.revisionId, soundRequestId: request.id };
}
function replacement<T extends { trimInSec: number; trimOutSec: number; sourceDurationSec: number; assetId: string; name: string }>(old: T, sound: ResolvedSound, request: SoundRequest, acceptShorter: boolean): T {
  if (sound.item.duration < old.trimOutSec && !acceptShorter) throw new Error(`The new sound is ${sound.item.duration.toFixed(2)} seconds; this use ends at ${old.trimOutSec.toFixed(2)} seconds. Confirm shortening this use before replacing.`);
  if (sound.item.duration <= old.trimInSec) throw new Error('The new sound ends before this use starts. Adjust the trim before replacing it.');
  return { ...old, ...pin(sound, request), assetId: sound.asset.id, name: sound.item.name, sourceDurationSec: sound.item.duration, trimOutSec: Math.min(old.trimOutSec, sound.item.duration) };
}
export function placeShowtimeSound(project: ShowtimeProject, sound: ResolvedSound, request: SoundRequest, acceptShorter = false): ShowtimeProject {
  if (!placementCheck(normalizeShowtimeProject(project), request)) return project;
  if (request.replaceClipId) {
    const old = project.clips.find(clip => clip.id === request.replaceClipId);
    if (!old || old.mediaKind !== 'AUDIO') throw new Error('The sound placement was removed. Choose its position again.');
    return { ...project, clips: project.clips.map(clip => clip.id === old.id ? replacement(clip, sound, request, acceptShorter) : clip) };
  }
  const clip = { ...makeShowtimeClip({ assetId: sound.asset.id, name: sound.item.name, durationSec: sound.item.duration, mediaKind: 'AUDIO' }), ...pin(sound, request) };
  return connectShowtimeClip(project, clip, request.trackId, request.at);
}
export function placePodcastSound(project: PodcastProject, sound: ResolvedSound, request: SoundRequest, acceptShorter = false): PodcastProject {
  if (!placementCheck(project, request)) return project;
  if (request.replaceClipId) {
    const old = project.clips.find(clip => clip.id === request.replaceClipId);
    if (!old) throw new Error('The sound placement was removed. Choose its position again.');
    return { ...project, clips: project.clips.map(clip => clip.id === old.id ? replacement(clip, sound, request, acceptShorter) : clip) };
  }
  const clip = { ...makePodcastClip({ assetId: sound.asset.id, name: sound.item.name, durationSec: sound.item.duration, trackId: request.trackId, startSec: request.at }), ...pin(sound, request) };
  return { ...project, clips: [...project.clips, clip] };
}
export async function soundCreditsBlock(store: Store, project: Consumer): Promise<string> {
  const blocks: string[] = [];
  const seen = new Set<string>();
  for (const clip of project.clips) {
    const key = clip.soundRevisionId ?? clip.soundItemId;
    if (!key || seen.has(key)) continue; seen.add(key);
    const revision = clip.soundRevisionId ? await store.soundRevisions.get(clip.soundRevisionId) : undefined;
    const item = clip.soundItemId ? await store.soundItems.get(clip.soundItemId) : undefined;
    const attribution = revision?.attribution ?? (item ? [item.attribution] : []);
    const sources = attribution.map(source => [source.creator || 'Creator unspecified', source.license || 'Rights unresolved', source.sourceUrl, source.licenseUrl, source.notes].filter(Boolean).join(' · '));
    blocks.push([revision?.snapshot.name ?? item?.name ?? clip.name, revision?.snapshot.credits.trim() ? `Members and contributions\n${revision.snapshot.credits.trim()}` : '', sources.length ? `Source attribution\n${sources.join('\n')}` : ''].filter(Boolean).join('\n'));
  }
  return blocks.length ? `Sound credits\n\n${blocks.join('\n\n')}` : '';
}
export function appendSoundCredits(existing: string | undefined, block: string): string {
  if (!block || existing?.includes(block)) return existing ?? '';
  return existing?.trim() ? `${existing}\n\n${block}` : block;
}
