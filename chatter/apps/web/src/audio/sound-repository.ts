import { starterSoundAttribution } from './sound-starters.js';
import { inspectSoundFile, soundSourceByteLimit } from './sound-engine.js';
import {
  type Store, type Gate, type SoundProject, type SoundLibraryItem, type SoundAttribution,
  type SoundRevision, sha256, newId, soundSourceAssetIds, validateSoundProject, validateSoundItem,
  validateSoundAttribution, validateSoundRevision, emptySoundAttribution, SOUND_LIMITS,
} from '@chatter/shared';

const soundQueues = new WeakMap<Store, Map<string, Promise<unknown>>>();
/** Web Locks coordinate tabs; the queue also covers tests and browsers without Web Locks. */
export async function runSoundOperation<T>(store: Store, name: string, work: () => Promise<T>): Promise<T> {
  const queues = soundQueues.get(store) ?? new Map<string, Promise<unknown>>(); soundQueues.set(store, queues);
  const previous = queues.get(name) ?? Promise.resolve();
  const next: Promise<T> = previous.catch(() => undefined).then(async (): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request(`orbit-sound-${store.deviceId}-${name}`, work);
    return await work();
  });
  queues.set(name, next);
  try { return await next; } finally { if (queues.get(name) === next) queues.delete(name); }
}

export type SoundProgress = { signal?: AbortSignal; onProgress?: (stage: string) => void };
function cancelled(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('Sound operation cancelled.', 'AbortError'); }
const base = () => ({ id: newId(), createdAt: Date.now(), updatedAt: Date.now() });

