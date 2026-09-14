import { newId } from './ids.js';
import type {
  PodcastChapter, PodcastClip, PodcastEpisodeType, PodcastProject, PodcastSegment,
  PodcastFormatId, PodcastSegmentKind, PodcastShow, PodcastTrack, PodcastVoicePreset, Story,
  PublishingReceiptInput,
} from './types.js';
import type { Store } from './store.js';
import { canPublish } from './publish.js';
import { publishingReceipt } from './publishing-receipt.js';
import { reviewMediaKey, reviewProgress } from './newsroom.js';

export const PODCAST_SEGMENT_KINDS: Array<{ kind: PodcastSegmentKind; label: string; hint: string; color: string; targetSec: number }> = [
  { kind: 'COLD_OPEN', label: 'Cold open', hint: 'A strong moment before the welcome.', color: '#ff7d68', targetSec: 20 },
  { kind: 'INTRO', label: 'Welcome', hint: 'Name the show and tell listeners what is coming.', color: '#ffd21e', targetSec: 35 },
  { kind: 'STORY', label: 'News story', hint: 'A reported Chatter story with tape and narration.', color: '#65d6ce', targetSec: 180 },
  { kind: 'INTERVIEW', label: 'Interview', hint: 'A conversation or selected question-and-answer.', color: '#b8a0ff', targetSec: 240 },
  { kind: 'BREAK', label: 'Break', hint: 'A reset, transition, station ID, or music moment.', color: '#ff9bd2', targetSec: 20 },
  { kind: 'CREDITS', label: 'Credits', hint: 'Thank the crew, sources, and music makers.', color: '#84d987', targetSec: 35 },
  { kind: 'CUSTOM', label: 'Open card', hint: 'Build a segment that does not fit the presets.', color: '#f0a45d', targetSec: 60 },
];

export const PODCAST_VOICE_PRESETS: Record<PodcastVoicePreset, { label: string; hint: string }> = {
  NATURAL: { label: 'Natural', hint: 'Only the level changes.' },
  CLEAN: { label: 'Clean up', hint: 'Cuts rumble and steadies uneven speech.' },
  WARM: { label: 'Warm radio', hint: 'Adds body and close-mic weight.' },
  BRIGHT: { label: 'Clearer words', hint: 'Brings consonants forward.' },
  CLOSE: { label: 'Close & quiet', hint: 'Tames room sound and pulls the voice nearer.' },
  CHARACTER: { label: 'Character', hint: 'A narrow, playful broadcast sound.' },
};

export interface PodcastFormat {
  id: PodcastFormatId;
  title: string;
  promise: string;
  bestFor: string;
  hosts: string;
  segments: Array<{ kind: PodcastSegmentKind; title: string; purpose: string; targetSec: number }>;
}

