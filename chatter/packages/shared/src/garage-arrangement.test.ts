import { describe, expect, it } from 'vitest';
import { addAudioClip, addTrack, beatsToSeconds, emptyProject, secondsToBeats } from './garage.js';
import {
  GARAGE_ARRANGEMENT_RECIPES,
  applyGarageArrangementRecipe,
  appendArrangementSection,
  moveArrangementSection,
  removeArrangementSection,
  resizeArrangementSection,
} from './garage-arrangement.js';

function projectWithClips() {
  let project = emptyProject('Arrangement test', 120);
  project = addTrack(project, 'Drums', 'track-drums', 'DRUMS', 'trap-essentials');
  project = addTrack(project, 'Voice', 'track-voice', 'AUDIO');
  project = applyGarageArrangementRecipe(project, 'RAP_16');
  const verse = project.arrangement![1]!;
  const hook = project.arrangement![2]!;
  project = addAudioClip(project, project.tracks[0]!.id, {
    engineId: 'drum-clip', name: 'Verse drums', source: 'INSTRUMENT',
    startSec: beatsToSeconds(verse.startBeat + 2, project.bpm), sourceDurationSec: 2,
  });
  project = addAudioClip(project, project.tracks[1]!.id, {
    engineId: 'voice-clip', name: 'Hook vocal', source: 'RECORDING',
    startSec: beatsToSeconds(hook.startBeat + 1, project.bpm), sourceDurationSec: 2,
  });
  return project;
}

describe('Studio arrangement recipes', () => {
  it('offers five authored maps made only of contiguous empty sections', () => {
    expect(GARAGE_ARRANGEMENT_RECIPES.map((recipe) => recipe.id)).toEqual([
      'HOOK_FIRST_POP', 'RAP_16', 'DANCE_BUILD', 'PODCAST_BED', 'NEWS_STING',
    ]);

    for (const recipe of GARAGE_ARRANGEMENT_RECIPES) {
      const project = applyGarageArrangementRecipe(emptyProject(recipe.name), recipe.id);
      expect(project.arrangementRecipeId).toBe(recipe.id);
      expect(project.arrangement?.length).toBeGreaterThan(2);
      expect(project.tracks).toEqual([]);
      expect(project.arrangement?.[0]?.startBeat).toBe(0);
      project.arrangement?.forEach((section, index, sections) => {
        expect(section.durationBeats).toBeGreaterThan(0);
        if (index > 0) {
          const prior = sections[index - 1]!;
          expect(section.startBeat).toBe(prior.startBeat + prior.durationBeats);
        }
      });
    }
  });

  it('applies a new map without replacing existing tracks or clips', () => {
    const before = projectWithClips();
    const after = applyGarageArrangementRecipe(before, 'NEWS_STING');

    expect(after.tracks).toEqual(before.tracks);
    expect(after.arrangementRecipeId).toBe('NEWS_STING');
    expect(after.arrangement?.map((section) => section.name)).toEqual(['Count-in', 'Build', 'Hit', 'Tag']);
  });
});

describe('Studio arranger edits', () => {
  it('moves every track clip with its section and keeps its relative beat', () => {
    const before = projectWithClips();
    const verse = before.arrangement![1]!;
    const hook = before.arrangement![2]!;
    const after = moveArrangementSection(before, hook.id, 1);
    const movedHook = after.arrangement![1]!;
    const movedVerse = after.arrangement![2]!;

    const drumBeat = secondsToBeats(after.tracks[0]!.clips[0]!.startSec, after.bpm);
    const voiceBeat = secondsToBeats(after.tracks[1]!.clips[0]!.startSec, after.bpm);
    expect(voiceBeat).toBeCloseTo(movedHook.startBeat + 1);
    expect(drumBeat).toBeCloseTo(movedVerse.startBeat + 2);
    expect(verse.startBeat).not.toBe(movedVerse.startBeat);
    expect(hook.startBeat).not.toBe(movedHook.startBeat);
  });

  it('resizing one section shifts later sections and clips without stretching clips', () => {
    const before = projectWithClips();
    const verse = before.arrangement![1]!;
    const hook = before.arrangement![2]!;
    const voiceDuration = before.tracks[1]!.clips[0]!.sourceDurationSec;
    const after = resizeArrangementSection(before, verse.id, verse.durationBeats + 8);
    const resizedVerse = after.arrangement![1]!;
    const shiftedHook = after.arrangement![2]!;

    expect(resizedVerse.durationBeats).toBe(verse.durationBeats + 8);
    expect(shiftedHook.startBeat).toBe(hook.startBeat + 8);
    expect(secondsToBeats(after.tracks[1]!.clips[0]!.startSec, after.bpm)).toBeCloseTo(shiftedHook.startBeat + 1);
    expect(after.tracks[1]!.clips[0]!.sourceDurationSec).toBe(voiceDuration);
  });

  it('does not move clips beyond the mapped song when sections change', () => {
    let before = projectWithClips();
    const finalSection = before.arrangement!.at(-1)!;
    const outsideBeat = finalSection.startBeat + finalSection.durationBeats + 12;
    before = addAudioClip(before, before.tracks[0]!.id, {
      engineId: 'outside', name: 'Scratch idea', source: 'INSTRUMENT',
      startSec: beatsToSeconds(outsideBeat, before.bpm), sourceDurationSec: 2,
    });
    const after = moveArrangementSection(before, before.arrangement![2]!.id, 1);
    const outside = after.tracks[0]!.clips.find((clip) => clip.engineId === 'outside')!;
    expect(secondsToBeats(outside.startSec, after.bpm)).toBeCloseTo(outsideBeat);
  });

  it('appends a section and removes only its label, preserving recordings', () => {
    const before = projectWithClips();
    const appended = appendArrangementSection(before, { name: 'Final hook', bars: 8, color: '#ff6dad' });
    const added = appended.arrangement!.at(-1)!;
    const withClip = addAudioClip(appended, appended.tracks[1]!.id, {
      engineId: 'final-hook', name: 'Final hook vocal', source: 'RECORDING',
      startSec: beatsToSeconds(added.startBeat + 1, appended.bpm), sourceDurationSec: 2,
    });
    const removed = removeArrangementSection(withClip, added.id);

    expect(removed.arrangement?.some((section) => section.id === added.id)).toBe(false);
    expect(removed.tracks[1]!.clips.some((clip) => clip.engineId === 'final-hook')).toBe(true);
  });
});
