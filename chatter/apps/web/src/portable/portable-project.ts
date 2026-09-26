import { decodeGroupArchive, encodeGroupArchive } from '../group/group-archive.js';
import { exportSoundPack, importSoundPack, type SoundPackMaps } from '../audio/sound-pack.js';
import { flushSessionCheckpoints } from '../store/session-checkpoint.js';
import { flushPodcastSaves } from '../rooms/podcast-workspace.js';
import JSZip from 'jszip';
import { isPortableStudioRecord } from './studio-schema.js';
import { sanitizedRichText } from '../rooms/blast-rich-text.js';
import {
  Gate, type Base, type Appearance, type Asset, type Credit, type CrewTask, type Episode,
  type BlastProject, type Deliverable, type MotionPackage, type PodcastProject, type PodcastShow, type Release, type RoleAssign, type ShowtimeProject, type Store, type Story,
  publishingReceipt, flushStudioSaves, videoProjectAssetIds, isVideoGraphic, remapVideoGraphics,
  type StudioProject, type GarageSamplerPreset, type StoryReview, type Take, type Transcript, type User,
} from '@chatter/shared';

export const PORTABLE_PROJECT_VERSION = 8;
const MAX_PROJECT_BYTES = 2_000_000_000;
const MANIFEST_FILE = 'story.chatter.json';

interface PortableUser { id: string; penName: string; role: User['role']; gradeBand?: string }
interface PortableAsset { record: Asset; file: string }
interface PortableDeliverable { record: Deliverable; file: string }

export interface PortableStoryProject {
  format: 'chatter-story';
  version: number;
  projectId: string;
  exportedAt: number;
  story: Story;
  users: PortableUser[];
  assets: PortableAsset[];
  takes: Take[];
  transcripts: Transcript[];
  credits: Credit[];
  appearances: Appearance[];
  releases: Release[];
  roleAssigns: RoleAssign[];
  crewTasks: CrewTask[];
  reviews: StoryReview[];
  episodes: Episode[];
  motionPackages: MotionPackage[];
  blasts?: BlastProject[];
  deliverables?: PortableDeliverable[];
  showtimeProjects?: ShowtimeProject[];
  podcastShows?: PodcastShow[];
  podcastProjects?: PodcastProject[];
  studioProjects?: StudioProject[];
  samplerPresets?: GarageSamplerPreset[];
  soundPack?: string;
  groupArchive?: string;
}

export function portableFileName(story: Pick<Story, 'slug'> & Partial<Pick<Story, 'title' | 'group' | 'updatedAt'>>): string {
  if (story.group) {
    const label = `${story.title || story.slug} — ${story.group.kind === 'piece' ? story.group.authorName : 'Group story'}`.normalize('NFKC').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, '-').slice(0, 90);
    return `${label}-${story.group.code}-${story.group.contributionId.slice(0, 6)}-${new Date(story.updatedAt ?? Date.now()).toISOString().replace(/[:.]/g, '-')}.chatter`;
  }
  return `${story.slug || 'chatter-story'}.chatter`;
}

export function isPortableStoryProject(value: unknown): value is PortableStoryProject {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PortableStoryProject>;
  return (item.showtimeProjects === undefined || (Array.isArray(item.showtimeProjects) && item.showtimeProjects.every(project => (project.credits === undefined || (typeof project.credits === 'string' && project.credits.length <= 10000)) && Array.isArray(project.titles) && project.titles.every(title => title.motion === undefined || isVideoGraphic(title.motion))))) && item.format === 'chatter-story' && [1, 2, 3, 4, 5, 6, 7, PORTABLE_PROJECT_VERSION].includes(item.version ?? -1) && typeof item.projectId === 'string' && !!item.story && Array.isArray(item.assets) && Array.isArray(item.takes) && (item.studioProjects === undefined || (Array.isArray(item.studioProjects) && item.studioProjects.length <= 100 && item.studioProjects.every(isPortableStudioRecord)));
}

function mediaIds(packages: MotionPackage[]): string[] {
  return packages.flatMap((item) => [item.theme.logoAssetId, ...item.scenes.flatMap((scene) => [scene.audioAssetId, ...scene.elements.map((element) => element.imageAssetId)])]).filter((id): id is string => !!id);
}

function blastMediaIds(projects: BlastProject[]): string[] {
  return projects.flatMap((project) => project.pages.flatMap((page) => page.elements.map((element) => element.imageAssetId))).filter((id): id is string => !!id);
}