export const PODCAST_FORMATS: PodcastFormat[] = [
  { id: 'NEWS_ROUNDTABLE', title: 'Two-host news roundtable', promise: 'Two hosts trade the week’s strongest stories, then stop to explain why each one matters.', bestFor: 'A lively school-news episode with several stories', hosts: 'Two hosts', segments: [
    { kind: 'COLD_OPEN', title: 'Best moment first', purpose: 'Open on the sharpest quote, reaction, or surprising fact.', targetSec: 20 },
    { kind: 'INTRO', title: 'Welcome and headlines', purpose: 'Name the show, the hosts, and the stories listeners will hear.', targetSec: 40 },
    { kind: 'STORY', title: 'Lead story', purpose: 'Report the most important update with tape, facts, and context.', targetSec: 150 },
    { kind: 'BREAK', title: 'Reset', purpose: 'Use a brief station ID, music sting, or host handoff.', targetSec: 20 },
    { kind: 'STORY', title: 'Second story', purpose: 'Change the pace with another useful or surprising school story.', targetSec: 120 },
    { kind: 'CREDITS', title: 'Credits and next time', purpose: 'Credit the crew and sources, then tell listeners what comes next.', targetSec: 35 },
  ] },
  { id: 'ONE_QUESTION', title: 'One-question interview', promise: 'Build the whole episode around one question that is narrow enough to answer and big enough to matter.', bestFor: 'A student, teacher, artist, coach, or community guest', hosts: 'One host and one guest', segments: [
    { kind: 'COLD_OPEN', title: 'Answer teaser', purpose: 'Start with one compelling piece of the guest’s answer.', targetSec: 15 },
    { kind: 'INTRO', title: 'Set up the question', purpose: 'Introduce the guest and explain why this question matters now.', targetSec: 35 },
    { kind: 'INTERVIEW', title: 'The one question', purpose: 'Ask the central question, listen closely, and follow the strongest thread.', targetSec: 360 },
    { kind: 'BREAK', title: 'Host takeaway', purpose: 'Pause to restate the clearest fact or idea in plain language.', targetSec: 25 },
    { kind: 'CUSTOM', title: 'Last word', purpose: 'Give the guest one final chance to add what listeners should remember.', targetSec: 50 },
    { kind: 'CREDITS', title: 'Credits', purpose: 'Thank the guest and name everyone who made the episode.', targetSec: 30 },
  ] },
  { id: 'FIELD_NOTES', title: 'Field-note documentary', promise: 'Let listeners enter a place through scenes, natural sound, reporting, and carefully chosen voices.', bestFor: 'Events, labs, performances, trips, and behind-the-scenes reporting', hosts: 'Narrator with field tape', segments: [
    { kind: 'COLD_OPEN', title: 'Drop into the scene', purpose: 'Begin with natural sound and one detail that places the listener there.', targetSec: 25 },
    { kind: 'INTRO', title: 'Where we are', purpose: 'Name the place, the people, and the question guiding the visit.', targetSec: 30 },
    { kind: 'STORY', title: 'Scene one', purpose: 'Combine observation, a voice from the scene, and one verified detail.', targetSec: 140 },
    { kind: 'BREAK', title: 'Sound bridge', purpose: 'Let a real sound carry the listener into the next place or moment.', targetSec: 20 },
    { kind: 'STORY', title: 'Scene two', purpose: 'Show what changed by moving to a second person, place, or moment.', targetSec: 170 },
    { kind: 'CUSTOM', title: 'What it means', purpose: 'Connect the scenes and answer the question from the introduction.', targetSec: 70 },
    { kind: 'CREDITS', title: 'Field credits', purpose: 'Credit voices, locations, music, and the reporting crew.', targetSec: 35 },
  ] },
  { id: 'FACT_BREAK_DEBATE', title: 'Debate with fact breaks', promise: 'Give two positions room to breathe while a reporter pauses the conversation to check what can be proved.', bestFor: 'School choices, rules, proposals, and questions with real disagreement', hosts: 'Moderator and two viewpoints', segments: [
    { kind: 'INTRO', title: 'The question and rules', purpose: 'State the exact question, introduce the speakers, and set fair ground rules.', targetSec: 45 },
    { kind: 'INTERVIEW', title: 'Viewpoint one', purpose: 'Let the first speaker make one clear claim and support it.', targetSec: 120 },
    { kind: 'BREAK', title: 'Fact break one', purpose: 'Pause to verify the claim and separate evidence from opinion.', targetSec: 35 },
    { kind: 'INTERVIEW', title: 'Viewpoint two', purpose: 'Let the second speaker answer the same question with evidence.', targetSec: 120 },
    { kind: 'BREAK', title: 'Fact break two', purpose: 'Check the second claim with the same standard used for the first.', targetSec: 35 },
    { kind: 'CUSTOM', title: 'Common ground', purpose: 'Name what both sides agree on and what remains unsettled.', targetSec: 75 },
    { kind: 'CREDITS', title: 'Sources and credits', purpose: 'Name the evidence, speakers, moderator, and production crew.', targetSec: 40 },
  ] },
  { id: 'CULTURE_REVIEW', title: 'Culture review', promise: 'Review a book, game, performance, exhibit, song, or school event with examples instead of empty ratings.', bestFor: 'Arts, entertainment, games, books, and student culture', hosts: 'One to three reviewers', segments: [
    { kind: 'COLD_OPEN', title: 'The strongest reaction', purpose: 'Open on the funniest, sharpest, or most revealing review moment.', targetSec: 15 },
    { kind: 'INTRO', title: 'What we reviewed', purpose: 'Name the work or event and explain what kind of experience it promises.', targetSec: 35 },
    { kind: 'CUSTOM', title: 'The evidence', purpose: 'Describe specific moments, choices, or details without spoiling everything.', targetSec: 100 },
    { kind: 'INTERVIEW', title: 'Review table', purpose: 'Let reviewers compare reactions and challenge each other with examples.', targetSec: 190 },
    { kind: 'BREAK', title: 'Quick context', purpose: 'Add a short creator, genre, or school-community fact that helps listeners.', targetSec: 25 },
    { kind: 'CUSTOM', title: 'Who it is for', purpose: 'Give a useful recommendation and explain which audience will enjoy it.', targetSec: 75 },
    { kind: 'CREDITS', title: 'Credits', purpose: 'Credit clips, music, creators, and the episode crew.', targetSec: 30 },
  ] },
];

