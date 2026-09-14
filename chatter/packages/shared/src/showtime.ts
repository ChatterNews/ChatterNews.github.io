import { newId } from './ids.js';
import type {
  ShowtimeClip, ShowtimeFormat, ShowtimeMediaKind, ShowtimeProgramPlan, ShowtimeProject, ShowtimeRecipeId,
  ShowtimeTitle, ShowtimeTrack, Transcript,
} from './types.js';
import type { TranscriptSegment } from './transcribe.js';

export const SHOWTIME_FORMATS: Record<ShowtimeFormat, { label: string; width: number; height: number }> = {
  WIDE: { label: 'HD 16:9', width: 1280, height: 720 },
  VERTICAL: { label: 'Vertical 9:16', width: 720, height: 1280 },
  SQUARE: { label: 'Square 1:1', width: 900, height: 900 },
};

export interface ShowtimeRecipe {
  id: ShowtimeRecipeId;
  label: string;
  shortLabel: string;
  description: string;
  format: ShowtimeFormat;
  targetSec: number;
  color: string;
  rails: Array<{ label: string; purpose: string; targetSec: number }>;
}

export const SHOWTIME_RECIPES: ShowtimeRecipe[] = [
  {
    id: 'BULLETIN_60', label: '60-second bulletin', shortLabel: 'Bulletin', format: 'WIDE', targetSec: 60, color: '#f3c93c',
    description: 'One lead, a few quick hits, and a clean sign-off.',
    rails: [
      { label: 'Open', purpose: 'Name the newscast and the lead.', targetSec: 7 },
      { label: 'Lead story', purpose: 'Give the strongest verified details.', targetSec: 23 },
      { label: 'Quick hits', purpose: 'Move through two or three short updates.', targetSec: 18 },
      { label: 'Sign-off', purpose: 'Tell viewers what comes next.', targetSec: 12 },
    ],
  },
  {
    id: 'PACKAGE_180', label: '3-minute package', shortLabel: 'News package', format: 'WIDE', targetSec: 180, color: '#70c6db',
    description: 'A reported story with room for evidence, voices, and meaning.',
    rails: [
      { label: 'Cold open', purpose: 'Start with the strongest picture or line.', targetSec: 12 },
      { label: 'Setup', purpose: 'State the news and why it matters.', targetSec: 28 },
      { label: 'Reporting', purpose: 'Build the story with scenes, facts, and voices.', targetSec: 90 },
      { label: 'What it means', purpose: 'Connect the reporting to the audience.', targetSec: 35 },
      { label: 'Tag', purpose: 'Close with the next step or reporter sign-off.', targetSec: 15 },
    ],
  },
  {
    id: 'INTERVIEW_PROFILE', label: 'Interview profile', shortLabel: 'Profile', format: 'WIDE', targetSec: 180, color: '#eb8db8',
    description: 'Let one person’s voice lead, supported by details and cutaways.',
    rails: [
      { label: 'Meet them', purpose: 'Open on a revealing moment.', targetSec: 15 },
      { label: 'Context', purpose: 'Explain who they are and why now.', targetSec: 35 },
      { label: 'Their voice', purpose: 'Let the interview carry the middle.', targetSec: 90 },
      { label: 'Show the detail', purpose: 'Use action and close shots to add meaning.', targetSec: 25 },
      { label: 'Last word', purpose: 'End on a memorable answer or image.', targetSec: 15 },
    ],
  },
  {
    id: 'EVENT_RECAP', label: 'Event recap', shortLabel: 'Recap', format: 'WIDE', targetSec: 90, color: '#a7d764',
    description: 'Bring viewers through what happened, who was there, and what follows.',
    rails: [
      { label: 'Best moment', purpose: 'Open with the energy of the event.', targetSec: 8 },
      { label: 'What happened', purpose: 'Name the event, place, and purpose.', targetSec: 22 },
      { label: 'Voices', purpose: 'Use reactions or a short interview.', targetSec: 35 },
      { label: 'Highlights', purpose: 'Show the details viewers missed.', targetSec: 15 },
      { label: 'What’s next', purpose: 'Close with the result or next date.', targetSec: 10 },
    ],
  },
  {
    id: 'VERTICAL_SOCIAL', label: 'Vertical social report', shortLabel: 'Vertical', format: 'VERTICAL', targetSec: 45, color: '#f08a4b',
    description: 'Fast, clear reporting built for a phone screen.',
    rails: [
      { label: 'Stop the scroll', purpose: 'Open on the reason to watch.', targetSec: 3 },
      { label: 'The news', purpose: 'Say what happened in one clean line.', targetSec: 9 },
      { label: 'Show proof', purpose: 'Use the best fact, quote, or demonstration.', targetSec: 20 },
      { label: 'What’s next', purpose: 'Give the next step or key date.', targetSec: 10 },
      { label: 'End card', purpose: 'Land the source and Chatter name.', targetSec: 3 },
    ],
  },
];