function studioMediaIds(record: StudioProject): string[] {
  return record.project.tracks.flatMap((track) => [track.sampleAssetId, ...track.clips.map((clip) => clip.sourceAssetId)]).filter((id): id is string => !!id);
}

/** Build one self-contained file. Legal names and adviser email addresses never leave browser storage. */
export async function exportPortableStory(store: Store, input: Story, options: { omitGroupHistory?: boolean } = {}): Promise<{ blob: Blob; fileName: string; project: PortableStoryProject }> {
  await flushSessionCheckpoints(store);
  await flushStudioSaves(store);
  await flushPodcastSaves(store);
  if (input.group && !options.omitGroupHistory && input.group.kind !== 'joined') {
    const { captureGroupRevision } = await import('../group/group-work.js');
    await captureGroupRevision(store, input.id);
  }
  const current = await store.stories.get(input.id);
  if (!current) throw new Error('This story no longer exists. Refresh the story list.');
  input = current;
  const projectId = input.portableId ?? input.id;
  const story = input.portableId ? input : await store.stories.update(input.id, { portableId: projectId });
  const [allUsers, allAssets, allTakes, allTranscripts, allCredits, allAppearances, allReleases, allRoles, allTasks, allReviews, allEpisodes, allMotion, allBlasts, allDeliverables, allShowtime, allPodcastShows, allPodcastProjects, allSamplerPresets, allStudioProjects] = await Promise.all([
    store.users.list(), store.assets.list(), store.takes.list(), store.transcripts.list(), store.credits.list(), store.appearances.list(), store.releases.list(), store.roleAssigns.list(), store.crewTasks.list(), store.reviews.list(), store.episodes.list(), store.motionPackages.list(), store.blasts.list(), store.deliverables.list(), store.showtimeProjects.list(), store.podcastShows.list(), store.podcastProjects.list(), store.samplerPresets.list(), store.studioProjects.list(),
  ]);
  const takes = allTakes.filter((item) => item.storyId === story.id);
  const credits = allCredits.filter((item) => item.storyId === story.id);
  const motionPackages = allMotion.filter((item) => item.storyId === story.id);
  const blasts = allBlasts.filter((item) => item.storyId === story.id);
  const deliverables = allDeliverables.filter((item) => item.storyId === story.id);
  const showtimeProjects = allShowtime.filter((item) => item.storyId === story.id);
  const podcastProjects = allPodcastProjects.filter((item) => item.storyIds.includes(story.id));
  const podcastShowIds = new Set(podcastProjects.map((item) => item.showId)); const podcastShows = allPodcastShows.filter((item) => podcastShowIds.has(item.id));
  const samplerPresets = allSamplerPresets.filter((item) => item.storyId === story.id);
  const studioProjects = allStudioProjects.filter((item) => item.storyId === story.id);
  if (!studioProjects.every(isPortableStudioRecord)) throw new Error('A Studio session has missing source references or damaged arrangement data. Restore it before saving the Story Drive.');
  const assetIds = new Set([...(story.attachedAssetIds ?? []), ...credits.map((item) => item.assetId), ...takes.flatMap((item) => [item.assetId, ...(item.renderedAssetId ? [item.renderedAssetId] : [])]), ...mediaIds(motionPackages), ...blastMediaIds(blasts), ...showtimeProjects.flatMap(videoProjectAssetIds), ...podcastProjects.flatMap((item) => [item.artworkAssetId, ...item.clips.map((clip) => clip.assetId)]), ...podcastShows.flatMap((item) => [item.coverAssetId, item.themeAssetId, item.outroAssetId]), ...samplerPresets.map((item) => item.sourceAssetId), ...studioProjects.flatMap(studioMediaIds)].filter((id): id is string => !!id));
  for (const id of studioProjects.flatMap(studioMediaIds)) if (!allAssets.some((asset) => asset.id === id)) throw new Error('A Studio source file is missing. Restore it before saving the Story Drive.');
  const availableAssetIds = new Set(allAssets.map((asset) => asset.id));
  for (const id of assetIds) if (!availableAssetIds.has(id)) throw new Error(`A linked source file (${id.slice(0, 8)}) is missing. Restore it or remove the missing reference before saving the Story Drive.`);
  const assetRecords = allAssets.filter((item) => assetIds.has(item.id));
  const appearances = allAppearances.filter((item) => assetIds.has(item.assetId));
  const roleAssigns = allRoles.filter((item) => item.storyId === story.id);
  const crewTasks = allTasks.filter((item) => item.storyId === story.id);
  const reviews = allReviews.filter((item) => item.storyId === story.id);
  const episodes = allEpisodes.filter((item) => item.storyIds.includes(story.id));
  const userIds = new Set([story.ownerId, ...story.bylineIds, ...takes.map((item) => item.userId), ...appearances.map((item) => item.userId), ...roleAssigns.map((item) => item.userId), ...crewTasks.map((item) => item.assigneeId), ...reviews.flatMap((item) => [item.reviewerId, ...item.notes.map((note) => note.authorId), ...Object.values(item.checks).map((check) => check.actor)]), ...episodes.map((item) => item.receipt?.adviserId), ...motionPackages.map((item) => item.authorId), ...blasts.map((item) => item.authorId), ...showtimeProjects.map((item) => item.authorId), ...podcastShows.flatMap((item) => [item.authorId, ...item.hostIds]), ...podcastProjects.map((item) => item.authorId), ...deliverables.map((item) => item.authorId)].filter((id): id is string => !!id));
  const users = allUsers.filter((item) => userIds.has(item.id)).map(({ id, penName, role, gradeBand }) => ({ id, penName, role, ...(gradeBand ? { gradeBand } : {}) }));
  const releases = allReleases.filter((item) => userIds.has(item.userId)).map(({ scanAssetId: _scan, ...item }) => item);
  const transcripts = allTranscripts.filter((item) => assetIds.has(item.assetId));
  const zip = new JSZip(); const portableAssets: PortableAsset[] = []; const portableDeliverables: PortableDeliverable[] = [];
  for (const asset of assetRecords) {
    const bytes = await store.blobs.get(asset.sha256);
    if (!bytes) throw new Error(`The ${asset.kind.toLowerCase()} file ${asset.id.slice(0, 8)} is missing from this computer. Restore it before saving the USB copy.`);
    const file = `media/${asset.id}`; zip.file(file, bytes); portableAssets.push({ record: asset, file });
  }
  for (const item of deliverables) {
    const bytes = await store.blobs.get(item.blobHash); if (!bytes) throw new Error(`The output ${item.fileName} is missing. Restore it or make the export again before saving the story drive.`);
    const file = `outputs/${item.id}/${item.fileName.replace(/[^a-z0-9._-]+/gi, '-')}`; zip.file(file, bytes); portableDeliverables.push({ record: item, file });
  }
  const project: PortableStoryProject = { format: 'chatter-story', version: PORTABLE_PROJECT_VERSION, projectId, exportedAt: Date.now(), story, users, assets: portableAssets, takes, transcripts, credits, appearances, releases, roleAssigns, crewTasks, reviews, episodes, motionPackages, blasts, deliverables: portableDeliverables, showtimeProjects, podcastShows, podcastProjects, samplerPresets, studioProjects };
  const sounds = await exportSoundPack(store, story.id);
  zip.file('sounds.soundpack', await sounds.blob.arrayBuffer());
  project.soundPack = 'sounds.soundpack';
  if (story.group && !options.omitGroupHistory) {
    const { groupEntries } = await import('../group/group-work.js');
    const entries = await groupEntries(store, story.group.code, story.group.kind === 'piece' ? story.group.contributionId : undefined);
    if (entries.length) { project.groupArchive = 'group.collection'; zip.file(project.groupArchive, await (await encodeGroupArchive(entries)).arrayBuffer()); }
  }
  zip.file(MANIFEST_FILE, JSON.stringify(project, null, 2));
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), fileName: portableFileName(story), project };
}