export function createPodcastShow(input: { title?: string; description?: string; authorId?: string } = {}): PodcastShow {
  const now = Date.now();
  return {
    id: newId(), createdAt: now, updatedAt: now,
    title: input.title ?? 'Chatterbox Podcast',
    description: input.description ?? 'Stories, voices, and sounds from the Chatter News crew.',
    hostIds: [], defaultVoicePreset: 'CLEAN', nextEpisodeNumber: 1,
    ...(input.authorId ? { authorId: input.authorId } : {}),
  };
}

function track(name: string, kind: PodcastTrack['kind'], color: string, input: Partial<PodcastTrack> = {}): PodcastTrack {
  return { id: newId(), name, kind, color, volumeDb: 0, pan: 0, muted: false, solo: false, voicePreset: kind === 'VOICE' ? 'CLEAN' : 'NATURAL', effectAmount: kind === 'VOICE' ? .55 : 0, duckUnderVoice: kind === 'MUSIC' || kind === 'AMBIENCE', ...input };
}

export function defaultPodcastTracks(): PodcastTrack[] {
  return [track('Host', 'VOICE', '#ffd21e'), track('Guest', 'VOICE', '#b8a0ff'), track('Tape', 'VOICE', '#65d6ce'), track('Music', 'MUSIC', '#ff9bd2', { volumeDb: -12 }), track('Sounds', 'SFX', '#ff9a60', { volumeDb: -4 }), track('Room', 'AMBIENCE', '#84d987', { volumeDb: -18 })];
}

export function makePodcastSegment(kind: PodcastSegmentKind, input: { title?: string; story?: Story } = {}): PodcastSegment {
  const preset = PODCAST_SEGMENT_KINDS.find((item) => item.kind === kind)!;
  const story = input.story;
  return {
    id: newId(), kind, title: input.title ?? story?.title ?? preset.label,
    ...(story ? { storyId: story.id } : {}),
    script: story ? '' : '', notes: '', targetSec: story?.durationSec ?? preset.targetSec, color: preset.color,
  };
}

type PodcastTemplate = PodcastFormatId | 'ROUNDUP' | 'INTERVIEW' | 'DOCUMENTARY' | 'CONVERSATION' | 'TRAILER';

function podcastFormatId(template: PodcastTemplate): PodcastFormatId {
  if (template === 'INTERVIEW') return 'ONE_QUESTION';
  if (template === 'DOCUMENTARY') return 'FIELD_NOTES';
  if (template === 'CONVERSATION') return 'CULTURE_REVIEW';
  return template === 'ROUNDUP' || template === 'TRAILER' ? 'NEWS_ROUNDTABLE' : template;
}

export function createPodcastProject(show: PodcastShow, input: { title?: string; authorId?: string; template?: PodcastTemplate } = {}): PodcastProject {
  const now = Date.now(); const template = input.template ?? 'NEWS_ROUNDTABLE'; const formatId = podcastFormatId(template); const format = PODCAST_FORMATS.find((item) => item.id === formatId)!;
  const specs = template === 'TRAILER' ? [
    { kind: 'COLD_OPEN' as const, title: 'Best moment first', purpose: 'Open with the moment that makes someone want the full show.', targetSec: 15 },
    { kind: 'INTRO' as const, title: 'Meet Chatterbox', purpose: 'Name the show and the kinds of stories listeners will hear.', targetSec: 35 },
    { kind: 'CREDITS' as const, title: 'Listen next', purpose: 'Tell listeners where the first full episode will appear.', targetSec: 20 },
  ] : format.segments;
  const episodeType: PodcastEpisodeType = template === 'TRAILER' ? 'TRAILER' : 'FULL';
  return {
    id: newId(), createdAt: now, updatedAt: now,
    title: input.title ?? `Episode ${show.nextEpisodeNumber}`,
    description: '', showId: show.id, storyIds: [], episodeNumber: show.nextEpisodeNumber,
    episodeType, explicit: false, state: 'DRAFT', formatId,
    segments: specs.map((spec) => ({ ...makePodcastSegment(spec.kind, { title: spec.title }), purpose: spec.purpose, targetSec: spec.targetSec })), tracks: defaultPodcastTracks(), clips: [], chapters: [],
    targetLufs: -16, truePeakDb: -1,
    ...(input.authorId ? { authorId: input.authorId } : {}),
  };
}