function planFor(recipe: ShowtimeRecipe): ShowtimeProgramPlan {
  let cursor = 0;
  return {
    recipeId: recipe.id,
    targetSec: recipe.targetSec,
    rails: recipe.rails.map((rail, index) => {
      const startSec = cursor; cursor += rail.targetSec;
      return { id: `${recipe.id.toLowerCase()}-${index + 1}`, label: rail.label, purpose: rail.purpose, startSec, endSec: cursor, color: recipe.color };
    }),
  };
}

export function applyShowtimeRecipe(project: ShowtimeProject, recipeId: ShowtimeRecipeId): ShowtimeProject {
  const recipe = SHOWTIME_RECIPES.find((item) => item.id === recipeId);
  if (!recipe) return project;
  const size = SHOWTIME_FORMATS[recipe.format];
  return { ...project, updatedAt: Date.now(), format: recipe.format, ...size, programPlan: planFor(recipe) };
}

export function createShowtimeProject(input: { title?: string; storyId?: string; authorId?: string; format?: ShowtimeFormat } = {}): ShowtimeProject {
  const now = Date.now(); const format = input.format ?? 'WIDE'; const size = SHOWTIME_FORMATS[format];
  return { id: newId(), createdAt: now, updatedAt: now, title: input.title ?? 'New video', format, ...size, clips: [], titles: [], tracks: defaultShowtimeTracks(), ...(input.storyId ? { storyId: input.storyId } : {}), ...(input.authorId ? { authorId: input.authorId } : {}) };
}

export function showtimeClipDuration(clip: ShowtimeClip): number {
  return Math.max(0, clip.trimOutSec - clip.trimInSec) / Math.max(.25, clip.speed);
}

export const SHOWTIME_PRIMARY_TRACK_ID = 'v1';

export function defaultShowtimeTracks(): ShowtimeTrack[] {
  return [
    { id: 'v2', kind: 'VIDEO', role: 'OVERLAY', name: 'B-roll', order: 0, muted: false, locked: false, hidden: false, volume: 1 },
    { id: SHOWTIME_PRIMARY_TRACK_ID, kind: 'VIDEO', role: 'PRIMARY', name: 'Primary story', order: 1, muted: false, locked: false, hidden: false, volume: 1 },
    { id: 't1', kind: 'TITLE', role: 'TITLE', name: 'Titles', order: 2, muted: false, locked: false, hidden: false, volume: 1 },
    { id: 'a1', kind: 'AUDIO', role: 'VOICE', name: 'Voice', order: 3, muted: false, locked: false, hidden: false, volume: 1 },
    { id: 'a2', kind: 'AUDIO', role: 'MUSIC', name: 'Music', order: 4, muted: false, locked: false, hidden: false, volume: .75 },
    { id: 'a3', kind: 'AUDIO', role: 'SFX', name: 'Sounds', order: 5, muted: false, locked: false, hidden: false, volume: 1 },
  ];
}

function transitionOverlap(clip: ShowtimeClip, previous?: ShowtimeClip): number {
  return previous && clip.transition !== 'CUT'
    ? Math.min(clip.transitionSec, showtimeClipDuration(clip), showtimeClipDuration(previous))
    : 0;
}