function withoutIdentity<T extends Base>(record: T): Omit<T, keyof Base> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = record;
  return fields;
}

function remapMotion(item: MotionPackage, storyId: string, assetIds: Map<string, string>): Omit<MotionPackage, 'id' | 'createdAt' | 'updatedAt'> {
  return { ...withoutIdentity(item), storyId, theme: { ...item.theme, ...(item.theme.logoAssetId ? { logoAssetId: assetIds.get(item.theme.logoAssetId) } : {}) }, scenes: item.scenes.map((scene) => ({ ...scene, ...(scene.audioAssetId ? { audioAssetId: assetIds.get(scene.audioAssetId) } : {}), elements: scene.elements.map((element) => ({ ...element, ...(element.imageAssetId ? { imageAssetId: assetIds.get(element.imageAssetId) } : {}) })) })) };
}

function remapBlast(item: BlastProject, storyId: string, assetIds: Map<string, string>): Omit<BlastProject, 'id' | 'createdAt' | 'updatedAt'> {
  return { ...withoutIdentity(item), storyId, pages: item.pages.map((page) => ({ ...page, elements: page.elements.map((element) => ({ ...element, ...(element.richText ? { richText: sanitizedRichText(element.richText) } : {}), ...(element.imageAssetId ? { imageAssetId: assetIds.get(element.imageAssetId) } : {}) })) })) };
}

