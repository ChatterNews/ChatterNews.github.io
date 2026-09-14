/**
 * What happens when a kid stops recording. SPEC S6, Booth acceptance:
 * "take saved as Asset via Gate; transcript job enqueued on stop".
 *
 * Deliberately not a React concern - the room calls this and shows the result,
 * so the rule about every byte passing the Gate is enforced in one place.
 */
import type { Store } from './store.js';
import type { Gate } from './gate-ingest.js';
import type { JobQueue } from './jobs.js';
import { recordRole } from './roles.js';
import { saveDeliverable } from './deliverables.js';
import type { Story, Take, TakeEdits } from './types.js';
import { advanceStoryWorkflow, resolveStoryCreationRecipe } from './story-recipes.js';

export interface SaveTakeInput {
  store: Store;
  gate: Gate;
  jobs: JobQueue;
  storyId: string;
  userId: string;
  bytes: Uint8Array;
  durationSec: number;
  mime?: string;
  captureId?: string;
  name?: string;
  performanceMode?: Take['performanceMode'];
  slated?: boolean;
  origin?: 'RECORDING' | 'UPLOAD';
  markers?: Take['markers'];
  /** Raw material expires; published work does not. SPEC S3. */
  retentionDays?: number;
}

export interface SavedTake {
  takeId: string;
  assetId: string;
}

export async function saveTake(input: SaveTakeInput): Promise<SavedTake> {
  const { store, gate, jobs, storyId, userId, bytes, durationSec } = input;

  if (!bytes.length || !Number.isFinite(durationSec) || durationSec <= 0) throw new Error('That take contains no usable audio. Record again or choose another file.');
  const existingTake = input.captureId ? (await store.takes.list()).find((take) => take.captureId === input.captureId && take.storyId === storyId) : undefined;

  const result = existingTake ? { assetId: existingTake.assetId } : await gate.ingest({
    bytes,
    ownDevice: input.origin !== 'UPLOAD',
    source: input.origin === 'UPLOAD' ? 'upload' : 'recording',
    meta: {
      kind: 'AUDIO',
      mime: input.mime ?? 'audio/webm',
      origin: input.origin ?? 'RECORDING',
      storyId,
      actor: userId,
    },
  });

  if (!result.assetId) throw new Error('That take could not be saved by the media checker. Your recording is still available to retry.');

  if (input.retentionDays) {
    await store.assets.update(result.assetId, {
      expiresAt: Date.now() + input.retentionDays * 24 * 60 * 60 * 1000,
    });
  }

  const performance = {
    ...(input.performanceMode ? { performanceMode: input.performanceMode } : {}),
    ...(input.slated !== undefined ? { slated: input.slated } : {}),
  };
  const take = existingTake ? await store.takes.update(existingTake.id, performance) : await store.takes.create({
    storyId, userId, assetId: result.assetId, durationSec,
    ...(input.name ? { name: input.name } : {}),
    ...(input.captureId ? { captureId: input.captureId } : {}),
    ...(input.markers ? { markers: input.markers } : {}),
    ...performance,
  });

  // Whisper runs in the tab, so this is a local job, not a call to anywhere.
  const asset = await store.assets.get(result.assetId);
  const queued = (await store.jobs.list()).some((job) => job.kind === 'transcribe' && (job.payload as { assetId?: string }).assetId === result.assetId);
  if (asset?.gateStatus === 'APPROVED' && !queued) await jobs.enqueue('transcribe', { assetId: result.assetId, storyId });

  // Reading a script out loud is the "voice" job. Written down here rather
  // than in the room, so it is recorded however the take was made.
  await recordRole(store, { userId, storyId, role: 'voice' });
  const story = await store.stories.get(storyId);
  const extension = (input.mime ?? 'audio/webm').includes('wav') ? 'wav' : (input.mime ?? '').includes('mpeg') ? 'mp3' : (input.mime ?? '').includes('ogg') ? 'ogg' : 'webm';
  await saveDeliverable(store, {
    bytes, title: input.name || 'Booth take', fileName: `${story?.slug ?? 'story'}-${(input.name || 'booth-take').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${extension}`,
    kind: 'AUDIO', room: 'BOOTH', stage: 'WORKING', mime: input.mime ?? 'audio/webm', storyId, authorId: userId, sourceAssetId: result.assetId, durationSec,
  });

  return { takeId: take.id, assetId: result.assetId };
}