function isPrimary(clip: ShowtimeClip): boolean { return !clip.trackId || clip.trackId === SHOWTIME_PRIMARY_TRACK_ID; }

/** Add the current track vocabulary to an older project without mutating the saved object. */
export function normalizeShowtimeProject(project: ShowtimeProject): ShowtimeProject {
  const tracks = defaultShowtimeTracks();
  for (const saved of project.tracks ?? []) {
    const index = tracks.findIndex((track) => track.id === saved.id);
    if (index >= 0) tracks[index] = { ...tracks[index]!, ...saved };
    else tracks.push({ ...saved });
  }
  tracks.sort((a, b) => a.order - b.order);

  let primaryCursor = 0; let previousPrimary: ShowtimeClip | undefined;
  const clips = project.clips.map((clip) => {
    const primary = isPrimary(clip);
    const trackId = clip.trackId ?? SHOWTIME_PRIMARY_TRACK_ID;
    const mediaKind: ShowtimeMediaKind = clip.mediaKind ?? (tracks.find((track) => track.id === trackId)?.kind === 'AUDIO' ? 'AUDIO' : 'VIDEO');
    const startSec = clip.startSec ?? (primary ? primaryCursor - transitionOverlap(clip, previousPrimary) : 0);
    const normalized: ShowtimeClip = {
      ...clip, trackId, mediaKind, startSec,
      fit: clip.fit ?? 'COVER', scale: clip.scale ?? 1, positionX: clip.positionX ?? 0,
      positionY: clip.positionY ?? 0, opacity: clip.opacity ?? 1,
      fadeInSec: clip.fadeInSec ?? 0, fadeOutSec: clip.fadeOutSec ?? 0,
    };
    if (primary) { primaryCursor = startSec + showtimeClipDuration(normalized); previousPrimary = normalized; }
    return normalized;
  });
  return { ...project, tracks, clips };
}

export function showtimeClipStart(project: Pick<ShowtimeProject, 'clips' | 'tracks'>, clip: ShowtimeClip): number {
  if (typeof clip.startSec === 'number') return Math.max(0, clip.startSec);
  let cursor = 0; let previous: ShowtimeClip | undefined;
  for (const item of project.clips) {
    if (!isPrimary(item)) continue;
    cursor -= transitionOverlap(item, previous);
    if (item.id === clip.id) return Math.max(0, cursor);
    cursor += showtimeClipDuration(item); previous = item;
  }
  return 0;
}

export function showtimeClipEnd(project: Pick<ShowtimeProject, 'clips' | 'tracks'>, clip: ShowtimeClip): number {
  return showtimeClipStart(project, clip) + showtimeClipDuration(clip);
}

export function showtimeDuration(project: { clips: ShowtimeClip[]; titles?: ShowtimeTitle[]; tracks?: ShowtimeTrack[] }): number {
  const clipEnd = project.clips.reduce((maximum, clip) => Math.max(maximum, showtimeClipEnd(project, clip)), 0);
  return (project.titles ?? []).reduce((maximum, title) => Math.max(maximum, title.endSec), clipEnd);
}

export function makeShowtimeClip(input: { assetId: string; name: string; durationSec: number; width?: number; height?: number; mediaKind?: ShowtimeMediaKind }): ShowtimeClip {
  return {
    id: newId(), assetId: input.assetId, name: input.name, trimInSec: 0, trimOutSec: input.durationSec,
    sourceDurationSec: input.durationSec, volume: 1, muted: false, speed: 1, transition: 'CUT', transitionSec: 0,
    mediaKind: input.mediaKind ?? 'VIDEO', fit: 'COVER', scale: 1, positionX: 0, positionY: 0, opacity: 1, fadeInSec: 0, fadeOutSec: 0,
    ...(input.width && input.height ? { sourceWidth: input.width, sourceHeight: input.height } : {}),
  };
}