async function importAudio(store: Store, gate: Gate, file: File, attribution: SoundAttribution, options: SoundProgress & { duration?: number }, recording: boolean): Promise<SoundLibraryItem> {
  validateSoundAttribution(attribution); cancelled(options.signal);
  if (!file.size || file.size > SOUND_LIMITS.sourceBytes) throw new Error('Choose a WAV no larger than 64 MiB, or compressed audio no larger than 20 MiB. Trim this sound first.');
  if (!/^audio\//.test(file.type) && !/\.(wav|mp3|m4a|aac|ogg|oga|flac|webm)$/i.test(file.name)) throw new Error('Choose a WAV, MP3, M4A, AAC, OGG, FLAC or WebM audio file.');
  const analysis = await inspectSoundFile(file, { signal: options.signal, onProgress: options.onProgress, ...(recording && options.duration !== undefined ? { knownDuration: options.duration } : {}) }); cancelled(options.signal);
  options.onProgress?.('Saving sound');
  const normalizedBytes = 'normalizedBytes' in analysis ? analysis.normalizedBytes as Uint8Array | undefined : undefined;
  const bytes = recording && normalizedBytes ? normalizedBytes : new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > soundSourceByteLimit(bytes)) throw new Error('This recording is too long to edit on this device. Make a shorter take.');
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  const inferredMime: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm' };
  const mime = normalizedBytes && recording ? 'audio/wav' : /^audio\//.test(file.type) ? file.type : inferredMime[extension] ?? 'audio/wav';
  const result = await gate.ingest({ bytes, source: recording ? 'recording' : 'upload', ...(recording ? { ownDevice: true } : {}), meta: { kind: 'AUDIO', mime, origin: recording ? 'RECORDING' : 'UPLOAD', creator: attribution.creator, license: attribution.license, sourceUrl: attribution.sourceUrl } });
  if (!result.assetId) throw new Error('This file was not accepted by the media review gate.');
  const asset = await store.assets.get(result.assetId);
  if (!asset || asset.kind !== 'AUDIO' || asset.gateStatus === 'REJECTED' || asset.sha256 !== await sha256(bytes)) throw new Error('The existing file cannot be used as sound. Restore or review the original.');
  const importId = `sound-file-${(await sha256(new TextEncoder().encode(JSON.stringify([asset.sha256, file.name, attribution])))).replace('sha256:', '')}`;
  const pendingImport = await store.soundOperations.get(importId);
  if (pendingImport?.item) { await recoverSoundOperations(store); const saved = await store.soundItems.get(pendingImport.item.id); if (saved) return saved; }
  const item: SoundLibraryItem = { ...base(), assetId: asset.id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 200) || 'Imported sound', attribution: structuredClone(attribution), tags: [], collectionIds: [], favorite: false, archived: false, duration: analysis.duration, peaks: analysis.peaks };
  validateSoundItem(item);
  await store.soundOperations.create({ ...base(), id: importId, state: 'STAGED', item });
  await recoverSoundOperations(store);
  const saved = await store.soundItems.get(item.id); if (!saved) throw new Error('The sound could not be saved. Retry.');
  return saved;
}
export function importSoundFile(store: Store, gate: Gate, file: File, attribution: SoundAttribution, options: SoundProgress = {}) {
  return runSoundOperation(store, 'file-import', () => importAudio(store, gate, file, attribution, options, false));
}
/** Call only with the bytes just captured by the live microphone. */
export function importSoundRecording(store: Store, gate: Gate, file: File, attribution: SoundAttribution, options: SoundProgress & { duration?: number } = {}) {
  return runSoundOperation(store, 'file-import', () => importAudio(store, gate, file, attribution, options, true));
}
export async function saveSoundProject(store: Store, project: SoundProject, expectedRevision: number): Promise<SoundProject> {
  validateSoundProject(project);
  return store.soundProjects.save(structuredClone(project), expectedRevision);
}
export async function updateSoundItem(store: Store, item: SoundLibraryItem): Promise<SoundLibraryItem> {
  validateSoundItem(item);
  const current = await store.soundItems.get(item.id);
  if (!current || current.assetId !== item.assetId || current.revisionId !== item.revisionId || current.projectId !== item.projectId) throw new Error('A library edit cannot replace its source or saved revision.');
  return store.soundItems.update(item.id, structuredClone(item));
}
export async function validateSoundSources(store: Store, project: SoundProject): Promise<Map<string, Uint8Array>> {
  validateSoundProject(project);
  const items = await store.soundItems.list();
  for (const clip of project.clips) if (clip.libraryItemId && !items.some(item => item.id === clip.libraryItemId && item.assetId === clip.assetId)) throw new Error(`“${clip.name}” has a missing library source. Restore or replace it before rendering.`);
  const revisions = await store.soundRevisions.list(); const sources = new Map<string, Uint8Array>();
  const queue = soundSourceAssetIds(project);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!; if (sources.has(id)) continue;
    if (queue.length > 2048) throw new Error('This sound has too many nested sources.');
    const asset = await store.assets.get(id); const name = project.clips.find(c => c.assetId === id)?.name || id.slice(0, 8);
    if (!asset || asset.kind !== 'AUDIO' || asset.gateStatus !== 'APPROVED') throw new Error(`“${name}” is missing or needs media review. Restore or review it before using this sound.`);
    const bytes = await store.blobs.get(asset.sha256);
    if (!bytes || await sha256(bytes) !== asset.sha256) throw new Error(`“${name}” has missing or damaged audio. Restore its source file.`);
    sources.set(id, bytes);
    for (const revision of revisions.filter(r => r.assetId === id)) queue.push(...revision.sourceAssetIds);
  }
  return sources;
}
async function verifySavedSources(store: Store, ids: string[]): Promise<void> {
  for (const id of new Set(ids)) {
    const asset = await store.assets.get(id); const bytes = asset ? await store.blobs.get(asset.sha256) : undefined;
    if (!asset || asset.kind !== 'AUDIO' || !bytes || await sha256(bytes) !== asset.sha256) throw new Error('A pending sound has missing or damaged source bytes. Restore its source or retry importing the pack.');
  }
}
export function recoverSoundOperations(store: Store): Promise<void> {
  return runSoundOperation(store, 'recovery', () => recoverOperations(store));
}
async function recoverOperations(store: Store): Promise<void> {
  for (const operation of await store.soundOperations.list()) {
    if (operation.state === 'COMMITTED') continue;
    if (operation.imported) {
      const data = operation.imported;
      data.projects.forEach(validateSoundProject); data.items.forEach(validateSoundItem); data.revisions.forEach(validateSoundRevision);
      await verifySavedSources(store, [...data.items.map(i => i.assetId), ...data.projects.flatMap(soundSourceAssetIds), ...data.revisions.flatMap(r => [r.assetId, ...r.sourceAssetIds, ...soundSourceAssetIds(r.snapshot)])]);
      for (const row of data.collections) if (!await store.soundCollections.get(row.id)) await store.soundCollections.create(row);
      for (const row of data.projects) if (!await store.soundProjects.get(row.id)) await store.soundProjects.create(row);
      for (const row of data.revisions) if (!await store.soundRevisions.get(row.id)) await store.soundRevisions.create(row);
      for (const row of data.items) if (!await store.soundItems.get(row.id)) await store.soundItems.create(row);
      await store.soundOperations.update(operation.id, { state: 'COMMITTED' });
      continue;
    }
    if (!operation.item) throw new Error('A pending sound operation has invalid metadata.');
    validateSoundItem(operation.item);
    const asset = await store.assets.get(operation.item.assetId);
    const verifiedBytes = asset ? await store.blobs.get(asset.sha256) : undefined;
    if (!asset || !verifiedBytes || await sha256(verifiedBytes) !== asset.sha256) throw new Error('A pending sound has missing bytes. Restore the file and retry.');
    if (operation.revision) { validateSoundRevision(operation.revision); await verifySavedSources(store, [...operation.revision.sourceAssetIds, ...soundSourceAssetIds(operation.revision.snapshot)]); }
    if (operation.revision && !await store.soundRevisions.get(operation.revision.id)) await store.soundRevisions.create(operation.revision);
    if (!await store.soundItems.get(operation.item.id)) await store.soundItems.create(operation.item);
    await store.soundOperations.update(operation.id, { state: 'COMMITTED' });
  }
}
export function saveSoundVersion(store: Store, gate: Gate, project: SoundProject, rendered: { bytes: Uint8Array; duration: number; peaks: number[]; peak: number }): Promise<SoundLibraryItem> {
  return runSoundOperation(store, 'version', () => saveVersion(store, gate, project, rendered));
}
async function saveVersion(store: Store, gate: Gate, project: SoundProject, rendered: { bytes: Uint8Array; duration: number; peaks: number[]; peak: number }): Promise<SoundLibraryItem> {
  validateSoundProject(project);
  const sources = await validateSoundSources(store, project);
  const current = await store.soundProjects.get(project.id);
  if (!current || current.revision !== project.revision || JSON.stringify(current) !== JSON.stringify(project)) throw new Error('Save the current arrangement before saving a sound version.');
  const recipeHash = await sha256(new TextEncoder().encode(JSON.stringify(project)));
  const renderHash = await sha256(rendered.bytes);
  const operationId = `sound-${(await sha256(new TextEncoder().encode(`${recipeHash}:${renderHash}`))).replace('sha256:', '')}`;
  const pending = await store.soundOperations.get(operationId);
  if (pending?.item) { await recoverSoundOperations(store); const found = await store.soundItems.get(pending.item.id); if (found) { const actual = await store.assets.get(found.assetId); if (!actual || actual.kind !== 'AUDIO' || actual.gateStatus !== 'APPROVED') throw new Error('This saved sound now needs media review.'); return found; } }
  const result = await gate.ingest({ bytes: rendered.bytes, source: 'generated', ownDevice: true, meta: { kind: 'AUDIO', origin: 'GENERATED', mime: 'audio/wav', ...(project.storyId ? { storyId: project.storyId } : {}) } });
  const asset = result.assetId ? await store.assets.get(result.assetId) : undefined;
  if (!asset || asset.kind !== 'AUDIO' || asset.gateStatus !== 'APPROVED') throw new Error('The rendered file needs media review before it can be saved as a usable sound.');
  const items = await store.soundItems.list();
  const selected = project.clips.flatMap(c => c.assetId ? items.filter(i => c.libraryItemId ? i.id === c.libraryItemId && i.assetId === c.assetId : i.assetId === c.assetId) : []);
  const sourceAttribution = selected.map(i => ({ assetId: i.assetId, attribution: structuredClone(i.attribution) }));
  const attribution = [...new Map(selected.map(i => [JSON.stringify(i.attribution), structuredClone(i.attribution)])).values()];
  for (const source of await store.soundRevisions.list()) if (sources.has(source.assetId)) { attribution.push(...structuredClone(source.attribution)); sourceAttribution.push(...structuredClone(source.sourceAttribution ?? [])); }
  for (const id of sources.keys()) if (!selected.some(item => item.assetId === id)) {
    const source = await store.assets.get(id);
    if (source) { const credit = { ...emptySoundAttribution(), creator: source.creator ?? '', sourceUrl: source.sourceUrl ?? '', license: source.license ?? '' }; attribution.push(credit); sourceAttribution.push({ assetId: id, attribution: credit }); }
  }
  if (project.clips.some(clip => clip.generator)) attribution.push(structuredClone(starterSoundAttribution));
  for (const credit of attribution) validateSoundAttribution(credit);
  const revision: SoundRevision = { ...base(), projectId: project.id, assetId: asset.id, snapshot: structuredClone(project), sourceAssetIds: [...sources.keys()], attribution: [...new Map(attribution.map(a => [JSON.stringify(a), a])).values()], sourceAttribution: [...new Map(sourceAttribution.map(a => [JSON.stringify(a), a])).values()], recipeHash, duration: rendered.duration };
  const item: SoundLibraryItem = { ...base(), assetId: asset.id, projectId: project.id, revisionId: revision.id, name: project.name, attribution: { ...emptySoundAttribution(), creator: 'Club sound project', license: sources.size ? 'See source credits' : 'Original synthesized audio', notes: sources.size ? 'Source permissions and creator details are frozen in this version’s bundled source credits. Member contributions are recorded separately.' : 'Generated locally with Foley. Member contributions are recorded in this version’s project credits.' }, tags: [], collectionIds: [], favorite: false, archived: false, duration: rendered.duration, peaks: rendered.peaks };
  validateSoundItem(item);
  await store.soundOperations.create({ ...base(), id: operationId, state: 'STAGED', item, revision });
  await recoverSoundOperations(store);
  const saved = await store.soundItems.get(item.id); if (!saved) throw new Error('The version was not committed. Retry saving.');
  return saved;
}
