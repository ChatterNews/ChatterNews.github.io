import { describe, expect, test } from 'vitest';
import { withVideoEndCredits, addAudioClip, addTrack, createMotionPackage, makeVideoGraphic, createPodcastProject, createPodcastShow, createShowtimeProject, DEFAULT_GATE_CONFIG, DEFAULT_SAMPLER_SETTINGS, emptyProject, Gate, makePodcastClip, makeShowtimeClip, MemoryStore, saveDeliverable } from '@chatter/shared';
import { exportPortableStory, importPortableStory, isPortableStoryProject, portableFileName } from './portable-project.js';
import { element } from '../rooms/blast-model.js';

const classifier = { ready: true, async classify() { return 0; } };

describe('portable USB story projects', () => {
  test('recognizes only the current Chatter story format', () => {
    expect(isPortableStoryProject({ format: 'chatter-story', version: 1, projectId: 'p', story: {}, assets: [], takes: [] })).toBe(true);
    expect(isPortableStoryProject({ format: 'chatter-story', version: 99, projectId: 'p', story: {}, assets: [], takes: [] })).toBe(false);
    expect(portableFileName({ slug: 'gym-floor' })).toBe('gym-floor.chatter');
  });

  test('moves the story, media and handoffs without exporting a legal name', async () => {
    const first = new MemoryStore('computer-one'); await first.open();
    const gate = new Gate(first, DEFAULT_GATE_CONFIG, classifier);
    const kid = await first.users.create({ name: 'Alexandra Student', penName: 'Alex S.', role: 'STUDENT', active: true });
    const story = await first.stories.create({ title: 'Gym floor', status: 'WORK', ownerId: kid.id, bylineIds: [kid.id], channels: ['pod'], body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The gym floor reopens Friday.' }] }] } });
    const ingested = await gate.ingest({ source: 'recording', bytes: new Uint8Array([1, 2, 3, 4]), meta: { kind: 'AUDIO', mime: 'audio/webm', origin: 'RECORDING', storyId: story.id } });
    const picture = await gate.ingest({ source: 'upload', bytes: new Uint8Array([9, 8, 7]), meta: { kind: 'IMAGE', mime: 'image/png', origin: 'UPLOAD', storyId: story.id } });
    const footage = await gate.ingest({ source: 'recording', bytes: new Uint8Array([4, 5, 6, 7, 8]), meta: { kind: 'VIDEO', mime: 'video/webm', origin: 'RECORDING', storyId: story.id } });
    const take = await first.takes.create({ storyId: story.id, userId: kid.id, assetId: ingested.assetId!, durationSec: 12, name: 'Clean take' });
    await first.transcripts.create({ assetId: ingested.assetId!, text: 'The gym floor reopens Friday.', segments: [] });
    await first.crewTasks.create({ storyId: story.id, role: 'voice', assigneeId: kid.id, state: 'DONE', completedSteps: ['rehearse', 'levels', 'take'], handoffNote: 'Use the clean take.' });
    await first.blasts.create({ title: 'Gym front page', authorId: kid.id, storyId: story.id, format: 'LETTER_PORTRAIT', width: 816, height: 1056, pages: [{ id: 'page-one', name: 'Front', background: '#ffffff', elements: [element({ kind: 'IMAGE', x: 10, y: 10, width: 300, height: 200, imageAssetId: picture.assetId })] }] });
    const showtimeDraft = createShowtimeProject({ title: 'Gym floor video', authorId: kid.id, storyId: story.id });
    const { id: _showtimeId, createdAt: _showtimeCreated, updatedAt: _showtimeUpdated, ...showtimeInput } = showtimeDraft;
    showtimeInput.clips = [makeShowtimeClip({ assetId: footage.assetId!, name: 'Opening shot', durationSec: 8 })];
    const graphics = createMotionPackage('bulletin', { title: 'Gym title' });
    graphics.scenes[0]!.elements[0]!.imageAssetId = picture.assetId;
    showtimeInput.titles = [makeVideoGraphic(graphics, graphics.scenes[0]!.id, 1)];
    showtimeInput.credits = 'Alex S. — Reporting and editing';
    const withCredits = withVideoEndCredits({ ...showtimeDraft, ...showtimeInput });
    showtimeInput.titles = withCredits.titles;
    await first.showtimeProjects.create(showtimeInput);
    const podcastShowDraft = createPodcastShow({ authorId: kid.id }); const { id: _podcastShowId, createdAt: _podcastShowCreated, updatedAt: _podcastShowUpdated, ...podcastShowInput } = podcastShowDraft; const podcastShow = await first.podcastShows.create(podcastShowInput);
    const podcastDraft = createPodcastProject(podcastShow, { authorId: kid.id }); podcastDraft.title = 'Gym floor episode'; podcastDraft.voiceReductionBypassed = true; podcastDraft.storyIds = [story.id]; podcastDraft.clips = [{ ...makePodcastClip({ assetId: ingested.assetId!, trackId: podcastDraft.tracks[0]!.id, name: 'Host tape', durationSec: 12 }), syncCueSec: 2.35, startSec: 1.4, reduceWhenQuiet: true }]; const { id: _podcastId, createdAt: _podcastCreated, updatedAt: _podcastUpdated, ...podcastInput } = podcastDraft; await first.podcastProjects.create(podcastInput);
    await first.samplerPresets.create({ storyId: story.id, name: 'Gym thump sampler', sampleName: 'gym-thump.webm', sourceAssetId: ingested.assetId!, settings: { ...DEFAULT_SAMPLER_SETTINGS, layout: 'SLICE', slicePoints: [0, .4, 1] }, durationSec: 12, transientPoints: [0, .4, 1] });
    await saveDeliverable(first, { bytes: new TextEncoder().encode('Gym floor\n\nThe gym floor reopens Friday.'), title: 'Gym floor · writing copy', fileName: 'gym-floor-writing.txt', kind: 'DOCUMENT', room: 'DESK', stage: 'WORKING', mime: 'text/plain', storyId: story.id, authorId: kid.id });
    await first.episodes.create({
      title: 'Gym floor', publishedAt: 100, channel: 'web', storyIds: [story.id],
      receipt: { destinations: [{ platform: 'School website', url: 'https://school.example/news/gym-floor' }], publishedAt: 100, adviserId: kid.id, note: 'Morning post' },
      stories: [{ storyId: story.id, title: story.title, slug: story.slug, channels: story.channels, body: story.body, readTimeSec: story.readTimeSec, bylines: [kid.penName] }],
      reflections: { [`story:${story.id}`]: { worked: 'The opening was clear.', audience: 'Families asked about practice times.', change: 'Add the schedule next time.', authorId: kid.id, updatedAt: 101 } },
    });
    await first.stories.update(story.id, { selectedTakeId: take.id, creationRecipeId: 'podcast', workflowStepId: 'export' });

    const exported = await exportPortableStory(first, (await first.stories.get(story.id))!);
    expect(JSON.stringify(exported.project)).not.toContain('Alexandra Student');

    const second = new MemoryStore('computer-two'); await second.open();
    const imported = await importPortableStory(second, new Gate(second, DEFAULT_GATE_CONFIG, classifier), new File([exported.blob], exported.fileName));
    expect(imported.story).toMatchObject({ title: 'Gym floor', status: 'WORK', portableId: story.id, creationRecipeId: 'podcast', workflowStepId: 'export' });
    expect(imported.mediaCount).toBe(3);
    expect((await second.users.list())[0]).toMatchObject({ name: 'Alex S.', penName: 'Alex S.' });
    expect((await second.takes.list())[0]).toMatchObject({ storyId: imported.story.id, durationSec: 12, name: 'Clean take' });
    expect((await second.transcripts.list())[0]!.text).toContain('reopens Friday');
    expect((await second.crewTasks.list())[0]!.handoffNote).toBe('Use the clean take.');
    expect((await second.stories.get(imported.story.id))!.selectedTakeId).toBe((await second.takes.list())[0]!.id);
    const blast = (await second.blasts.list())[0]!;
    expect(blast).toMatchObject({ title: 'Gym front page', storyId: imported.story.id });
    expect(blast.pages[0]!.elements[0]!.imageAssetId).toBeTruthy();
    const showtime = (await second.showtimeProjects.list())[0]!;
    expect(showtime).toMatchObject({ title: 'Gym floor video', storyId: imported.story.id, authorId: (await second.users.list())[0]!.id });
    expect(showtime.credits).toBe('Alex S. — Reporting and editing');
    expect(showtime.titles.at(-1)!.projectCredits).toBe(showtime.credits);
    expect(showtime.clips[0]).toMatchObject({ name: 'Opening shot' });
    expect(showtime.clips[0]!.assetId).not.toBe(footage.assetId);
    const graphicImage = showtime.titles[0]!.motion!.scenes[0]!.elements[0]!.imageAssetId!;
    expect(graphicImage).not.toBe(picture.assetId);
    expect(await second.assets.get(graphicImage)).toMatchObject({ kind: 'IMAGE' });
    expect(showtime.titles[0]).toMatchObject({ startSec: 1, motion: { title: 'Gym title' } });
    const podcast = (await second.podcastProjects.list())[0]!;
    expect(podcast).toMatchObject({ voiceReductionBypassed: true, title: 'Gym floor episode', storyIds: [imported.story.id], authorId: (await second.users.list())[0]!.id });
    expect(podcast.clips[0]!.assetId).not.toBe(ingested.assetId);
    expect(podcast.clips[0]).toMatchObject({ syncCueSec: 2.35, startSec: 1.4, reduceWhenQuiet: true });
    expect(await second.assets.get(podcast.clips[0]!.assetId)).toMatchObject({ gateStatus: 'QUARANTINED' });
    const sampler = (await second.samplerPresets.list())[0]!;
    expect(sampler).toMatchObject({ storyId: imported.story.id, name: 'Gym thump sampler', settings: { layout: 'SLICE' } });
    expect(sampler.sourceAssetId).not.toBe(ingested.assetId);
    const importedEpisode = (await second.episodes.list())[0]!;
    expect(importedEpisode.receipt).toMatchObject({ destinations: [{ platform: 'School website', url: 'https://school.example/news/gym-floor' }], adviserId: (await second.users.list())[0]!.id });
    expect(importedEpisode.reflections?.[`story:${imported.story.id}`]).toMatchObject({ change: 'Add the schedule next time.', authorId: (await second.users.list())[0]!.id });
    expect(importedEpisode.reflections?.[`story:${story.id}`]).toBeUndefined();
    const output = (await second.deliverables.list())[0]!;
    expect(output).toMatchObject({ fileName: 'gym-floor-writing.txt', storyId: imported.story.id, authorId: (await second.users.list())[0]!.id });
    expect(new TextDecoder().decode(await second.blobs.get(output.blobHash))).toContain('reopens Friday');
  });

  test('moves a story-linked editable Studio song and remaps every audio reference', async () => {
    const first = new MemoryStore('studio-portable-one'); await first.open();
    const gate = new Gate(first, DEFAULT_GATE_CONFIG, classifier);
    const story = await first.stories.create({ title: 'Portable song' });
    const audio = await gate.ingest({ source: 'recording', ownDevice: true, bytes: new Uint8Array([4, 2]), meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'RECORDING', storyId: story.id } });
    let song = addTrack(emptyProject('Theme'), 'Voice', 'runtime-track');
    song = addAudioClip(song, song.tracks[0]!.id, { engineId: 'runtime-clip', name: 'Lead', source: 'RECORDING', sourceAssetId: audio.assetId!, startSec: 0, sourceDurationSec: 2 });
    await first.studioProjects.create({ storyId: story.id, project: song });

    const exported = await exportPortableStory(first, story);
    expect(exported.project.version).toBe(7);
    expect(exported.project.studioProjects).toHaveLength(1);

    const second = new MemoryStore('studio-portable-two'); await second.open();
    const imported = await importPortableStory(second, new Gate(second, DEFAULT_GATE_CONFIG, classifier), new File([exported.blob], exported.fileName));
    const restored = (await second.studioProjects.list())[0]!;
    expect(restored.storyId).toBe(imported.story.id);
    expect(restored.project.name).toBe('Theme');
    expect(restored.project.tracks[0]!.clips[0]!.sourceAssetId).not.toBe(audio.assetId);
    expect(await second.assets.get(restored.project.tracks[0]!.clips[0]!.sourceAssetId!)).toMatchObject({ gateStatus: 'QUARANTINED' });
  });

  test.each([
    ['poster', ['social'], 'report'],
    ['video', ['video'], 'cut'],
    ['article', ['web'], 'export'],
  ] as const)('keeps an explicit %s route at %s when the USB story changes computers', async (creationRecipeId, channels, workflowStepId) => {
    const first = new MemoryStore(`portable-${creationRecipeId}-one`); await first.open();
    const story = await first.stories.create({ title: `${creationRecipeId} route`, creationRecipeId, channels: [...channels], workflowStepId });
    const exported = await exportPortableStory(first, story);
    const second = new MemoryStore(`portable-${creationRecipeId}-two`); await second.open();
    const imported = await importPortableStory(second, new Gate(second, DEFAULT_GATE_CONFIG, classifier), new File([exported.blob], exported.fileName));
    expect(imported.story).toMatchObject({ creationRecipeId, workflowStepId });
  });
});

test('a story moves its pinned Foley version, frozen credits, and editable original bytes', async () => {
  const { makeSoundProject, emptySoundAttribution } = await import('@chatter/shared');
  const { saveSoundProject, saveSoundVersion } = await import('../audio/sound-repository.js');
  const { encodeTakeWav } = await import('../audio/take-audio.js');
  const first = new MemoryStore(); const gate = new Gate(first, DEFAULT_GATE_CONFIG, classifier);
  const story = await first.stories.create({ title: 'Sound story' });
  const original = encodeTakeWav({ channels: [new Float32Array([0, .1, .3, 0])], duration: .0005, sampleRate: 8000 });
  const source = await gate.ingest({ bytes: original, source: 'recording', ownDevice: true, meta: { kind: 'AUDIO', origin: 'RECORDING', mime: 'audio/wav' } });
  const library = await first.soundItems.create({ assetId: source.assetId!, name: 'Keys', attribution: { ...emptySoundAttribution(), creator: 'Sam', license: 'CC BY 4.0' }, tags: [], collectionIds: [], favorite: false, archived: false, duration: .0005, peaks: [] });
  const p = makeSoundProject('Keys cue', story.id); p.credits = 'Sam: recording'; p.clips = [{ id: 'sound-clip', name: 'Keys', trackId: p.tracks[0]!.id, assetId: source.assetId!, libraryItemId: library.id, start: 0, sourceIn: 0, sourceOut: .0005, rate: 1, repeats: 1, gainDb: 0, fadeIn: 0, fadeOut: 0 }];
  const saved = await saveSoundProject(first, p, 0);
  const rendered = encodeTakeWav({ channels: [new Float32Array([0, .2, .4, 0])], duration: .0005, sampleRate: 8000 });
  const item = await saveSoundVersion(first, gate, saved, { bytes: rendered, duration: .0005, peaks: [], peak: .4 });
  const video = createShowtimeProject({ title: 'News', storyId: story.id }); video.clips = [{ ...makeShowtimeClip({ assetId: item.assetId, name: item.name, durationSec: .0005 }), soundProjectId: saved.id, soundRevisionId: item.revisionId, soundItemId: item.id }]; await first.showtimeProjects.create(video);
  const exported = await exportPortableStory(first, story); const second = new MemoryStore(); await importPortableStory(second, new Gate(second, DEFAULT_GATE_CONFIG, classifier), new File([exported.blob], 'story.chatter'));
  const clip = (await second.showtimeProjects.list())[0]!.clips[0]!; const revision = await second.soundRevisions.get(clip.soundRevisionId!);
  expect(revision?.projectId).toBe(clip.soundProjectId); expect(revision?.assetId).toBe(clip.assetId); expect(revision?.snapshot.credits).toBe('Sam: recording');
  const originalAsset = await second.assets.get(revision!.snapshot.clips[0]!.assetId!); expect(await second.blobs.get(originalAsset!.sha256)).toEqual(original);
  expect(revision!.attribution.some(a => a.creator === 'Sam')).toBe(true); expect(originalAsset?.gateStatus).toBe('QUARANTINED');
  const { default: JSZip } = await import('jszip'); const damaged = await JSZip.loadAsync(await exported.blob.arrayBuffer());
  const manifest = JSON.parse(await damaged.file('story.chatter.json')!.async('string')); delete manifest.soundPack; damaged.file('story.chatter.json', JSON.stringify(manifest));
  const missing = new MemoryStore();
  await expect(importPortableStory(missing, new Gate(missing, DEFAULT_GATE_CONFIG, classifier), new File([await damaged.generateAsync({ type: 'blob' })], 'missing.chatter'))).rejects.toThrow('editable sound attachment');
  expect(await missing.showtimeProjects.list()).toHaveLength(0);
  manifest.soundPack = 'sounds.soundpack'; manifest.showtimeProjects[0].clips[0].soundRevisionId = 'unknown-revision'; damaged.file('story.chatter.json', JSON.stringify(manifest));
  await expect(importPortableStory(missing, new Gate(missing, DEFAULT_GATE_CONFIG, classifier), new File([await damaged.generateAsync({ type: 'blob' })], 'wrong.chatter'))).rejects.toThrow('editable sound attachment');

});