export function splitShowtimeClip(clip: ShowtimeClip, atSequenceSec: number): [ShowtimeClip, ShowtimeClip] | undefined {
  const sourceAt = clip.trimInSec + atSequenceSec * clip.speed;
  if (sourceAt <= clip.trimInSec + .04 || sourceAt >= clip.trimOutSec - .04) return undefined;
  const startSec = clip.startSec;
  return [
    { ...clip, id: newId(), trimOutSec: sourceAt },
    { ...clip, id: newId(), trimInSec: sourceAt, transition: 'CUT', transitionSec: 0, ...(startSec === undefined ? {} : { startSec: startSec + atSequenceSec }) },
  ];
}

function refreshAnchors(project: ShowtimeProject): ShowtimeProject {
  const clips = project.clips.map((clip) => {
    if (!clip.anchorClipId || clip.anchorOffsetSec === undefined) return clip;
    const anchor = project.clips.find((item) => item.id === clip.anchorClipId);
    return anchor ? { ...clip, startSec: showtimeClipStart(project, anchor) + clip.anchorOffsetSec } : { ...clip, anchorClipId: undefined, anchorOffsetSec: undefined };
  });
  return { ...project, clips };
}

function primaryClips(project: ShowtimeProject): ShowtimeClip[] {
  return project.clips.filter(isPrimary).sort((a, b) => showtimeClipStart(project, a) - showtimeClipStart(project, b));
}

function rebuildClipOrder(project: ShowtimeProject, primary: ShowtimeClip[], other = project.clips.filter((clip) => !isPrimary(clip))): ShowtimeProject {
  return refreshAnchors({ ...project, updatedAt: Date.now(), clips: [...primary, ...other] });
}

export function splitShowtimeAt(project: ShowtimeProject, clipId: string, atSequenceSec: number): ShowtimeProject | undefined {
  const normalized = normalizeShowtimeProject(project); const clip = normalized.clips.find((item) => item.id === clipId);
  if (!clip) return undefined;
  const local = atSequenceSec - showtimeClipStart(normalized, clip); const pieces = splitShowtimeClip(clip, local);
  if (!pieces) return undefined;
  const clips = normalized.clips.flatMap((item) => item.id === clipId ? pieces : [item]);
  return refreshAnchors({ ...normalized, updatedAt: Date.now(), clips });
}

export function connectShowtimeClip(project: ShowtimeProject, clip: ShowtimeClip, trackId: string, atSequenceSec: number): ShowtimeProject {
  const normalized = normalizeShowtimeProject(project); const primary = primaryClips(normalized);
  const anchor = primary.find((item) => atSequenceSec >= showtimeClipStart(normalized, item) && atSequenceSec <= showtimeClipEnd(normalized, item))
    ?? primary.filter((item) => showtimeClipStart(normalized, item) <= atSequenceSec).at(-1);
  const connected: ShowtimeClip = {
    ...clip, trackId, mediaKind: normalized.tracks?.find((track) => track.id === trackId)?.kind === 'AUDIO' ? 'AUDIO' : clip.mediaKind ?? 'VIDEO',
    startSec: Math.max(0, atSequenceSec), ...(anchor ? { anchorClipId: anchor.id, anchorOffsetSec: atSequenceSec - showtimeClipStart(normalized, anchor) } : {}),
  };
  return { ...normalized, updatedAt: Date.now(), clips: [...normalized.clips, connected] };
}

export function insertShowtimePrimary(project: ShowtimeProject, clip: ShowtimeClip, atSequenceSec: number): ShowtimeProject {
  const normalized = normalizeShowtimeProject(project); const before = primaryClips(normalized); const primaryEnd = before.reduce((maximum, item) => Math.max(maximum, showtimeClipEnd(normalized, item)), 0); const at = Math.max(0, Math.min(atSequenceSec, primaryEnd));
  const inserted: ShowtimeClip = { ...clip, trackId: SHOWTIME_PRIMARY_TRACK_ID, mediaKind: 'VIDEO', startSec: at, transition: 'CUT', transitionSec: 0 };
  const next: ShowtimeClip[] = [];
  for (const item of before) {
    const start = showtimeClipStart(normalized, item); const end = showtimeClipEnd(normalized, item);
    if (at > start + .04 && at < end - .04) {
      const pieces = splitShowtimeClip(item, at - start)!;
      next.push({ ...pieces[0], startSec: start }, inserted, { ...pieces[1], startSec: at + showtimeClipDuration(inserted) });
    } else if (start >= at) next.push({ ...item, startSec: start + showtimeClipDuration(inserted) });
    else next.push(item);
  }
  if (!next.some((item) => item.id === inserted.id)) {
    const index = next.findIndex((item) => showtimeClipStart({ ...normalized, clips: next }, item) >= at);
    if (index < 0) next.push(inserted); else next.splice(index, 0, inserted);
  }
  return rebuildClipOrder(normalized, next);
}

