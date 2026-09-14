/**
 * Guards the object-store upgrade path.
 *
 * Adding a name to STORES without bumping DB_VERSION leaves every browser
 * that already opened an older Chatter without the new store - and it fails
 * only later, at the moment something writes to it. That shipped once.
 */
import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { installOpfsShim } from '@chatter/shared/testing/opfs-shim';
import { claimCrewTask, createMotionPackage, createPitch, createShowtimeProject, defaultTakeEdits, JobQueue, openReview, saveTakeEdits } from '@chatter/shared';
import { IdbStore, STORES } from './store-idb.js';

installOpfsShim();

/** An old Chatter: version 1, and no `jobs` store. */
function openOldDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('stories', { keyPath: 'id' });
      db.createObjectStore('events', { keyPath: 'id' });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}

describe('opening a database made by an older Chatter', () => {
  test('story plans and non-destructive take edits survive closing and reopening', async () => {
    const store = new IdbStore('chatter-production-persistence');
    await store.open();
    const story = await createPitch(store, 'Interview plan', 'interview', 'reporter', 'What changed at school?');
    await store.stories.update(story.id, { dueAt: 1790000000000, brief: { ...story.brief!, productionNotes: 'Pronounce the name carefully.' } });
    const take = await store.takes.create({ storyId: story.id, assetId: 'original', userId: 'reporter', durationSec: 20, createdAt: Date.now(), name: 'Best read', notes: 'Good pacing', captureId: 'stable-id', markers: [{ id: 'marker', at: 5, label: 'Quote begins' }] });
    await saveTakeEdits(store, take.id, { ...defaultTakeEdits(20), trimStart: 2, trimEnd: 18, fadeOut: 0.3, gainDb: -3 });
    await store.stories.update(story.id, { selectedTakeId: take.id });
    store.close();
    const reopened = new IdbStore('chatter-production-persistence');
    await reopened.open();
    expect(await reopened.stories.get(story.id)).toMatchObject({ selectedTakeId: take.id, dueAt: 1790000000000, brief: { angle: 'What changed at school?', productionNotes: 'Pronounce the name carefully.' } });
    expect(await reopened.takes.get(take.id)).toMatchObject({ name: 'Best read', assetId: 'original', markers: [{ at: 5 }], edits: { trimStart: 2, trimEnd: 18, fadeOut: 0.3, gainDb: -3 } });
    reopened.close();
  });
  test('version 4 gains persistent student jobs and reviews without losing drafts', async () => {
    const name = 'chatter-upgrade-newsroom';
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 4);
      request.onupgradeneeded = () => {
        for (const collection of STORES.filter((item) => item !== 'crewTasks' && item !== 'reviews')) request.result.createObjectStore(collection, { keyPath: 'id' });
        request.transaction!.objectStore('stories').put({ id: 'existing-story', slug: 'keep-my-draft', title: 'Keep my draft', status: 'DRAFT', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Student writing stays here.' }] }] }, channels: ['web'], bylineIds: [], readTimeSec: 2, createdAt: 1, updatedAt: 1 });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const store = new IdbStore(name);
    await store.open();
    const review = await openReview(store, 'existing-story', 'editor');
    const job = await claimCrewTask(store, 'existing-story', 'write', 'writer');
    await store.crewTasks.update(job.id, { handoffNote: 'My work is saved in the Desk.', completedSteps: ['lead'] });
    store.close();
    const reopened = new IdbStore(name);
    await reopened.open();
    expect((await reopened.stories.get('existing-story'))!.title).toBe('Keep my draft');
    expect((await reopened.reviews.get(review.id))!.reviewerId).toBe('editor');
    expect(await reopened.crewTasks.get(job.id)).toMatchObject({ handoffNote: 'My work is saved in the Desk.', completedSteps: ['lead'] });
    reopened.close();
  });

  test('every object store the app uses exists after opening', async () => {
    await openOldDatabase('chatter-upgrade-a');
    const store = new IdbStore('chatter-upgrade-a');
    await store.open();
    const names = (store as unknown as { database: IDBDatabase }).database.objectStoreNames;
    for (const expected of STORES) {
      expect(Array.from(names)).toContain(expected);
    }
  });

  test('version 6 gains the Media Bin without losing saved designs', async () => {
    const name = 'chatter-upgrade-deliverables';
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 6);
      request.onupgradeneeded = () => {
        for (const collection of STORES.filter((item) => item !== 'deliverables')) request.result.createObjectStore(collection, { keyPath: collection === 'meta' ? 'key' : 'id' });
        request.transaction!.objectStore('blasts').put({ id: 'design-before-bin', title: 'Front page', format: 'LETTER_PORTRAIT', width: 816, height: 1056, pages: [], createdAt: 1, updatedAt: 1 });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const store = new IdbStore(name); await store.open();
    expect((await store.blasts.get('design-before-bin')).title).toBe('Front page');
    const saved = await store.deliverables.create({ title: 'Front page PDF', fileName: 'front-page.pdf', kind: 'DOCUMENT', room: 'BLAST', stage: 'FINAL', mime: 'application/pdf', bytes: 4, blobHash: 'sha256:test' });
    store.close();
    const reopened = new IdbStore(name); await reopened.open();
    expect((await reopened.deliverables.get(saved.id)).fileName).toBe('front-page.pdf');
    reopened.close();
  });

  test('version 7 gains persistent Showtime projects without losing Media Bin files', async () => {
    const name = 'chatter-upgrade-showtime';
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 7);
      request.onupgradeneeded = () => {
        for (const collection of STORES.filter((item) => item !== 'showtimeProjects')) request.result.createObjectStore(collection, { keyPath: collection === 'meta' ? 'key' : 'id' });
        request.transaction!.objectStore('deliverables').put({ id: 'video-before-showtime', title: 'Morning show', fileName: 'morning-show.webm', kind: 'VIDEO', room: 'SHOWTIME', stage: 'FINAL', mime: 'video/webm', bytes: 4, blobHash: 'sha256:video', createdAt: 1, updatedAt: 1 });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const store = new IdbStore(name); await store.open();
    const draft = createShowtimeProject({ title: 'Morning show edit', storyId: 'story-one' });
    const { id: _id, createdAt: _created, updatedAt: _updated, ...input } = draft;
    const saved = await store.showtimeProjects.create(input);
    store.close();
    const reopened = new IdbStore(name); await reopened.open();
    expect((await reopened.deliverables.get('video-before-showtime')).fileName).toBe('morning-show.webm');
    expect(await reopened.showtimeProjects.get(saved.id)).toMatchObject({ title: 'Morning show edit', storyId: 'story-one' });
    reopened.close();
  });

  test('version 8 gains Chatterbox shows and episodes without losing Showtime projects', async () => {
    const name = 'chatter-upgrade-podcast';
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 8);
      request.onupgradeneeded = () => {
        for (const collection of STORES.filter((item) => item !== 'podcastShows' && item !== 'podcastProjects')) request.result.createObjectStore(collection, { keyPath: collection === 'meta' ? 'key' : 'id' });
        request.transaction!.objectStore('showtimeProjects').put({ id: 'show-before-podcast', title: 'Morning show', format: 'WIDE', width: 1280, height: 720, clips: [], titles: [], createdAt: 1, updatedAt: 1 });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const store = new IdbStore(name); await store.open();
    expect((await store.showtimeProjects.get('show-before-podcast')).title).toBe('Morning show');
    const show = await store.podcastShows.create({ title: 'Chatterbox Podcast', description: 'School voices', hostIds: [], defaultVoicePreset: 'CLEAN', nextEpisodeNumber: 1 });
    const episode = await store.podcastProjects.create({ title: 'Episode 1', description: '', showId: show.id, storyIds: [], episodeType: 'FULL', explicit: false, state: 'DRAFT', segments: [], tracks: [], clips: [], chapters: [], targetLufs: -16, truePeakDb: -1 });
    store.close();
    const reopened = new IdbStore(name); await reopened.open();
    expect(await reopened.podcastShows.get(show.id)).toMatchObject({ title: 'Chatterbox Podcast' });
    expect(await reopened.podcastProjects.get(episode.id)).toMatchObject({ targetLufs: -16 });
    reopened.close();
  });

  test('version 9 gains saved Studio samplers without losing podcast episodes', async () => {
    const name = 'chatter-upgrade-samplers';
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 9);
      request.onupgradeneeded = () => {
        for (const collection of STORES.filter((item) => item !== 'samplerPresets')) request.result.createObjectStore(collection, { keyPath: collection === 'meta' ? 'key' : 'id' });
        request.transaction!.objectStore('podcastProjects').put({ id: 'pod-before-sampler', title: 'Field notes', showId: 'show', storyIds: ['story'], tracks: [], clips: [], segments: [], chapters: [], createdAt: 1, updatedAt: 1 });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const store = new IdbStore(name); await store.open();
    expect((await store.podcastProjects.get('pod-before-sampler')).title).toBe('Field notes');
    const saved = await store.samplerPresets.create({ storyId: 'story', name: 'Bell sampler', sampleName: 'bell.wav', sourceAssetId: 'asset', settings: { layout: 'PLAY', start: 0, end: 1, rootNote: 60, tune: 0, attack: 0, release: .38, filter: 1, mode: 'ONE_SHOT', slicePoints: [0, 1] } });
    store.close();
    const reopened = new IdbStore(name); await reopened.open();
    expect(await reopened.samplerPresets.get(saved.id)).toMatchObject({ sourceAssetId: 'asset', settings: { rootNote: 60 } });
    reopened.close();
  });

  test('version 5 gains persistent Stinger packages without losing newsroom work', async () => {
    const name = 'chatter-upgrade-stinger';
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 5);
      request.onupgradeneeded = () => {
        for (const collection of STORES.filter((item) => item !== 'motionPackages')) request.result.createObjectStore(collection, { keyPath: collection === 'meta' ? 'key' : 'id' });
        request.transaction!.objectStore('stories').put({ id: 'story-before-stinger', slug: 'still-here', title: 'Still here', status: 'DRAFT', body: { type: 'doc', content: [] }, channels: ['web'], bylineIds: [], readTimeSec: 0, createdAt: 1, updatedAt: 1 });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const store = new IdbStore(name); await store.open();
    const draft = createMotionPackage('bulletin', { storyId: 'story-before-stinger' });
    const { id: _id, createdAt: _created, updatedAt: _updated, ...input } = draft;
    const saved = await store.motionPackages.create(input);
    store.close();
    const reopened = new IdbStore(name); await reopened.open();
    expect((await reopened.stories.get('story-before-stinger'))!.title).toBe('Still here');
    const packageAfterUpgrade = await reopened.motionPackages.get(saved.id);
    expect(packageAfterUpgrade?.storyId).toBe('story-before-stinger');
    expect(packageAfterUpgrade?.scenes[0]?.kind).toBe('OPEN');
    reopened.close();
  });

  test('a transcript job can be enqueued on an upgraded database', async () => {
    await openOldDatabase('chatter-upgrade-b');
    const store = new IdbStore('chatter-upgrade-b');
    await store.open();
    const jobs = new JobQueue(store);
    await jobs.enqueue('transcribe', { assetId: 'a1' });
    expect(await jobs.waiting()).toHaveLength(1);
  });

  test('work already in the old database survives the upgrade', async () => {
    await openOldDatabase('chatter-upgrade-c');
    const store = new IdbStore('chatter-upgrade-c');
    await store.open();
    const story = await store.stories.create({ title: 'Taco bar' });
    store.close();

    const reopened = new IdbStore('chatter-upgrade-c');
    await reopened.open();
    expect((await reopened.stories.get(story.id))!.title).toBe('Taco bar');
  });
});


describe('restoring original Chatter after the alternative', () => {
  test('opens version 11 and preserves original stories and alternative Studio records', async () => {
    const name = 'chatter-restored-original-v11';
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 11);
      request.onupgradeneeded = () => {
        for (const collection of STORES) request.result.createObjectStore(collection, { keyPath: collection === 'meta' ? 'key' : 'id' });
        request.transaction!.objectStore('stories').put({ id: 'original-story', title: 'Our original newsroom', body: { type: 'doc', content: [] } });
        request.transaction!.objectStore('studioProjects').put({ id: 'alternative-song', title: 'Keep this song', tracks: ['unchanged'] });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const original = new IdbStore(name);
    await original.open();
    expect(await original.stories.get('original-story')).toMatchObject({ title: 'Our original newsroom' });
    const database = (original as unknown as { database: IDBDatabase }).database;
    const song = await new Promise((resolve, reject) => {
      const request = database.transaction('studioProjects').objectStore('studioProjects').get('alternative-song');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(song).toEqual({ id: 'alternative-song', title: 'Keep this song', tracks: ['unchanged'] });
    original.close();
  });

  test('uses the reserved Studio store through the typed collection', async () => {
    const store = new IdbStore('chatter-studio-project-persistence'); await store.open();
    const saved = await store.studioProjects.create({ storyId: 'story', project: { id: 'song', name: 'Theme', bpm: 112, tracks: [] } });
    store.close();
    const reopened = new IdbStore('chatter-studio-project-persistence'); await reopened.open();
    expect(await reopened.studioProjects.get(saved.id)).toMatchObject({ storyId: 'story', project: { name: 'Theme', bpm: 112 } });
    reopened.close();
  });
});