function remapSoundUse(clip: { assetId: string; soundProjectId?: string; soundRevisionId?: string; soundItemId?: string }, sounds: SoundPackMaps | undefined, assetId: string) {
  const hasSound = clip.soundProjectId || clip.soundRevisionId || clip.soundItemId;
  if (hasSound && (!sounds || (clip.soundProjectId && !sounds.projects.has(clip.soundProjectId)) || (clip.soundRevisionId && !sounds.revisions.has(clip.soundRevisionId)) || (clip.soundItemId && !sounds.items.has(clip.soundItemId)) || sounds.assets.get(clip.assetId) !== assetId)) throw new Error('The story has an incomplete or mismatched editable sound attachment. Restore a complete Story Drive.');
  return { soundProjectId: clip.soundProjectId ? sounds?.projects.get(clip.soundProjectId) : undefined,
    soundRevisionId: clip.soundRevisionId ? sounds?.revisions.get(clip.soundRevisionId) : undefined,
    soundItemId: clip.soundItemId ? sounds?.items.get(clip.soundItemId) : undefined, soundRequestId: undefined };
}

function remapShowtime(item: ShowtimeProject, storyId: string, assetIds: Map<string, string>, userIds: Map<string, string>, sounds?: SoundPackMaps): Omit<ShowtimeProject, 'id' | 'createdAt' | 'updatedAt'> {
  return { ...withoutIdentity(item), storyId, titles: remapVideoGraphics(item.titles, assetIds), ...(item.authorId ? { authorId: userIds.get(item.authorId) ?? item.authorId } : {}), clips: item.clips.flatMap((clip) => { const assetId = assetIds.get(clip.assetId); return assetId ? [{ ...clip, assetId, ...remapSoundUse(clip, sounds, assetId) }] : []; }) };
}

function remapPodcastShow(item: PodcastShow, assetIds: Map<string, string>, userIds: Map<string, string>): Omit<PodcastShow, 'id' | 'createdAt' | 'updatedAt'> {
  return { ...withoutIdentity(item), ...(item.authorId ? { authorId: userIds.get(item.authorId) ?? item.authorId } : {}), hostIds: item.hostIds.map((id) => userIds.get(id) ?? id), ...(item.coverAssetId ? { coverAssetId: assetIds.get(item.coverAssetId) } : {}), ...(item.themeAssetId ? { themeAssetId: assetIds.get(item.themeAssetId) } : {}), ...(item.outroAssetId ? { outroAssetId: assetIds.get(item.outroAssetId) } : {}) };
}

function remapPodcastProject(item: PodcastProject, showId: string, storyId: string, assetIds: Map<string, string>, userIds: Map<string, string>, sounds?: SoundPackMaps): Omit<PodcastProject, 'id' | 'createdAt' | 'updatedAt'> {
  return { ...withoutIdentity(item), showId, storyIds: [storyId], ...(item.authorId ? { authorId: userIds.get(item.authorId) ?? item.authorId } : {}), ...(item.artworkAssetId ? { artworkAssetId: assetIds.get(item.artworkAssetId) } : {}), segments: item.segments.map((segment) => segment.storyId ? { ...segment, storyId } : segment), clips: item.clips.flatMap((clip) => { const assetId = assetIds.get(clip.assetId); return assetId ? [{ ...clip, assetId, ...remapSoundUse(clip, sounds, assetId) }] : []; }) };
}