export function overwriteShowtimePrimary(project: ShowtimeProject, clip: ShowtimeClip, atSequenceSec: number): ShowtimeProject {
  const normalized = normalizeShowtimeProject(project); const at = Math.max(0, atSequenceSec); const inserted: ShowtimeClip = { ...clip, trackId: SHOWTIME_PRIMARY_TRACK_ID, mediaKind: 'VIDEO', startSec: at, transition: 'CUT', transitionSec: 0 };
  const end = at + showtimeClipDuration(inserted); const next: ShowtimeClip[] = [];
  for (const item of primaryClips(normalized)) {
    const itemStart = showtimeClipStart(normalized, item); const itemEnd = showtimeClipEnd(normalized, item);
    if (itemEnd <= at || itemStart >= end) { next.push(item); continue; }
    if (itemStart < at) {
      const sourceOut = item.trimInSec + (at - itemStart) * item.speed;
      next.push({ ...item, id: newId(), trimOutSec: sourceOut, startSec: itemStart });
    }
    if (itemEnd > end) {
      const sourceIn = item.trimInSec + (end - itemStart) * item.speed;
      next.push({ ...item, id: newId(), trimInSec: sourceIn, startSec: end, transition: 'CUT', transitionSec: 0 });
    }
  }
  next.push(inserted); next.sort((a, b) => (a.startSec ?? 0) - (b.startSec ?? 0));
  return rebuildClipOrder(normalized, next);
}

export function rippleDeleteShowtimeClip(project: ShowtimeProject, clipId: string): ShowtimeProject {
  const normalized = normalizeShowtimeProject(project); const target = normalized.clips.find((clip) => clip.id === clipId);
  if (!target) return normalized;
  if (!isPrimary(target)) return { ...normalized, updatedAt: Date.now(), clips: normalized.clips.filter((clip) => clip.id !== clipId) };
  const start = showtimeClipStart(normalized, target); const amount = showtimeClipDuration(target);
  const primary = primaryClips(normalized).filter((clip) => clip.id !== clipId).map((clip) => showtimeClipStart(normalized, clip) > start ? { ...clip, startSec: Math.max(start, showtimeClipStart(normalized, clip) - amount) } : clip);
  const others = normalized.clips.filter((clip) => !isPrimary(clip) && clip.anchorClipId !== clipId);
  return rebuildClipOrder(normalized, primary, others);
}

function reflowPrimary(project: ShowtimeProject, primary: ShowtimeClip[]): ShowtimeProject {
  let cursor = 0; let previous: ShowtimeClip | undefined;
  const placed = primary.map((clip) => {
    cursor -= transitionOverlap(clip, previous);
    const next = { ...clip, trackId: SHOWTIME_PRIMARY_TRACK_ID, mediaKind: 'VIDEO' as const, startSec: Math.max(0, cursor) };
    cursor = next.startSec + showtimeClipDuration(next); previous = next; return next;
  });
  return rebuildClipOrder(project, placed);
}

