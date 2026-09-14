import { describe, expect, test, beforeEach, vi } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { Gate } from './gate-ingest.js';
import { DEFAULT_GATE_CONFIG } from './gate.js';
import { JobQueue } from './jobs.js';
import { chooseStoryTake, defaultTakeEdits, handoffTake, saveTake, saveTakeEdits, validateTakeEdits } from './booth.js';
import { canPublish } from './publish.js';
import type { Store } from './store.js';

const AUDIO = new TextEncoder().encode('pretend this is a webm opus take');

let store: Store;
let gate: Gate;
let jobs: JobQueue;
beforeEach(async () => {
  store = new MemoryStore('device-aaa');
  await store.open();
  gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0.01; } });
  jobs = new JobQueue(store);
});

describe('saveTake', () => {
  test('empty audio and invalid durations are rejected before writing', async () => {
    await expect(saveTake({ store, gate, jobs, storyId: 's1', userId: 'u1', bytes: new Uint8Array(), durationSec: 5 })).rejects.toThrow(/no usable audio/);
    await expect(saveTake({ store, gate, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: NaN })).rejects.toThrow(/no usable audio/);
    expect(await store.takes.list()).toHaveLength(0);
  });

  test('recovery retries reuse the take after a partial save failure', async () => {
    const input = { store, gate, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 5, captureId: 'stable-capture', mime: 'audio/mp4' };
    const createJob = vi.spyOn(store.jobs, 'create').mockRejectedValueOnce(new Error('Storage busy'));
    await expect(saveTake(input)).rejects.toThrow(/Storage busy/);
    const result = await saveTake(input);
    expect(await store.takes.list()).toHaveLength(1); expect(await jobs.waiting()).toHaveLength(1);
    expect((await store.assets.get(result.assetId))!.mime).toBe('audio/mp4');
    createJob.mockRestore();
  });

  test('uploaded audio stays behind the media check and does not start transcription prematurely', async () => {
    const result = await saveTake({ store, gate, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 5, origin: 'UPLOAD' });
    expect((await store.assets.get(result.assetId))!.gateStatus).toBe('QUARANTINED');
    expect(await jobs.waiting()).toHaveLength(0);
    await expect(chooseStoryTake(store, 's1', result.takeId)).rejects.toThrow(/adviser/);
  });
  test('a finished take becomes an Asset through the Gate', async () => {
    const result = await saveTake({ store, gate, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 58 });
    const asset = (await store.assets.get(result.assetId))!;
    expect(asset.kind).toBe('AUDIO');
    expect(asset.origin).toBe('RECORDING');
  });

  test('the take is attached to the story that was being read', async () => {
    const result = await saveTake({ store, gate, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 58, performanceMode: 'NARRATION', slated: true });
    const take = (await store.takes.get(result.takeId))!;
    expect(take.storyId).toBe('s1');
    expect(take.userId).toBe('u1');
    expect(take.durationSec).toBe(58);
    expect(take.performanceMode).toBe('NARRATION');
    expect(take.slated).toBe(true);
  });

  test('stopping enqueues a transcript job, per the Booth acceptance criterion', async () => {
    const result = await saveTake({ store, gate, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 58 });
    const waiting = await jobs.waiting();
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.kind).toBe('transcribe');
    expect((waiting[0]!.payload as any).assetId).toBe(result.assetId);
  });

  test('a raw take is given an expiry, because raw material does not persist', async () => {
    const result = await saveTake({ store, gate, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 58, retentionDays: 90 });
    const asset = (await store.assets.get(result.assetId))!;
    expect(asset.expiresAt).toBeGreaterThan(Date.now());
  });

  test('the take audio is on the device, addressed by its hash', async () => {
    const result = await saveTake({ store, gate, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 58 });
    const asset = (await store.assets.get(result.assetId))!;
    expect(await store.blobs.has(asset.sha256)).toBe(true);
  });

  test('a take is NOT held up just because the picture checker is down', async () => {
    // The on-device model classifies images. A kid's own voice is not an
    // image, so the Booth keeps working while the model is still loading.
    const noClassifier = new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, async classify() { return 1; } });
    const result = await saveTake({ store, gate: noClassifier, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 58 });
    expect((await store.assets.get(result.assetId))!.gateStatus).toBe('APPROVED');
    expect(await jobs.waiting()).toHaveLength(1);
  });

  test('a take the Gate refuses does not become a Take and enqueues nothing', async () => {
    const refusing = {
      async ingest() { return { status: 'REJECTED' as const, reason: 'no-bytes' }; },
    } as unknown as Gate;
    await expect(
      saveTake({ store, gate: refusing, jobs, storyId: 's1', userId: 'u1', bytes: AUDIO, durationSec: 58 }),
    ).rejects.toThrow(/could not be saved/i);
    expect(await store.takes.list()).toHaveLength(0);
    expect(await jobs.waiting()).toHaveLength(0);
  });
});