async function importReleases(store: Store, project: PortableStoryProject, userIds: Map<string, string>): Promise<void> {
  const current = await store.releases.list() as Release[];
  for (const release of project.releases) {
    const userId = userIds.get(release.userId);
    if (!userId) continue;
    const existing = current.find((item) => item.userId === userId);

    // A USB project may carry a refusal, but it may never grant permission on
    // this computer. The adviser holding the local paperwork is the authority.
    if (release.status === 'ON_FILE') {
      await store.events.append({
        action: 'portable.release.ignored',
        target: userId,
        payload: { status: release.status, reason: existing ? 'local-record-wins' : 'import-cannot-grant-permission' },
      });
      continue;
    }

    const patch = { userId, status: release.status, ...(release.expiresAt !== undefined ? { expiresAt: release.expiresAt } : {}) };
    if (existing) await store.releases.update(existing.id, patch);
    else await store.releases.create(patch);
    await store.events.append({ action: 'portable.release.applied', target: userId, payload: { status: release.status } });
  }
}

function remapSamplerPreset(item: GarageSamplerPreset, storyId: string, assetIds: Map<string, string>): Omit<GarageSamplerPreset, 'id' | 'createdAt' | 'updatedAt'> | undefined {
  const sourceAssetId = assetIds.get(item.sourceAssetId);
  if (!sourceAssetId) return undefined;
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...preset } = item;
  return { ...preset, storyId, sourceAssetId };
}