export function moveShowtimeClip(project: ShowtimeProject, clipId: string, atSequenceSec: number, trackId?: string): ShowtimeProject {
  const normalized = normalizeShowtimeProject(project); const clip = normalized.clips.find((item) => item.id === clipId);
  if (!clip) return normalized;
  const destinationTrack = trackId ?? clip.trackId ?? SHOWTIME_PRIMARY_TRACK_ID;
  if (destinationTrack === SHOWTIME_PRIMARY_TRACK_ID) {
    const oldStart = showtimeClipStart(normalized, clip); const duration = showtimeClipDuration(clip);
    const without = rippleDeleteShowtimeClip(normalized, clipId); const at = atSequenceSec > oldStart ? Math.max(0, atSequenceSec - duration) : Math.max(0, atSequenceSec);
    return insertShowtimePrimary(without, { ...clip, anchorClipId: undefined, anchorOffsetSec: undefined }, at);
  }
  const without = { ...normalized, clips: normalized.clips.filter((item) => item.id !== clipId) };
  return connectShowtimeClip(without, { ...clip, anchorClipId: undefined, anchorOffsetSec: undefined }, destinationTrack, Math.max(0, atSequenceSec));
}

export function trimShowtimeClip(project: ShowtimeProject, clipId: string, patch: Pick<Partial<ShowtimeClip>, 'trimInSec' | 'trimOutSec'>): ShowtimeProject {
  const normalized = normalizeShowtimeProject(project); const target = normalized.clips.find((clip) => clip.id === clipId);
  if (!target) return normalized;
  const trimInSec = Math.max(0, Math.min(patch.trimInSec ?? target.trimInSec, target.sourceDurationSec - .04));
  const trimOutSec = Math.min(target.sourceDurationSec, Math.max(patch.trimOutSec ?? target.trimOutSec, trimInSec + .04));
  if (isPrimary(target)) {
    const primary = primaryClips(normalized).map((clip) => clip.id === clipId ? { ...clip, trimInSec, trimOutSec } : clip);
    return reflowPrimary(normalized, primary);
  }
  return { ...normalized, updatedAt: Date.now(), clips: normalized.clips.map((clip) => clip.id === clipId ? { ...clip, trimInSec, trimOutSec } : clip) };
}

export function showtimeActiveClips(project: ShowtimeProject, atSequenceSec: number): ShowtimeClip[] {
  const normalized = normalizeShowtimeProject(project); const order = new Map(normalized.tracks?.map((track) => [track.id, track.order]) ?? []);
  return normalized.clips.filter((clip) => atSequenceSec >= showtimeClipStart(normalized, clip) && atSequenceSec < showtimeClipEnd(normalized, clip))
    .sort((a, b) => (order.get(a.trackId ?? SHOWTIME_PRIMARY_TRACK_ID) ?? 0) - (order.get(b.trackId ?? SHOWTIME_PRIMARY_TRACK_ID) ?? 0));
}

export function defaultShowtimeTitle(storyTitle: string, byline = ''): ShowtimeTitle {
  return { id: newId(), kind: 'LOWER_THIRD', text: storyTitle || 'Story headline', subtext: byline, startSec: 0, endSec: 5, position: 'BOTTOM', background: '#FFD21E', color: '#1A1626' };
}

export function validateShowtimeProject(project: ShowtimeProject): string[] {
  const problems: string[] = [];
  if (!project.title.trim()) problems.push('Name the video project.');
  if (!project.clips.length) problems.push('Add at least one shot to the timeline.');
  project.clips.forEach((clip, index) => {
    if (clip.trimInSec < 0 || clip.trimOutSec > clip.sourceDurationSec + .01 || clip.trimOutSec <= clip.trimInSec) problems.push(`Shot ${index + 1} has invalid trim points.`);
    if (clip.speed < .25 || clip.speed > 2) problems.push(`Shot ${index + 1} has an unsupported speed.`);
  });
  project.titles.forEach((title, index) => { if (!title.text.trim() || title.endSec <= title.startSec) problems.push(`Title ${index + 1} needs words and a visible time range.`); });
  return problems;
}

export type ShowtimeCutFindingCode = 'BLACK_GAP' | 'MISSING_MEDIA' | 'CLIPPED_WORD' | 'FRAME_MISMATCH' | 'OVERLONG_TITLE';
export interface ShowtimeCutFinding {
  code: ShowtimeCutFindingCode;
  severity: 'BLOCKING' | 'ADVISORY';
  title: string;
  message: string;
  clipId?: string;
  titleId?: string;
  railId?: string;
}