describe('take edits and the story handoff', () => {
  test('rejects reversed, empty and out-of-bounds trims and fades', () => {
    expect(() => validateTakeEdits({ ...defaultTakeEdits(5), trimStart: 5 }, 5)).toThrow(/start before/);
    expect(() => validateTakeEdits({ ...defaultTakeEdits(5), trimEnd: 8 }, 5)).toThrow();
    expect(() => validateTakeEdits({ ...defaultTakeEdits(5), fadeOut: 8 }, 5)).toThrow(/fade/);
    expect(() => validateTakeEdits({ ...defaultTakeEdits(5), gainDb: Infinity }, 5)).toThrow(/valid numbers/);
  });

  test('handoff saves an edited derivative and keeps the original bytes', async () => {
    const story = await store.stories.create({ title: 'A school story', body: { type: 'doc', content: [{ type: 'text', text: 'Here is the story introduction.' }] } });
    const { takeId, assetId } = await saveTake({ store, gate, jobs, storyId: story.id, userId: 'u1', bytes: AUDIO, durationSec: 5 });
    const edits = { ...defaultTakeEdits(5), trimStart: 1, trimEnd: 4 };
    await saveTakeEdits(store, takeId, edits); await chooseStoryTake(store, story.id, takeId);
    expect((await canPublish(store, story.id)).blockers.some((item) => item.reason === 'take-edit-not-rendered')).toBe(true);
    await handoffTake({ store, gate, takeId, edits, bytes: new TextEncoder().encode('edited wav bytes'), actor: 'u1' });
    const take = (await store.takes.get(takeId))!;
    expect(take.assetId).toBe(assetId); expect(take.renderedAssetId).not.toBe(assetId);
    expect(await store.blobs.get((await store.assets.get(assetId))!.sha256)).toEqual(AUDIO);
    expect((await store.stories.get(story.id))!).toMatchObject({ selectedTakeId: takeId, status: 'PITCH' });
    expect((await canPublish(store, story.id)).ok).toBe(true);
    await saveTakeEdits(store, takeId, { ...edits, gainDb: -3 });
    expect((await store.takes.get(takeId))!.renderedAssetId).toBeUndefined();
    expect((await canPublish(store, story.id)).ok).toBe(false);
  });

  test('a take from another story cannot be selected and a handoff preserves adviser holds', async () => {
    const story = await store.stories.create({ title: 'Held story', status: 'HELD', body: { type: 'doc', content: [{ type: 'text', text: 'The draft.' }] } });
    const { takeId } = await saveTake({ store, gate, jobs, storyId: story.id, userId: 'u1', bytes: AUDIO, durationSec: 5 });
    await expect(chooseStoryTake(store, 'another-story', takeId)).rejects.toThrow(/belonging/);
    await handoffTake({ store, gate, takeId, edits: defaultTakeEdits(5), bytes: new TextEncoder().encode('wave'), actor: 'u1' });
    expect((await store.stories.get(story.id))!.status).toBe('HELD');
  });

  test('a podcast take moves to Chatterbox without demanding a hidden Desk draft', async () => {
    const story = await store.stories.create({ title: 'Hallway field notes', creationRecipeId: 'podcast', channels: ['pod'], workflowStepId: 'record', body: { type: 'doc', content: [] } });
    const { takeId } = await saveTake({ store, gate, jobs, storyId: story.id, userId: 'u1', bytes: AUDIO, durationSec: 5 });
    const handed = await handoffTake({ store, gate, takeId, edits: defaultTakeEdits(5), bytes: new TextEncoder().encode('edited podcast take'), actor: 'u1' });
    expect(handed).toMatchObject({ status: 'BOOTH', workflowStepId: 'edit' });
  });

  test('finishing a supporting Booth clip does not move an article off its writing step', async () => {
    const story = await store.stories.create({
      title: 'Mr. Alvarez is retiring',
      creationRecipeId: 'article',
      channels: ['pod', 'web'],
      workflowStepId: 'write',
      status: 'WORK',
      body: { type: 'doc', content: [] },
    });
    const { takeId } = await saveTake({ store, gate, jobs, storyId: story.id, userId: 'u1', bytes: AUDIO, durationSec: 5 });

    const finished = await handoffTake({
      store,
      gate,
      takeId,
      edits: defaultTakeEdits(5),
      bytes: new TextEncoder().encode('edited source clip'),
      actor: 'u1',
    });

    expect(finished).toMatchObject({ status: 'WORK', workflowStepId: 'write', selectedTakeId: takeId });
  });
});
