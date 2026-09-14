import { describe, expect, test } from 'vitest';
import {
  applyShowtimeRecipe, connectShowtimeClip, createShowtimeProject, insertShowtimePrimary,
  makeShowtimeClip, moveShowtimeClip, normalizeShowtimeProject, overwriteShowtimePrimary, rippleDeleteShowtimeClip,
  showtimeActiveClips, showtimeClipStart, showtimeCutCheck, SHOWTIME_RECIPES, showtimeDuration,
  splitShowtimeAt, splitShowtimeClip, trimShowtimeClip, validateShowtimeProject,
} from './showtime.js';

describe('Showtime edit model', () => {
  test('keeps source media untouched while trimming, speeding, and splitting edits', () => {
    const source = makeShowtimeClip({ assetId: 'camera-a', name: 'Wide shot', durationSec: 10 });
    const edited = { ...source, trimInSec: 2, trimOutSec: 8, speed: 2 };
    expect(showtimeDuration({ clips: [edited] })).toBe(3);
    const split = splitShowtimeClip(edited, 1);
    expect(split?.map((item) => [item.trimInSec, item.trimOutSec])).toEqual([[2, 4], [4, 8]]);
    expect(source).toMatchObject({ trimInSec: 0, trimOutSec: 10, speed: 1 });
  });

  test('validates a deliverable edit without limiting creative length', () => {
    const project = createShowtimeProject({ title: 'Morning show' });
    expect(validateShowtimeProject(project)).toContain('Add at least one shot to the timeline.');
    project.clips.push(makeShowtimeClip({ assetId: 'take', name: 'Take', durationSec: 600 }));
    expect(validateShowtimeProject(project)).toEqual([]);
    expect(showtimeDuration(project)).toBe(600);
  });

  test('uses real NLE overlap rules for dissolves but never shortens a cut', () => {
    const first = makeShowtimeClip({ assetId: 'a', name: 'A', durationSec: 5 });
    const second = makeShowtimeClip({ assetId: 'b', name: 'B', durationSec: 4 });
    second.transitionSec = 1;
    expect(showtimeDuration({ clips: [first, second] })).toBe(9);
    second.transition = 'DISSOLVE';
    expect(showtimeDuration({ clips: [first, second] })).toBe(8);
    second.transitionSec = 20;
    expect(showtimeDuration({ clips: [first, second] })).toBe(5);
  });

  test('offers five useful program recipes without manufacturing fake footage', () => {
    expect(SHOWTIME_RECIPES.map((recipe) => recipe.id)).toEqual([
      'BULLETIN_60', 'PACKAGE_180', 'INTERVIEW_PROFILE', 'EVENT_RECAP', 'VERTICAL_SOCIAL',
    ]);
    expect(SHOWTIME_RECIPES.every((recipe) => recipe.rails.reduce((total, rail) => total + rail.targetSec, 0) === recipe.targetSec)).toBe(true);

    const project = applyShowtimeRecipe(createShowtimeProject(), 'VERTICAL_SOCIAL');
    expect(project).toMatchObject({ format: 'VERTICAL', width: 720, height: 1280, programPlan: { recipeId: 'VERTICAL_SOCIAL', targetSec: 45 } });
    expect(project.programPlan?.rails.at(-1)?.endSec).toBe(45);
    expect(project.clips).toEqual([]);
    expect(project.titles).toEqual([]);
  });

  test('changes the pacing rail without deleting an edit already in progress', () => {
    const project = createShowtimeProject({ title: 'Field report' });
    project.clips.push(makeShowtimeClip({ assetId: 'take', name: 'Interview', durationSec: 20 }));
    project.titles.push({ id: 'title', kind: 'HEADLINE', text: 'Library opens', subtext: '', startSec: 0, endSec: 4, position: 'TOP', background: '#fff', color: '#111' });

    const changed = applyShowtimeRecipe(project, 'EVENT_RECAP');
    expect(changed.clips).toEqual(project.clips);
    expect(changed.titles).toEqual(project.titles);
    expect(changed.programPlan?.recipeId).toBe('EVENT_RECAP');
  });

  test('cut check finds uncovered rails, missing shots, clipped words, frame mismatches, and overlong titles', () => {
    const project = applyShowtimeRecipe(createShowtimeProject(), 'BULLETIN_60');
    const clip = makeShowtimeClip({ assetId: 'camera-a', name: 'Hallway interview', durationSec: 30, width: 1080, height: 1920 });
    clip.trimInSec = 1;
    clip.trimOutSec = 14;
    project.clips.push(clip);
    project.titles.push({ id: 'title', kind: 'LOWER_THIRD', text: 'A very long lower third', subtext: '', startSec: 0, endSec: 14, position: 'BOTTOM', background: '#fff', color: '#111' });

    const findings = showtimeCutCheck(project, {
      availableAssetIds: new Set<string>(),
      transcripts: [{ assetId: 'camera-a', segments: [{ start: 0, end: 2, text: 'Welcome to Chatter News' }, { start: 12, end: 16, text: 'More news after lunch' }] }],
    });

    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'BLACK_GAP', 'MISSING_MEDIA', 'CLIPPED_WORD', 'FRAME_MISMATCH', 'OVERLONG_TITLE',
    ]));
    expect(findings.find((finding) => finding.code === 'CLIPPED_WORD')).toMatchObject({ clipId: clip.id });
    expect(findings.find((finding) => finding.code === 'OVERLONG_TITLE')).toMatchObject({ titleId: 'title' });
  });

  test('cut check stays quiet for clean boundaries and matching frames', () => {
    const project = createShowtimeProject({ format: 'WIDE' });
    project.clips.push(makeShowtimeClip({ assetId: 'camera-a', name: 'Anchor', durationSec: 10, width: 1920, height: 1080 }));
    project.titles.push({ id: 'title', kind: 'LOWER_THIRD', text: 'Maya · Anchor', subtext: '', startSec: 1, endSec: 6, position: 'BOTTOM', background: '#fff', color: '#111' });
    expect(showtimeCutCheck(project, {
      availableAssetIds: new Set(['camera-a']),
      transcripts: [{ assetId: 'camera-a', segments: [{ start: 0, end: 10, text: 'A complete clean take' }] }],
    })).toEqual([]);
  });

  test('opens a legacy ordered cut as a magnetic V1 timeline without changing its edit', () => {
    const project = createShowtimeProject({ title: 'Legacy cut' });
    const first = makeShowtimeClip({ assetId: 'a', name: 'A', durationSec: 5 });
    const second = makeShowtimeClip({ assetId: 'b', name: 'B', durationSec: 4 });
    second.transition = 'DISSOLVE'; second.transitionSec = 1;
    project.clips = [first, second];

    const normalized = normalizeShowtimeProject(project);

    expect(normalized.tracks?.map((track) => [track.id, track.kind, track.role])).toEqual([
      ['v2', 'VIDEO', 'OVERLAY'], ['v1', 'VIDEO', 'PRIMARY'], ['t1', 'TITLE', 'TITLE'],
      ['a1', 'AUDIO', 'VOICE'], ['a2', 'AUDIO', 'MUSIC'], ['a3', 'AUDIO', 'SFX'],
    ]);
    expect(normalized.clips.map((clip) => [clip.trackId, clip.mediaKind, clip.startSec])).toEqual([
      ['v1', 'VIDEO', 0], ['v1', 'VIDEO', 4],
    ]);
    expect(showtimeDuration(normalized)).toBe(8);
    expect(project.clips[0]?.trackId).toBeUndefined();
  });

  test('inserts into the primary storyline at the playhead and ripples both sides cleanly', () => {
    const project = createShowtimeProject();
    const wide = makeShowtimeClip({ assetId: 'wide', name: 'Wide', durationSec: 10 });
    const reaction = makeShowtimeClip({ assetId: 'reaction', name: 'Reaction', durationSec: 2 });
    project.clips = [wide];

    const edited = insertShowtimePrimary(project, reaction, 4);
    const primary = edited.clips.filter((clip) => clip.trackId === 'v1');

    expect(primary.map((clip) => [clip.name, clip.trimInSec, clip.trimOutSec, clip.startSec])).toEqual([
      ['Wide', 0, 4, 0], ['Reaction', 0, 2, 4], ['Wide', 4, 10, 6],
    ]);
    expect(showtimeDuration(edited)).toBe(12);
  });

  test('appends to V1 instead of leaving a primary gap when audio runs longer', () => {
    const project = createShowtimeProject();
    const picture = makeShowtimeClip({ assetId: 'p', name: 'Picture', durationSec: 4 });
    const music = makeShowtimeClip({ assetId: 'm', name: 'Music', durationSec: 12, mediaKind: 'AUDIO' });
    project.clips = [picture];
    const withMusic = connectShowtimeClip(project, music, 'a2', 0);
    const close = makeShowtimeClip({ assetId: 'c', name: 'Close', durationSec: 2 });

    const edited = insertShowtimePrimary(withMusic, close, 10);

    expect(edited.clips.find((clip) => clip.name === 'Close')).toMatchObject({ trackId: 'v1', startSec: 4 });
  });

  test('splits a selected timeline clip at global Program time', () => {
    const project = createShowtimeProject();
    const first = makeShowtimeClip({ assetId: 'a', name: 'Open', durationSec: 4 });
    const second = makeShowtimeClip({ assetId: 'b', name: 'Interview', durationSec: 10 });
    second.trimInSec = 2; second.trimOutSec = 8;
    project.clips = [first, second];

    const edited = splitShowtimeAt(project, second.id, 6);
    const pieces = edited?.clips.filter((clip) => clip.name === 'Interview');

    expect(pieces?.map((clip) => [clip.trimInSec, clip.trimOutSec, clip.startSec])).toEqual([
      [2, 4, 4], [4, 8, 6],
    ]);
  });

  test('keeps connected picture attached when the primary storyline ripples', () => {
    const project = createShowtimeProject();
    const first = makeShowtimeClip({ assetId: 'a', name: 'Anchor', durationSec: 6 });
    const second = makeShowtimeClip({ assetId: 'b', name: 'Interview', durationSec: 6 });
    project.clips = [first, second];
    const bRoll = makeShowtimeClip({ assetId: 'c', name: 'B-roll', durationSec: 2 });
    const connected = connectShowtimeClip(project, bRoll, 'v2', 7);
    const insert = makeShowtimeClip({ assetId: 'd', name: 'New open', durationSec: 3 });

    const edited = insertShowtimePrimary(connected, insert, 0);
    const overlay = edited.clips.find((clip) => clip.name === 'B-roll');

    expect(overlay).toMatchObject({ trackId: 'v2', anchorClipId: second.id, anchorOffsetSec: 1, startSec: 10 });
  });

  test('overwrites only the covered primary time and keeps the sequence length', () => {
    const project = createShowtimeProject();
    const long = makeShowtimeClip({ assetId: 'a', name: 'Long take', durationSec: 10 });
    const insert = makeShowtimeClip({ assetId: 'b', name: 'Cutaway', durationSec: 4 });
    project.clips = [long];

    const edited = overwriteShowtimePrimary(project, insert, 3);

    expect(edited.clips.filter((clip) => clip.trackId === 'v1').map((clip) => [clip.name, clip.trimInSec, clip.trimOutSec, clip.startSec])).toEqual([
      ['Long take', 0, 3, 0], ['Cutaway', 0, 4, 3], ['Long take', 7, 10, 7],
    ]);
    expect(showtimeDuration(edited)).toBe(10);
  });

  test('ripple delete closes the primary gap and moves connected clips with their anchor', () => {
    const project = createShowtimeProject();
    const first = makeShowtimeClip({ assetId: 'a', name: 'Open', durationSec: 3 });
    const second = makeShowtimeClip({ assetId: 'b', name: 'Middle', durationSec: 4 });
    const third = makeShowtimeClip({ assetId: 'c', name: 'Close', durationSec: 5 });
    project.clips = [first, second, third];
    const sound = makeShowtimeClip({ assetId: 's', name: 'Bell', durationSec: 1, mediaKind: 'AUDIO' });
    const connected = connectShowtimeClip(project, sound, 'a3', 8);

    const edited = rippleDeleteShowtimeClip(connected, second.id);
    const close = edited.clips.find((clip) => clip.id === third.id)!;
    const bell = edited.clips.find((clip) => clip.name === 'Bell')!;

    expect(showtimeClipStart(edited, close)).toBe(3);
    expect(bell).toMatchObject({ anchorClipId: third.id, anchorOffsetSec: 1, startSec: 4 });
    expect(showtimeDuration(edited)).toBe(8);
  });

  test('duration includes connected picture, audio, and titles beyond the storyline', () => {
    const project = normalizeShowtimeProject(createShowtimeProject());
    const primary = makeShowtimeClip({ assetId: 'a', name: 'Picture', durationSec: 5 });
    const music = makeShowtimeClip({ assetId: 'm', name: 'Music', durationSec: 8, mediaKind: 'AUDIO' });
    project.clips = [{ ...primary, trackId: 'v1', startSec: 0 }, { ...music, trackId: 'a2', startSec: 4 }];
    project.titles.push({ id: 'title', kind: 'HEADLINE', text: 'Final', subtext: '', startSec: 13, endSec: 15, position: 'TOP', background: '#fff', color: '#111' });

    expect(showtimeDuration(project)).toBe(15);
  });

  test('moves a connected clip and attaches it to the primary shot beneath it', () => {
    const project = createShowtimeProject();
    const first = makeShowtimeClip({ assetId: 'a', name: 'Open', durationSec: 5 });
    const second = makeShowtimeClip({ assetId: 'b', name: 'Close', durationSec: 5 });
    const music = makeShowtimeClip({ assetId: 'm', name: 'Bed', durationSec: 3, mediaKind: 'AUDIO' });
    project.clips = [first, second];
    const connected = connectShowtimeClip(project, music, 'a2', 1);
    const moved = moveShowtimeClip(connected, music.id, 7);

    expect(moved.clips.find((clip) => clip.id === music.id)).toMatchObject({
      trackId: 'a2', startSec: 7, anchorClipId: second.id, anchorOffsetSec: 2,
    });
  });

  test('direct primary trim ripples later shots and keeps connected timing', () => {
    const project = createShowtimeProject();
    const first = makeShowtimeClip({ assetId: 'a', name: 'Open', durationSec: 6 });
    const second = makeShowtimeClip({ assetId: 'b', name: 'Close', durationSec: 5 });
    project.clips = [first, second];
    const bell = makeShowtimeClip({ assetId: 's', name: 'Bell', durationSec: 1, mediaKind: 'AUDIO' });
    const connected = connectShowtimeClip(project, bell, 'a3', 7);
    const trimmed = trimShowtimeClip(connected, first.id, { trimOutSec: 4 });

    expect(trimmed.clips.find((clip) => clip.id === second.id)?.startSec).toBe(4);
    expect(trimmed.clips.find((clip) => clip.id === bell.id)).toMatchObject({ startSec: 5, anchorOffsetSec: 1 });
  });

  test('finds every visible and audible layer at Program time', () => {
    const project = createShowtimeProject();
    const primary = makeShowtimeClip({ assetId: 'a', name: 'Picture', durationSec: 6 });
    const overlay = makeShowtimeClip({ assetId: 'b', name: 'B-roll', durationSec: 2 });
    const sound = makeShowtimeClip({ assetId: 'c', name: 'Sound', durationSec: 3, mediaKind: 'AUDIO' });
    project.clips = [primary];
    const withOverlay = connectShowtimeClip(project, overlay, 'v2', 2);
    const complete = connectShowtimeClip(withOverlay, sound, 'a3', 1);

    expect(showtimeActiveClips(complete, 2.5).map((clip) => clip.name)).toEqual(['B-roll', 'Picture', 'Sound']);
  });
});
