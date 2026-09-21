import { describe, expect, test } from 'vitest';
import { PODCAST_FORMATS, canReleasePodcast, checkPodcastEpisode, createPodcastProject, createPodcastShow, effectivePodcastArtworkId, makePodcastClip, makePodcastSegment, podcastClipDuration, podcastDuration, podcastProblems, podcastShowNotes, releasePodcast, segmentChapters, splitPodcastClip } from './podcast.js';
import { MemoryStore } from './store-memory.js';
import { saveDeliverable } from './deliverables.js';
import { checkReviewItem, finishReview, REVIEW_CHECKS } from './newsroom.js';

describe('Chatterbox podcast projects', () => {
  test('starts with an episode-shaped roundup and professional track roles', () => {
    const show = createPodcastShow(); const project = createPodcastProject(show);
    expect(show.title).toBe('Chatterbox Podcast');
    expect(project.segments.map((item) => item.kind)).toEqual(['COLD_OPEN', 'INTRO', 'STORY', 'BREAK', 'STORY', 'CREDITS']);
    expect(project.tracks.map((item) => item.name)).toEqual(['Host', 'Guest', 'Tape', 'Music', 'Sounds', 'Room']);
    expect(project.targetLufs).toBe(-16);
  });

  test('offers five distinct editorial formats with purpose and useful pacing', () => {
    expect(PODCAST_FORMATS.map((format) => format.id)).toEqual(['NEWS_ROUNDTABLE', 'ONE_QUESTION', 'FIELD_NOTES', 'FACT_BREAK_DEBATE', 'CULTURE_REVIEW']);
    expect(new Set(PODCAST_FORMATS.map((format) => format.segments.map((segment) => segment.kind).join('>'))).size).toBe(5);
    for (const format of PODCAST_FORMATS) {
      expect(format.promise.length).toBeGreaterThan(20);
      expect(format.segments.every((segment) => segment.purpose.length > 12 && segment.targetSec >= 10)).toBe(true);
      const project = createPodcastProject(createPodcastShow(), { template: format.id });
      expect(project.formatId).toBe(format.id);
      expect(project.segments.map((segment) => segment.purpose)).toEqual(format.segments.map((segment) => segment.purpose));
    }
  });

  test('uses the show cover until an episode chooses its own and remembers that override', () => {
    const show = createPodcastShow(); show.coverAssetId = 'show-art';
    const project = createPodcastProject(show); project.artworkAssetId = 'episode-art';
    expect(effectivePodcastArtworkId(project, show)).toBe('episode-art');
    project.artworkMode = 'SHOW';
    expect(effectivePodcastArtworkId(project, show)).toBe('show-art');
    project.artworkMode = 'EPISODE';
    expect(effectivePodcastArtworkId(project, show)).toBe('episode-art');
  });

  test('finds the exact episode craft problems before packaging', () => {
    const show = createPodcastShow(); const project = createPodcastProject(show, { template: 'ONE_QUESTION' });
    project.description = ''; project.segments = project.segments.filter((segment) => segment.kind !== 'INTRO' && segment.kind !== 'CREDITS');
    const host = project.tracks.find((track) => track.name === 'Host')!; const guest = project.tracks.find((track) => track.name === 'Guest')!; const music = project.tracks.find((track) => track.kind === 'MUSIC')!;
    host.volumeDb = 4; guest.volumeDb = -5;
    project.clips = [
      makePodcastClip({ assetId: 'host-a', trackId: host.id, name: 'Host open', durationSec: 4 }),
      makePodcastClip({ assetId: 'guest-a', trackId: guest.id, name: 'Guest answer', durationSec: 4, startSec: 9 }),
      makePodcastClip({ assetId: 'music-a', trackId: music.id, name: 'Theme', durationSec: 2, startSec: 13 }),
    ];
    expect(checkPodcastEpisode(project, show).map((finding) => finding.code)).toEqual(expect.arrayContaining(['missing-intro', 'missing-outro', 'dead-air', 'uneven-voices', 'music-rights', 'missing-description', 'missing-cover']));
  });

  test('measures and splits non-destructive clips', () => {
    const show = createPodcastShow(); const project = createPodcastProject(show); const trackId = project.tracks[0]!.id;
    const clip = makePodcastClip({ assetId: 'voice', trackId, name: 'Host', durationSec: 20, startSec: 5 });
    clip.reduceWhenQuiet = true;
    clip.omittedRanges = [{ start: 4, end: 6 }];
    expect(podcastClipDuration(clip)).toBe(18); expect(podcastDuration({ clips: [clip] })).toBe(23);
    const parts = splitPodcastClip(clip, 15)!;
    expect(parts.every(part => part.reduceWhenQuiet)).toBe(true);
    expect(parts[0].trimOutSec).toBe(10); expect(parts[1].trimInSec).toBe(10); expect(parts[1].startSec).toBe(15);
  });

  test('turns the rundown into chapters and show notes', () => {
    const show = createPodcastShow(); const project = createPodcastProject(show); project.title = 'Hallway Edition'; project.description = 'What changed this week.';
    project.segments = [makePodcastSegment('INTRO', { title: 'Welcome' }), makePodcastSegment('STORY', { title: 'New library' })];
    project.segments[0]!.targetSec = 30; project.chapters = segmentChapters(project.segments);
    const notes = podcastShowNotes(project, show, []);
    expect(project.chapters.map((item) => item.atSec)).toEqual([0, 30]);
    expect(notes).toContain('00:30 New library');
  });

  test('reports only unfinished packaging work', () => {
    const show = createPodcastShow(); const project = createPodcastProject(show);
    expect(podcastProblems(project)).toEqual(expect.arrayContaining(['Place some audio in the cut.', 'Write the episode description.', 'Make chapter markers from the rundown.']));
    project.description = 'Ready'; project.chapters = segmentChapters(project.segments); project.clips = [makePodcastClip({ assetId: 'voice', trackId: project.tracks[0]!.id, name: 'Host', durationSec: 3 })];
    expect(podcastProblems(project)).toEqual([]);
  });

  test('releases a reviewed standalone episode and freezes its listening record', async () => {
    const store = new MemoryStore(); const story = await store.stories.create({ title: 'Library update', creationRecipeId: 'podcast', channels: ['pod'], workflowStepId: 'check', body: { type: 'doc', content: [] } }); const showDraft = createPodcastShow(); showDraft.coverAssetId = 'cover'; const { id: _sid, createdAt: _sc, updatedAt: _su, ...showInput } = showDraft; const show = await store.podcastShows.create(showInput); const projectDraft = createPodcastProject(show); projectDraft.description = 'A complete episode.'; projectDraft.storyIds = [story.id]; projectDraft.chapters = segmentChapters(projectDraft.segments); projectDraft.clips = [makePodcastClip({ assetId: 'voice', trackId: projectDraft.tracks[0]!.id, name: 'Host', durationSec: 3 })]; projectDraft.state = 'REVIEW'; const { id: _pid, createdAt: _pc, updatedAt: _pu, ...projectInput } = projectDraft; const project = await store.podcastProjects.create(projectInput); await saveDeliverable(store, { bytes: new Uint8Array([1, 2]), title: 'Master', fileName: 'master.wav', kind: 'AUDIO', room: 'CHATTERBOX', stage: 'REVIEW', mime: 'audio/wav', storyId: story.id, sourceProjectId: project.id });
    for (const check of REVIEW_CHECKS) await checkReviewItem(store, story.id, check.id, true, 'editor');
    await finishReview(store, story.id, 'editor');
    expect((await canReleasePodcast(store, project.id)).ok).toBe(true);
    await store.stories.update(story.id, { title: 'Library update — revised' });
    expect(await canReleasePodcast(store, project.id)).toMatchObject({ ok: false, problems: expect.arrayContaining([expect.stringMatching(/current|review/i)]) });
    for (const check of REVIEW_CHECKS) await checkReviewItem(store, story.id, check.id, true, 'editor');
    await finishReview(store, story.id, 'editor');
    await expect(releasePodcast(store, project.id, 'advisor', undefined as any)).rejects.toThrow(/receipt/i);
    const receipt = { destinations: [{ platform: 'Podcast host', url: 'https://listen.example/chatterbox/library-update' }], publishedAt: 1_800_000_000_000, note: 'Uploaded from the adviser account.' };
    const result = await releasePodcast(store, project.id, 'advisor', receipt);
    expect(await store.episodes.get(result.episodeId)).toMatchObject({ channel: 'podcast', podcastProjectId: project.id, description: 'A complete episode.', artworkAssetId: 'cover', receipt: { ...receipt, adviserId: 'advisor' } });
    expect(await store.podcastProjects.get(project.id)).toMatchObject({ state: 'FINAL' });
    expect(await store.stories.get(story.id)).toMatchObject({ status: 'DONE', workflowStepId: 'out' });
  });
});
