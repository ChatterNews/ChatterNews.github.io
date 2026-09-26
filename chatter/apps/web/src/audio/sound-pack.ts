import JSZip from 'jszip';
import { type Store, type Gate, type SoundProject, type SoundRevision, type SoundLibraryItem, type SoundCollection, type Asset, newId, sha256, validateSoundProject, validateSoundItem, validateSoundAttribution, soundSourceAssetIds } from '@chatter/shared';
import { recoverSoundOperations, runSoundOperation } from './sound-repository.js';
const MAX_BYTES = 256 * 1024 * 1024;
interface Manifest { format: 'orbit-soundpack'; version: 1; projects: SoundProject[]; revisions: SoundRevision[]; items: SoundLibraryItem[]; collections: SoundCollection[]; assets: { record: Asset; file: string }[] }
export interface SoundPackMaps { projects: Map<string, string>; revisions: Map<string, string>; items: Map<string, string>; assets: Map<string, string> }
export async function exportSoundPack(store: Store, storyId?: string): Promise<{ blob: Blob; fileName: string }> {
  await recoverSoundOperations(store);
  const [allProjects, allRevisions, allItems, allCollections, video, podcasts] = await Promise.all([store.soundProjects.list(), store.soundRevisions.list(), store.soundItems.list(), store.soundCollections.list(), store.showtimeProjects.list(), store.podcastProjects.list()]);
  const usedAssets = new Set<string>([...video.filter(p => p.storyId === storyId).flatMap(p => p.clips.map(c => c.assetId)), ...podcasts.filter(p => p.storyIds.includes(storyId ?? '')).flatMap(p => p.clips.map(c => c.assetId))]);
  const projectIds = new Set(allProjects.filter(p => !storyId || p.storyId === storyId).map(p => p.id));
  const revisionIds = new Set(allRevisions.filter(r => !storyId || projectIds.has(r.projectId) || usedAssets.has(r.assetId)).map(r => r.id));
  for (const revision of allRevisions) if (revisionIds.has(revision.id)) projectIds.add(revision.projectId);
  const assetIds = new Set<string>();
  for (let pass = 0; pass <= allRevisions.length; pass++) {
    const before = `${assetIds.size}:${revisionIds.size}:${projectIds.size}`;
    for (const p of allProjects.filter(p => projectIds.has(p.id))) soundSourceAssetIds(p).forEach(id => assetIds.add(id));
    for (const r of allRevisions) if (revisionIds.has(r.id) || assetIds.has(r.assetId)) { revisionIds.add(r.id); projectIds.add(r.projectId); assetIds.add(r.assetId); r.sourceAssetIds.forEach(id => assetIds.add(id)); soundSourceAssetIds(r.snapshot).forEach(id => assetIds.add(id)); }
    if (before === `${assetIds.size}:${revisionIds.size}:${projectIds.size}`) break;
  }
  const items = allItems.filter(i => !storyId || assetIds.has(i.assetId) || usedAssets.has(i.assetId));
  items.forEach(i => assetIds.add(i.assetId));
  const projects = allProjects.filter(p => projectIds.has(p.id)); const revisions = allRevisions.filter(r => revisionIds.has(r.id));
  projects.forEach(validateSoundProject); items.forEach(validateSoundItem);
  const collectionIds = new Set(items.flatMap(i => i.collectionIds));
  const zip = new JSZip(); const assets: Manifest['assets'] = []; let total = 0;
  for (const id of assetIds) {
    const record = await store.assets.get(id); if (!record || record.kind !== 'AUDIO') throw new Error('A sound source is missing. Restore it before packing.');
    const bytes = await store.blobs.get(record.sha256); if (!bytes || await sha256(bytes) !== record.sha256) throw new Error('A sound source has missing or damaged bytes. Restore it before packing.');
    total += bytes.length; if (total > MAX_BYTES) throw new Error('This library exceeds the 256 MB sound-pack limit. Save its stories separately.');
    const file = `media/${assets.length}.audio`; zip.file(file, bytes); assets.push({ record, file });
  }
  const manifest: Manifest = { format: 'orbit-soundpack', version: 1, projects, revisions, items, collections: allCollections.filter(c => !storyId || collectionIds.has(c.id)), assets };
  zip.file('soundpack.json', JSON.stringify(manifest));
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), fileName: storyId ? 'story-sounds.soundpack' : 'club-sounds.soundpack' };
}
export function validateSoundPackManifest(value: unknown): asserts value is Manifest {
  const p = value as Manifest;
  if (!p || p.format !== 'orbit-soundpack' || p.version !== 1) throw new Error('Unsupported sound pack.');
  for (const list of [p.projects, p.revisions, p.items, p.collections, p.assets]) if (!Array.isArray(list) || list.length > 2000) throw new Error('Invalid or oversized sound pack.');
  const unique = (rows: { id: string }[]) => { const ids = rows.map(r => r?.id); if (ids.some(id => typeof id !== 'string' || !id || id.length > 160) || new Set(ids).size !== ids.length) throw new Error('Duplicate or invalid sound IDs.'); };
  unique(p.projects); unique(p.revisions); unique(p.items); unique(p.collections); unique(p.assets.map(a => a.record));
  p.projects.forEach(validateSoundProject); p.items.forEach(validateSoundItem);
  const assets = new Set(p.assets.map(a => a.record.id)); const projects = new Set(p.projects.map(a => a.id)); const revisions = new Set(p.revisions.map(a => a.id)); const collections = new Set(p.collections.map(c => c.id)); const items = new Set(p.items.map(i => i.id));
  const refs = (project: SoundProject) => { if (soundSourceAssetIds(project).some(id => !assets.has(id)) || project.clips.some(c => c.libraryItemId && !items.has(c.libraryItemId))) throw new Error('A sound source is absent from the pack.'); };
  p.projects.forEach(refs);
  for (const c of p.collections) if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 200) throw new Error('Invalid collection name.');
  for (const r of p.revisions) { validateSoundProject(r.snapshot); refs(r.snapshot); if (!projects.has(r.projectId) || r.snapshot.id !== r.projectId || !assets.has(r.assetId) || !Array.isArray(r.sourceAssetIds) || r.sourceAssetIds.length > 2000 || r.sourceAssetIds.some(id => !assets.has(id)) || !Array.isArray(r.attribution) || r.attribution.length > 2000 || typeof r.recipeHash !== 'string' || !Number.isFinite(r.duration) || r.duration <= 0 || r.duration > 300) throw new Error('Invalid saved sound revision.'); r.attribution.forEach(validateSoundAttribution); if (r.sourceAttribution) { if (!Array.isArray(r.sourceAttribution) || r.sourceAttribution.length > 2000) throw new Error('Invalid source credits.'); for (const source of r.sourceAttribution) { if (!assets.has(source.assetId)) throw new Error('Unknown credited source.'); validateSoundAttribution(source.attribution); } } if (soundSourceAssetIds(r.snapshot).some(id => !r.sourceAssetIds.includes(id))) throw new Error('The source lineage is incomplete.'); }
  for (const i of p.items) if (!assets.has(i.assetId) || (i.projectId && !projects.has(i.projectId)) || (i.revisionId && !revisions.has(i.revisionId)) || i.collectionIds.some(id => !collections.has(id))) throw new Error('Invalid library reference.');
  for (const i of p.items) if (i.revisionId) { const revision = p.revisions.find(r => r.id === i.revisionId)!; if (revision.assetId !== i.assetId || revision.projectId !== i.projectId) throw new Error('A sound points to an unrelated saved revision.'); }
  for (const a of p.assets) if (a.record.kind !== 'AUDIO' || !/^audio\//.test(a.record.mime) || !/^sha256:[a-f0-9]{64}$/.test(a.record.sha256) || !/^media\/\d+\.audio$/.test(a.file) || !Number.isInteger(a.record.bytes) || a.record.bytes <= 0 || a.record.bytes > MAX_BYTES) throw new Error('Invalid sound media record.');
}
export function importSoundPack(store: Store, gate: Gate, blob: Blob, storyId?: string): Promise<{ itemCount: number; projectCount: number; maps: SoundPackMaps }> {
  return runSoundOperation(store, 'pack-import', () => importPack(store, gate, blob, storyId));
}
async function importPack(store: Store, gate: Gate, blob: Blob, storyId?: string): Promise<{ itemCount: number; projectCount: number; maps: SoundPackMaps }> {
  if (blob.size > MAX_BYTES) throw new Error('Sound packs must be smaller than 256 MB.');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  let estimated = 0;
  for (const entry of Object.values(zip.files)) {
    const original = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName;
    if (entry.name.includes('..') || entry.name.startsWith('/') || entry.name.includes('\\') || (original && original !== entry.name)) throw new Error('Unsafe sound pack path.');
    estimated += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (estimated > MAX_BYTES) throw new Error('The expanded sound pack is too large.');
  }
  const entry = zip.file('soundpack.json'); if (!entry) throw new Error('This file is missing soundpack.json.');
  const manifestText = await entry.async('string'); if (manifestText.length > 8 * 1024 * 1024) throw new Error('Sound pack metadata is too large.');
  const manifest: unknown = JSON.parse(manifestText); validateSoundPackManifest(manifest);
  const files = new Map<string, Uint8Array>(); let total = 0;
  // Validate every byte and reference before writing any imported record.
  for (const a of manifest.assets) { const file = zip.file(a.file); if (!file) throw new Error('The pack is missing audio.'); const bytes = await file.async('uint8array'); total += bytes.length; if (total > MAX_BYTES || bytes.length !== a.record.bytes || await sha256(bytes) !== a.record.sha256) throw new Error('The pack has damaged or oversized audio.'); files.set(a.record.id, bytes); }
  const operationId = `soundpack-${(await sha256(new Uint8Array(await blob.arrayBuffer()))).replace('sha256:', '')}-${storyId ?? 'library'}`;
  const pending = await store.soundOperations.get(operationId);
  if (pending?.imported) {
    await recoverSoundOperations(store);
    const saved = pending.imported;
    return { itemCount: saved.items.length, projectCount: saved.projects.length, maps: { projects: new Map(saved.maps.projects), revisions: new Map(saved.maps.revisions), items: new Map(saved.maps.items), assets: new Map(saved.maps.assets) } };
  }
  const maps: SoundPackMaps = { projects: new Map(manifest.projects.map(p => [p.id, newId()])), revisions: new Map(manifest.revisions.map(r => [r.id, newId()])), items: new Map(manifest.items.map(i => [i.id, newId()])), assets: new Map() };
  const collectionIds = new Map(manifest.collections.map(c => [c.id, newId()]));
  for (const a of manifest.assets) { const result = await gate.ingest({ bytes: files.get(a.record.id)!, source: 'upload', ownDevice: false, meta: { kind: 'AUDIO', mime: a.record.mime, origin: 'UPLOAD', creator: a.record.creator, license: a.record.license, sourceUrl: a.record.sourceUrl } }); const actual = result.assetId ? await store.assets.get(result.assetId) : undefined; if (!actual || actual.kind !== 'AUDIO' || actual.gateStatus === 'REJECTED' || actual.sha256 !== a.record.sha256) throw new Error('A packed sound was refused by local media review.'); maps.assets.set(a.record.id, actual.id); }
  const remapProject = (p: SoundProject): SoundProject => {
    const trackIds = new Map(p.tracks.map(t => [t.id, newId()])); const { storyId: _oldStory, ...rest } = p;
    return { ...rest, id: maps.projects.get(p.id)!, ...(storyId ? { storyId } : {}), tracks: p.tracks.map(t => ({ ...t, id: trackIds.get(t.id)! })), clips: p.clips.map(c => ({ ...c, id: newId(), trackId: trackIds.get(c.trackId)!, ...(c.assetId ? { assetId: maps.assets.get(c.assetId)! } : {}), ...(c.libraryItemId ? { libraryItemId: maps.items.get(c.libraryItemId)! } : {}) })) };
  };
  const imported = {
    collections: manifest.collections.map(c => ({ ...c, id: collectionIds.get(c.id)! })),
    projects: manifest.projects.map(remapProject),
    revisions: manifest.revisions.map(r => ({ ...r, id: maps.revisions.get(r.id)!, projectId: maps.projects.get(r.projectId)!, assetId: maps.assets.get(r.assetId)!, snapshot: remapProject(r.snapshot), sourceAssetIds: r.sourceAssetIds.map(id => maps.assets.get(id)!), ...(r.sourceAttribution ? { sourceAttribution: r.sourceAttribution.map(a => ({ ...a, assetId: maps.assets.get(a.assetId)! })) } : {}) })),
    items: manifest.items.map(i => ({ ...i, id: maps.items.get(i.id)!, assetId: maps.assets.get(i.assetId)!, peaks: [], collectionIds: i.collectionIds.map(id => collectionIds.get(id)!), ...(i.projectId ? { projectId: maps.projects.get(i.projectId)! } : {}), ...(i.revisionId ? { revisionId: maps.revisions.get(i.revisionId)! } : {}) })),
    maps: { projects: [...maps.projects], revisions: [...maps.revisions], items: [...maps.items], assets: [...maps.assets] },
  };
  await store.soundOperations.create({ id: operationId, state: 'STAGED', imported });
  await recoverSoundOperations(store);
  return { itemCount: manifest.items.length, projectCount: manifest.projects.length, maps };
}