function transcriptSegments(transcript?: Pick<Transcript, 'segments'>): TranscriptSegment[] {
  if (!transcript) return [];
  return transcript.segments.filter((item): item is TranscriptSegment => {
    if (!item || typeof item !== 'object') return false;
    const part = item as Partial<TranscriptSegment>;
    return typeof part.start === 'number' && typeof part.end === 'number' && typeof part.text === 'string';
  });
}

function shortQuote(value: string): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean.length > 46 ? `${clean.slice(0, 43)}…` : clean;
}

/** Editorial checks that can be proven from the non-destructive edit data. */
export function showtimeCutCheck(project: ShowtimeProject, context: {
  availableAssetIds?: ReadonlySet<string>;
  transcripts?: ReadonlyArray<Pick<Transcript, 'assetId' | 'segments'>>;
} = {}): ShowtimeCutFinding[] {
  const findings: ShowtimeCutFinding[] = [];
  const duration = showtimeDuration(project);
  const plan = project.programPlan;
  if (plan && duration < plan.targetSec - .5) {
    const firstOpen = plan.rails.find((rail) => rail.endSec > duration);
    findings.push({
      code: 'BLACK_GAP', severity: 'ADVISORY', title: 'Planned ending has no picture',
      message: `${Math.round(plan.targetSec - duration)} seconds of the rundown are still uncovered${firstOpen ? `, starting in ${firstOpen.label}` : ''}.`,
      ...(firstOpen ? { railId: firstOpen.id } : {}),
    });
  }

  const projectRatio = project.width / project.height;
  for (const clip of project.clips) {
    if (context.availableAssetIds && !context.availableAssetIds.has(clip.assetId)) {
      findings.push({ code: 'MISSING_MEDIA', severity: 'BLOCKING', title: 'Shot file is missing', message: `${clip.name} is not on this Story Drive. Put the file back before rendering.`, clipId: clip.id });
    }
    if (clip.sourceWidth && clip.sourceHeight) {
      const sourceRatio = clip.sourceWidth / clip.sourceHeight;
      if (Math.abs(sourceRatio - projectRatio) / projectRatio > .12) {
        findings.push({ code: 'FRAME_MISMATCH', severity: 'ADVISORY', title: 'Frame shape will crop', message: `${clip.name} is ${sourceRatio > 1 ? 'wide' : sourceRatio < 1 ? 'vertical' : 'square'} footage in a ${project.format.toLowerCase()} program. Check the crop in Program.`, clipId: clip.id });
      }
    }
    const transcript = context.transcripts?.find((item) => item.assetId === clip.assetId);
    const segments = transcriptSegments(transcript);
    const boundaries = [{ label: 'In point', at: clip.trimInSec }, { label: 'Out point', at: clip.trimOutSec }];
    for (const boundary of boundaries) {
      const crossing = segments.find((segment) => boundary.at > segment.start + .08 && boundary.at < segment.end - .08);
      if (crossing) findings.push({ code: 'CLIPPED_WORD', severity: 'ADVISORY', title: 'A trim cuts through words', message: `${boundary.label} on ${clip.name} lands inside “${shortQuote(crossing.text)}”. Listen at the edit and give the word room.`, clipId: clip.id });
    }
  }

  const maximumTitleSec: Record<ShowtimeTitle['kind'], number> = { HEADLINE: 6, LOWER_THIRD: 8, CAPTION: 5 };
  for (const title of project.titles) {
    const visibleSec = title.endSec - title.startSec;
    if (visibleSec > maximumTitleSec[title.kind]) findings.push({ code: 'OVERLONG_TITLE', severity: 'ADVISORY', title: 'Title stays up too long', message: `“${shortQuote(title.text)}” is on screen for ${Math.round(visibleSec)} seconds. Read it once, then let the picture breathe.`, titleId: title.id });
  }
  return findings;
}