export async function importPortableStory(store: Store, gate: Gate, file: File, options: { isolatedUsers?: boolean } = {}): Promise<{ story: Story; mediaCount: number; updated: boolean }> {
  await flushStudioSaves(store);
  await flushPodcastSaves(store);
  if (file.size > MAX_PROJECT_BYTES) throw new Error('This story file is larger than 2 GB. Move its biggest media exports beside it and try a smaller working package.');
  const zip = await JSZip.loadAsync(await file.arrayBuffer()); const manifestEntry = zip.file(MANIFEST_FILE);
  if (!manifestEntry) throw new Error('That is not a Chatter story file: story.chatter.json is missing.');
  const parsed = JSON.parse(await manifestEntry.async('string')) as unknown;
  if (!isPortableStoryProject(parsed)) throw new Error('This Chatter story file uses an unsupported or damaged format.');
  const project = parsed;
  let collected: Awaited<ReturnType<typeof decodeGroupArchive>> = [];
  if (project.groupArchive) {
    if (project.groupArchive !== 'group.collection' || !zip.file(project.groupArchive)) throw new Error('This story is missing its group contributions.');
    collected = await decodeGroupArchive(new Blob([await zip.file(project.groupArchive)!.async('uint8array') as BlobPart]));
    const { inspectGroupSnapshot } = await import('../group/group-work.js');
    for (const entry of collected) await inspectGroupSnapshot(entry.snapshot);
  }
  const hasSoundUse = [...(project.showtimeProjects ?? []).flatMap(p => p.clips), ...(project.podcastProjects ?? []).flatMap(p => p.clips)].some(c => c.soundProjectId || c.soundRevisionId || c.soundItemId);
  if ((project.soundPack !== undefined && project.soundPack !== 'sounds.soundpack') || (hasSoundUse && !project.soundPack) || (project.soundPack && !zip.file(project.soundPack))) throw new Error('The story is missing its editable sound attachment. Restore a complete Story Drive.');
  if (project.assets.length > 5000) throw new Error('This project contains too many media records to open safely.');
  const packagedAssetIds = new Set(project.assets.map((item) => item.record.id));
  if ((project.studioProjects ?? []).flatMap(studioMediaIds).some((id) => !packagedAssetIds.has(id))) throw new Error('The Story Drive is missing a Studio source asset.');
  const existingUsers = await store.users.list(); const userIds = new Map<string, string>();
  for (const person of project.users) {
    const existing = options.isolatedUsers ? undefined : existingUsers.find((item) => item.penName.toLowerCase() === person.penName.toLowerCase());
    const user = existing ?? await store.users.create({ name: person.penName, penName: person.penName, role: options.isolatedUsers ? 'STUDENT' : person.role, active: !options.isolatedUsers, ...(person.gradeBand ? { gradeBand: person.gradeBand } : {}) });
    userIds.set(person.id, user.id);
  }
  const assetIds = new Map<string, string>();
  for (const item of project.assets) {
    const entry = zip.file(item.file); if (!entry) throw new Error(`The package is missing ${item.file}.`);
    const bytes = await entry.async('uint8array');
    if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error('A media file in this project is too large to open safely.');
    const result = await gate.ingest({ source: item.record.origin === 'OPENVERSE' ? 'Openverse' : item.record.origin === 'UPLOAD' ? 'upload' : item.record.origin === 'GENERATED' ? 'generated' : 'recording', bytes, ownDevice: false, meta: { kind: item.record.kind, mime: item.record.mime, origin: item.record.origin, ...(item.record.license ? { license: item.record.license } : {}), ...(item.record.creator ? { creator: item.record.creator } : {}), ...(item.record.sourceUrl ? { sourceUrl: item.record.sourceUrl } : {}) } });
    if (!result.assetId) throw new Error(`The safety gate could not import ${item.file}: ${result.reason ?? 'no asset was created'}.`);
    assetIds.set(item.record.id, result.assetId);
  }
  const existingStory = options.isolatedUsers || project.story.group ? undefined : (await store.stories.list()).find((item) => item.portableId === project.projectId);
  const storyInput = { ...(project.story.group ? { group: project.story.group } : {}), ...(project.story.attachedAssetIds ? { attachedAssetIds: project.story.attachedAssetIds.map(id => assetIds.get(id)).filter((id): id is string => !!id) } : {}), title: project.story.title, slug: project.story.slug, channels: project.story.channels, status: project.story.status, body: project.story.body, bylineIds: project.story.bylineIds.map((id) => userIds.get(id)).filter((id): id is string => !!id), portableId: project.projectId, ...(project.story.creationRecipeId ? { creationRecipeId: project.story.creationRecipeId } : {}), ...(project.story.workflowStepId ? { workflowStepId: project.story.workflowStepId } : {}), ...(project.story.ownerId && userIds.get(project.story.ownerId) ? { ownerId: userIds.get(project.story.ownerId) } : {}), ...(project.story.dueAt !== undefined ? { dueAt: project.story.dueAt } : {}), ...(project.story.durationSec !== undefined ? { durationSec: project.story.durationSec } : {}), ...(project.story.brief ? { brief: project.story.brief } : {}) };
  const story = existingStory ? await store.stories.update(existingStory.id, storyInput) : await store.stories.create(storyInput);
  let sounds: SoundPackMaps | undefined;
  if (project.soundPack !== undefined) {
    if (project.soundPack !== 'sounds.soundpack') throw new Error('Invalid sound pack attachment.');
    const entry = zip.file(project.soundPack); if (!entry) throw new Error('The story is missing its editable sound pack.');
    sounds = (await importSoundPack(store, gate, new Blob([await entry.async('uint8array') as BlobPart]), story.id)).maps;
  }
  const currentTakes = (await store.takes.list()).filter((item) => item.storyId === story.id); const takeIds = new Map<string, string>();
  for (const take of project.takes) {
    const assetId = assetIds.get(take.assetId); if (!assetId) continue;
    const patch = { storyId: story.id, userId: userIds.get(take.userId) ?? take.userId, assetId, durationSec: take.durationSec, ...(take.name ? { name: take.name } : {}), ...(take.notes ? { notes: take.notes } : {}), ...(take.edits ? { edits: take.edits } : {}), ...(take.markers ? { markers: take.markers } : {}), ...(take.transcriptCorrection ? { transcriptCorrection: take.transcriptCorrection } : {}), ...(take.renderedAssetId && assetIds.get(take.renderedAssetId) ? { renderedAssetId: assetIds.get(take.renderedAssetId) } : {}), ...(take.renderedEditKey ? { renderedEditKey: take.renderedEditKey } : {}) };
    const existing = currentTakes.find((item) => item.assetId === assetId); const saved = existing ? await store.takes.update(existing.id, patch) : await store.takes.create(patch); takeIds.set(take.id, saved.id);
  }
  if (project.story.selectedTakeId && takeIds.get(project.story.selectedTakeId)) await store.stories.update(story.id, { selectedTakeId: takeIds.get(project.story.selectedTakeId) });
  const currentCredits = await store.credits.list(); for (const credit of project.credits) { const assetId = assetIds.get(credit.assetId); if (assetId && !currentCredits.some((item) => item.storyId === story.id && item.assetId === assetId && item.usedIn === credit.usedIn)) await store.credits.create({ assetId, storyId: story.id, usedIn: credit.usedIn }); }
  const currentTranscripts = await store.transcripts.list(); for (const transcript of project.transcripts) { const assetId = assetIds.get(transcript.assetId); if (!assetId) continue; const existing = options.isolatedUsers ? undefined : currentTranscripts.find((item) => item.assetId === assetId); const patch = { assetId, text: transcript.text, segments: transcript.segments }; if (existing) await store.transcripts.update(existing.id, patch); else await store.transcripts.create(patch); }
  const currentAppearances = await store.appearances.list(); for (const appearance of project.appearances) { const assetId = assetIds.get(appearance.assetId); const userId = userIds.get(appearance.userId); if (assetId && userId && !currentAppearances.some((item) => item.assetId === assetId && item.userId === userId)) await store.appearances.create({ assetId, storyId: story.id, userId, identifiable: appearance.identifiable }); }
  await importReleases(store, project, userIds);
  const currentRoles = await store.roleAssigns.list(); for (const role of project.roleAssigns) { const userId = userIds.get(role.userId); if (userId && !currentRoles.some((item) => item.storyId === story.id && item.userId === userId && item.role === role.role)) await store.roleAssigns.create({ userId, storyId: story.id, role: role.role, cycle: role.cycle }); }
  const currentTasks = (await store.crewTasks.list()).filter((item) => item.storyId === story.id); for (const task of project.crewTasks) { const patch = { storyId: story.id, role: task.role, assigneeId: userIds.get(task.assigneeId) ?? task.assigneeId, state: task.state, completedSteps: task.completedSteps, handoffNote: task.handoffNote, ...(task.completedAt !== undefined ? { completedAt: task.completedAt } : {}) }; const existing = currentTasks.find((item) => item.role === task.role); if (existing) await store.crewTasks.update(existing.id, patch); else await store.crewTasks.create(patch); }
  const currentReviews = (await store.reviews.list()).find((item) => item.storyId === story.id); for (const review of project.reviews.slice(0, 1)) { const patch = { storyId: story.id, ...(review.reviewerId ? { reviewerId: userIds.get(review.reviewerId) ?? review.reviewerId } : {}), contentKey: review.contentKey, ...(review.mediaKey ? { mediaKey: review.mediaKey } : {}), checks: review.checks, notes: review.notes, state: review.state }; if (currentReviews) await store.reviews.update(currentReviews.id, patch); else await store.reviews.create(patch); }
  const currentEpisodes = await store.episodes.list(); for (const episode of project.episodes) { if (!currentEpisodes.some((item) => item.storyIds.includes(story.id))) {
    const reflections = episode.reflections ? Object.fromEntries(Object.entries(episode.reflections).map(([key, reflection]) => [
      key === `story:${project.story.id}` ? `story:${story.id}` : key,
      { ...reflection, ...(reflection.authorId ? { authorId: userIds.get(reflection.authorId) ?? reflection.authorId } : {}) },
    ])) : undefined;
    const receipt = episode.receipt ? publishingReceipt({ destinations: episode.receipt.destinations, publishedAt: episode.receipt.publishedAt, ...(episode.receipt.note ? { note: episode.receipt.note } : {}) }, userIds.get(episode.receipt.adviserId) ?? episode.receipt.adviserId) : undefined;
    await store.episodes.create({ title: episode.title, publishedAt: episode.publishedAt, channel: episode.channel, storyIds: [story.id], ...(episode.stories ? { stories: episode.stories.map((item) => item.storyId === project.story.id ? { ...item, storyId: story.id } : item) } : {}), ...(receipt ? { receipt } : {}), ...(reflections ? { reflections } : {}) });
  } }
  const currentMotion = (await store.motionPackages.list()).filter((item) => item.storyId === story.id); for (const item of project.motionPackages) { const patch = remapMotion(item, story.id, assetIds); const existing = currentMotion.find((row) => row.title === item.title); if (existing) await store.motionPackages.update(existing.id, patch); else await store.motionPackages.create(patch); }
  const currentBlasts = (await store.blasts.list()).filter((item) => item.storyId === story.id); for (const item of project.blasts ?? []) { const patch = remapBlast(item, story.id, assetIds); const existing = currentBlasts.find((row) => row.title === item.title); if (existing) await store.blasts.update(existing.id, patch); else await store.blasts.create(patch); }
  const currentShowtime = (await store.showtimeProjects.list()).filter((item) => item.storyId === story.id); for (const item of project.showtimeProjects ?? []) { const patch = remapShowtime(item, story.id, assetIds, userIds, sounds); const existing = currentShowtime.find((row) => row.title === item.title); if (existing) await store.showtimeProjects.update(existing.id, patch); else await store.showtimeProjects.create(patch); }
  const podcastShowIds = new Map<string, string>(); const currentPodcastShows = await store.podcastShows.list(); for (const item of project.podcastShows ?? []) { const patch = remapPodcastShow(item, assetIds, userIds); const existing = options.isolatedUsers ? undefined : currentPodcastShows.find((row) => row.title.toLowerCase() === item.title.toLowerCase()); const saved = existing ? await store.podcastShows.update(existing.id, patch) : await store.podcastShows.create(patch); podcastShowIds.set(item.id, saved.id); }
  const podcastProjectIds = new Map<string, string>(); const currentPodcastProjects = (await store.podcastProjects.list()).filter((item) => item.storyIds.includes(story.id)); for (const item of project.podcastProjects ?? []) { const showId = podcastShowIds.get(item.showId) ?? (await store.podcastShows.list())[0]?.id; if (!showId) continue; const patch = remapPodcastProject(item, showId, story.id, assetIds, userIds, sounds); const existing = currentPodcastProjects.find((row) => row.title === item.title); const saved = existing ? await store.podcastProjects.update(existing.id, patch) : await store.podcastProjects.create(patch); podcastProjectIds.set(item.id, saved.id); }
  const samplerPresetIds = new Map<string, string>();
  const currentSamplerPresets = (await store.samplerPresets.list()).filter((item) => item.storyId === story.id); for (const item of project.samplerPresets ?? []) { const patch = remapSamplerPreset(item, story.id, assetIds); if (!patch) continue; const existing = currentSamplerPresets.find((row) => row.name === item.name && row.sampleName === item.sampleName); const saved = existing ? await store.samplerPresets.update(existing.id, patch) : await store.samplerPresets.create(patch); samplerPresetIds.set(item.id, saved.id); }
  const currentStudio = (await store.studioProjects.list()).filter((item) => item.storyId === story.id);
  for (const item of project.studioProjects ?? []) {
    const patch = { storyId: story.id, project: { ...item.project, tracks: item.project.tracks.map((track) => ({
      ...track,
      sampleAssetId: track.sampleAssetId ? assetIds.get(track.sampleAssetId) : undefined,
      samplerPresetId: track.samplerPresetId ? samplerPresetIds.get(track.samplerPresetId) : undefined,
      clips: track.clips.map((clip) => ({ ...clip, sourceAssetId: clip.sourceAssetId ? assetIds.get(clip.sourceAssetId) : undefined })),
    })) } };
    const existing = currentStudio.find((row) => row.project.id === item.project.id) ?? (currentStudio.length === 1 ? currentStudio[0] : undefined);
    if (existing) await store.studioProjects.update(existing.id, patch); else await store.studioProjects.create(patch);
  }
  const currentDeliverables = (await store.deliverables.list()).filter((item) => item.storyId === story.id); for (const item of project.deliverables ?? []) { const entry = zip.file(item.file); if (!entry) throw new Error(`The package is missing ${item.file}.`); const bytes = await entry.async('uint8array'); const blobHash = await store.blobs.put(bytes); const patch = { storyId: story.id, authorId: item.record.authorId ? userIds.get(item.record.authorId) ?? item.record.authorId : undefined, title: item.record.title, fileName: item.record.fileName, kind: item.record.kind, room: item.record.room, stage: item.record.stage, mime: item.record.mime, bytes: bytes.byteLength, blobHash, sourceAssetId: item.record.sourceAssetId ? assetIds.get(item.record.sourceAssetId) : undefined, sourceProjectId: item.record.sourceProjectId ? podcastProjectIds.get(item.record.sourceProjectId) ?? item.record.sourceProjectId : undefined, durationSec: item.record.durationSec, width: item.record.width, height: item.record.height, pageCount: item.record.pageCount }; const existing = currentDeliverables.find((row) => row.fileName === item.record.fileName && row.blobHash === blobHash); if (existing) await store.deliverables.update(existing.id, patch); else await store.deliverables.create(patch); }
  if (collected.length) { const { collectGroupEntries } = await import('../group/group-work.js'); await collectGroupEntries(store, collected); }
  await store.events.append({ action: 'portable.import', target: story.id, payload: { projectId: project.projectId, mediaCount: assetIds.size, exportedAt: project.exportedAt } });
  return { story: await store.stories.get(story.id) ?? story, mediaCount: assetIds.size, updated: !!existingStory };
}