export function effectivePodcastArtworkId(project: Pick<PodcastProject, 'artworkAssetId' | 'artworkMode'>, show: Pick<PodcastShow, 'coverAssetId'>): string | undefined {
  if (project.artworkMode === 'SHOW') return show.coverAssetId;
  return project.artworkAssetId ?? show.coverAssetId;
}

export interface PodcastEpisodeFinding {
  code: 'missing-intro' | 'missing-outro' | 'dead-air' | 'uneven-voices' | 'music-rights' | 'missing-description' | 'missing-cover' | 'missing-audio';
  severity: 'BLOCKING' | 'ADVISORY';
  title: string;
  message: string;
  station: 'RUNDOWN' | 'CUT' | 'MIX' | 'PACKAGE';
  segmentId?: string;
  clipId?: string;
  trackId?: string;
  atSec?: number;
}

export function checkPodcastEpisode(project: PodcastProject, show: Pick<PodcastShow, 'coverAssetId'>): PodcastEpisodeFinding[] {
  const findings: PodcastEpisodeFinding[] = [];
  if (!project.segments.some((segment) => segment.kind === 'INTRO')) findings.push({ code: 'missing-intro', severity: 'BLOCKING', title: 'The listener needs an introduction', message: 'Add a welcome that names the show, today’s subject, and who is speaking.', station: 'RUNDOWN' });
  if (!project.segments.some((segment) => segment.kind === 'CREDITS')) findings.push({ code: 'missing-outro', severity: 'BLOCKING', title: 'Finish the episode on purpose', message: 'Add credits that name the crew, sources, music, and what listeners can hear next.', station: 'RUNDOWN' });
  if (!project.description.trim()) findings.push({ code: 'missing-description', severity: 'BLOCKING', title: 'Write the listener description', message: 'Give listeners two or three sentences about what they will hear and why it matters.', station: 'PACKAGE' });
  if (!effectivePodcastArtworkId(project, show)) findings.push({ code: 'missing-cover', severity: 'BLOCKING', title: 'Choose a cover', message: 'Use the show cover, pick an approved image, upload one, or build a square cover in Blast.', station: 'PACKAGE' });
  const audible = project.clips.filter((clip) => !clip.muted && podcastClipDuration(clip) > .02).sort((a, b) => a.startSec - b.startSec);
  if (!audible.length) findings.push({ code: 'missing-audio', severity: 'BLOCKING', title: 'The cut is empty', message: 'Record a voice or place approved audio onto a track.', station: 'CUT' });
  let coveredUntil = 0;
  for (const clip of audible) {
    if (clip.startSec - coveredUntil > 2.5) findings.push({ code: 'dead-air', severity: 'ADVISORY', title: `Long silence at ${clock(coveredUntil)}`, message: `There are ${Math.round((clip.startSec - coveredUntil) * 10) / 10} seconds with nothing playing. Close the gap or make sure the pause is intentional.`, station: 'CUT', clipId: clip.id, atSec: coveredUntil });
    coveredUntil = Math.max(coveredUntil, clip.startSec + podcastClipDuration(clip));
  }
  const usedVoiceTracks = project.tracks.filter((track) => track.kind === 'VOICE' && project.clips.some((clip) => clip.trackId === track.id && !clip.muted));
  if (usedVoiceTracks.length > 1) {
    const loudest = usedVoiceTracks.reduce((best, track) => track.volumeDb > best.volumeDb ? track : best);
    const quietest = usedVoiceTracks.reduce((best, track) => track.volumeDb < best.volumeDb ? track : best);
    if (loudest.volumeDb - quietest.volumeDb > 6) findings.push({ code: 'uneven-voices', severity: 'ADVISORY', title: 'The voices may feel uneven', message: `${loudest.name} and ${quietest.name} are more than 6 dB apart. Bring them closer, then listen again.`, station: 'MIX', trackId: quietest.id });
  }
  const musicTrackIds = new Set(project.tracks.filter((track) => track.kind === 'MUSIC').map((track) => track.id));
  const firstMusic = project.clips.find((clip) => musicTrackIds.has(clip.trackId) && !clip.muted);
  if (firstMusic && !project.musicRightsConfirmed) findings.push({ code: 'music-rights', severity: 'BLOCKING', title: 'Check the music credit', message: 'Confirm this music was made by the crew or is cleared for this episode before packaging.', station: 'MIX', clipId: firstMusic.id, trackId: firstMusic.trackId });
  return findings;
}