export function defaultTakeEdits(duration: number): TakeEdits {
  return { trimStart: 0, trimEnd: duration, gainDb: 0, fadeIn: 0, fadeOut: 0, normalize: false };
}

export function validateTakeEdits(edits: TakeEdits, duration: number): TakeEdits {
  if (![edits.trimStart, edits.trimEnd, edits.gainDb, edits.fadeIn, edits.fadeOut, duration].every(Number.isFinite)) throw new Error('Use valid numbers for the audio edit.');
  if (edits.trimStart < 0 || edits.trimEnd > duration + 0.01 || edits.trimEnd - edits.trimStart < 0.02) throw new Error('Keep at least 0.02 seconds, with the start before the end of the take.');
  if (edits.gainDb < -24 || edits.gainDb > 18) throw new Error('Set the level between −24 and +18 dB.');
  const length = edits.trimEnd - edits.trimStart;
  if (edits.fadeIn < 0 || edits.fadeOut < 0 || edits.fadeIn > length || edits.fadeOut > length) throw new Error('Each fade must fit inside the trimmed take.');
  return { ...edits, trimEnd: Math.min(duration, edits.trimEnd) };
}

export async function saveTakeEdits(store: Store, takeId: string, edits: TakeEdits): Promise<Take> {
  const take = await store.takes.get(takeId);
  if (!take) throw new Error('That take is no longer available.');
  const checked = validateTakeEdits(edits, take.durationSec);
  return store.takes.update(takeId, { edits: checked, ...(take.renderedEditKey !== JSON.stringify(checked) ? { renderedAssetId: undefined, renderedEditKey: undefined } : {}) });
}

export async function chooseStoryTake(store: Store, storyId: string, takeId: string): Promise<void> {
  const take = await store.takes.get(takeId);
  if (!take || take.storyId !== storyId) throw new Error('Choose a take belonging to this story.');
  const asset = await store.assets.get(take.assetId);
  if (asset?.gateStatus !== 'APPROVED') throw new Error('An adviser needs to check this imported audio before it can be used.');
  if (!await store.blobs.has(asset.sha256)) throw new Error('This audio is not available on this device.');
  await store.stories.update(storyId, { selectedTakeId: takeId });
}

export async function handoffTake(input: { store: Store; gate: Gate; takeId: string; bytes: Uint8Array; edits: TakeEdits; actor: string }): Promise<Story> {
  const { store, gate, takeId, bytes, actor } = input;
  const take = await store.takes.get(takeId);
  if (!take) throw new Error('That take is no longer available.');
  const story = await store.stories.get(take.storyId);
  if (!story) throw new Error('That take is no longer attached to a story.');
  if (story.status === 'DONE') throw new Error('This story is already published. Start a new story for a new edition.');
  const original = await store.assets.get(take.assetId);
  if (original?.gateStatus !== 'APPROVED') throw new Error('An adviser needs to check the original recording first.');
  const edits = validateTakeEdits(input.edits, take.durationSec);
  if (!bytes.length) throw new Error('The edited audio is empty. Preview it before trying again.');
  const result = await gate.ingest({ bytes, source: 'generated', ownDevice: true, meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'GENERATED', storyId: story.id, actor, creator: original.creator, license: original.license } });
  if (!result.assetId) throw new Error('The edited take did not save. Try the handoff again.');
  const podcast = resolveStoryCreationRecipe(story).id === 'podcast';
  await saveDeliverable(store, {
    bytes, title: `${take.name || 'Booth take'} · edited`, fileName: `${story.slug}-${(take.name || 'edited-take').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-edited.wav`,
    kind: 'AUDIO', room: 'BOOTH', stage: podcast ? 'REVIEW' : 'WORKING', mime: 'audio/wav', storyId: story.id, authorId: actor, sourceAssetId: result.assetId, durationSec: edits.trimEnd - edits.trimStart,
  });
  await store.takes.update(take.id, { edits, renderedAssetId: result.assetId, renderedEditKey: JSON.stringify(edits) });
  if (story.status === 'HELD') return store.stories.update(story.id, { selectedTakeId: take.id, status: 'HELD' });
  const updated = await store.stories.update(story.id, { selectedTakeId: take.id });
  return podcast ? advanceStoryWorkflow(store, story.id, 'edit') : updated;
}