export function makePodcastClip(input: { assetId: string; trackId: string; name: string; durationSec: number; startSec?: number }): PodcastClip {
  return { id: newId(), assetId: input.assetId, trackId: input.trackId, name: input.name, startSec: input.startSec ?? 0, trimInSec: 0, trimOutSec: input.durationSec, sourceDurationSec: input.durationSec, gainDb: 0, fadeInSec: .04, fadeOutSec: .04, muted: false, omittedRanges: [] };
}

export function podcastClipDuration(clip: PodcastClip): number {
  const omitted = clip.omittedRanges.reduce((sum, range) => sum + Math.max(0, Math.min(clip.trimOutSec, range.end) - Math.max(clip.trimInSec, range.start)), 0);
  return Math.max(0, clip.trimOutSec - clip.trimInSec - omitted);
}

export function podcastDuration(project: Pick<PodcastProject, 'clips'>): number {
  return project.clips.reduce((end, clip) => Math.max(end, clip.startSec + podcastClipDuration(clip)), 0);
}

export function splitPodcastClip(clip: PodcastClip, atProjectSec: number): [PodcastClip, PodcastClip] | undefined {
  const at = clip.trimInSec + atProjectSec - clip.startSec;
  if (at <= clip.trimInSec + .04 || at >= clip.trimOutSec - .04) return undefined;
  return [
    { ...clip, id: newId(), trimOutSec: at, fadeOutSec: Math.min(clip.fadeOutSec, .08), omittedRanges: clip.omittedRanges.filter((range) => range.start < at).map((range) => ({ ...range, end: Math.min(range.end, at) })) },
    { ...clip, id: newId(), startSec: atProjectSec, trimInSec: at, fadeInSec: Math.min(clip.fadeInSec, .08), omittedRanges: clip.omittedRanges.filter((range) => range.end > at).map((range) => ({ ...range, start: Math.max(range.start, at) })) },
  ];
}

export function segmentChapters(segments: PodcastSegment[]): PodcastChapter[] {
  let at = 0;
  return segments.map((segment) => { const chapter = { id: newId(), title: segment.title, atSec: at, ...(segment.storyId ? { storyId: segment.storyId } : {}) }; at += segment.targetSec; return chapter; });
}

export function podcastProblems(project: PodcastProject): string[] {
  const problems: string[] = [];
  if (!project.title.trim()) problems.push('Name the episode.');
  if (!project.segments.length) problems.push('Add at least one rundown card.');
  if (!project.clips.some((clip) => !clip.muted)) problems.push('Place some audio in the cut.');
  if (!project.description.trim()) problems.push('Write the episode description.');
  if (!project.chapters.length) problems.push('Make chapter markers from the rundown.');
  project.clips.forEach((clip, index) => {
    if (clip.trimInSec < 0 || clip.trimOutSec > clip.sourceDurationSec + .01 || clip.trimOutSec <= clip.trimInSec) problems.push(`Clip ${index + 1} has invalid trim points.`);
    if (clip.startSec < 0) problems.push(`Clip ${index + 1} starts before the episode.`);
  });
  return problems;
}

export function podcastShowNotes(project: PodcastProject, show: PodcastShow, stories: Story[]): string {
  const chapterLines = [...project.chapters].sort((a, b) => a.atSec - b.atSec).map((chapter) => `${clock(chapter.atSec)} ${chapter.title}`);
  const storyLines = project.storyIds.map((id) => stories.find((story) => story.id === id)).filter((story): story is Story => !!story).map((story) => `• ${story.title}`);
  return `${project.title}\n${show.title}\n\n${project.description.trim()}\n\nCHAPTERS\n${chapterLines.join('\n') || '00:00 Full episode'}\n\nIN THIS EPISODE\n${storyLines.join('\n') || 'Chatterbox Podcast'}\n\nProduced by the Chatter News crew.`;
}

export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export interface PodcastReleaseVerdict { ok: boolean; problems: string[] }

export async function canReleasePodcast(store: Store, projectId: string): Promise<PodcastReleaseVerdict> {
  const project = await store.podcastProjects.get(projectId); if (!project) return { ok: false, problems: ['The episode project is missing.'] };
  const problems = podcastProblems(project);
  const show = await store.podcastShows.get(project.showId);
  if (!show) problems.push('The podcast show setup is missing.');
  else problems.push(...checkPodcastEpisode(project, show).filter((finding) => finding.severity === 'BLOCKING').map((finding) => finding.message));
  if (project.state !== 'REVIEW') problems.push('Build the episode package before release.');
  const files = (await store.deliverables.list()).filter((item) => item.sourceProjectId === project.id && item.room === 'CHATTERBOX');
  if (!files.some((item) => item.kind === 'AUDIO' && item.stage === 'REVIEW')) problems.push('The reviewed listening master is missing.');
  const stories = await store.stories.list(); const reviews = await store.reviews.list();
  for (const storyId of project.storyIds) {
    const story = stories.find((item) => item.id === storyId); if (!story) { problems.push('One linked story is not on this story drive.'); continue; }
    const verdict = await canPublish(store, storyId); if (!verdict.ok) problems.push(`${story.title}: ${verdict.blockers[0]?.say ?? 'the media or permission check is not clear.'}`);
    const review = reviews.find((item) => item.storyId === storyId);
    if (story.status !== 'DONE' && (review?.state !== 'READY' || !reviewProgress(review, story, await reviewMediaKey(store, storyId)).ready)) problems.push(`${story.title}: finish the crew review of the current version.`);
  }
  return { ok: !problems.length, problems: [...new Set(problems)] };
}

export async function releasePodcast(store: Store, projectId: string, actor: string, receiptInput: PublishingReceiptInput): Promise<{ episodeId: string }> {
  const receipt = publishingReceipt(receiptInput, actor);
  const verdict = await canReleasePodcast(store, projectId); if (!verdict.ok) throw new Error(verdict.problems[0]);
  const project = (await store.podcastProjects.get(projectId))!; const files = (await store.deliverables.list()).filter((item) => item.sourceProjectId === project.id && item.room === 'CHATTERBOX'); const audio = files.filter((item) => item.kind === 'AUDIO').sort((a, b) => b.updatedAt - a.updatedAt)[0]!;
  const [stories, users, show] = await Promise.all([store.stories.list(), store.users.list(), store.podcastShows.get(project.showId)]); const frozenStories = project.storyIds.map((id) => stories.find((story) => story.id === id)).filter((story): story is Story => !!story).map((story) => ({ storyId: story.id, title: story.title, slug: story.slug, channels: story.channels.includes('pod') || story.channels.includes('podcast') ? [...story.channels] : [...story.channels, 'pod'], body: structuredClone(story.body), readTimeSec: story.readTimeSec, ...(story.durationSec !== undefined ? { durationSec: story.durationSec } : {}), bylines: story.bylineIds.map((id) => users.find((user) => user.id === id)?.penName ?? id), ...(story.brief?.angle ? { angle: story.brief.angle } : {}) })); const artworkAssetId = show ? effectivePodcastArtworkId(project, show) : project.artworkAssetId;
  const existing = (await store.episodes.list()).find((item) => item.podcastProjectId === project.id); const input = { title: project.title, publishedAt: receipt.publishedAt, channel: 'podcast', storyIds: project.storyIds, stories: frozenStories, podcastProjectId: project.id, audioDeliverableId: audio.id, description: project.description, episodeType: project.episodeType, ...(artworkAssetId ? { artworkAssetId } : {}), chapters: project.chapters, receipt };
  const episode = existing ? await store.episodes.update(existing.id, input) : await store.episodes.create(input);
  await store.podcastProjects.update(project.id, { state: 'FINAL' });
  for (const story of frozenStories) await store.stories.update(story.storyId, { status: 'DONE', workflowStepId: 'out' });
  for (const file of files) await store.deliverables.update(file.id, { stage: 'PUBLISHED' });
  await store.events.append({ action: 'podcast.release', target: project.id, actor, payload: { episodeId: episode.id, audioDeliverableId: audio.id, destinations: receipt.destinations } });
  return { episodeId: episode.id };
}
