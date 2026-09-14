import { newId } from './ids.js';
import { beatsToSeconds, secondsToBeats } from './garage.js';
import type {
  AudioClip,
  GarageArrangementRecipeId,
  GarageArrangementSection,
  GarageProject,
  GarageTrackKind,
} from './garage.js';

export interface GarageArrangementTrackRole {
  name: string;
  kind: GarageTrackKind;
  presetId?: string;
}

export interface GarageArrangementRecipe {
  id: GarageArrangementRecipeId;
  name: string;
  badge: string;
  description: string;
  sections: ReadonlyArray<{ name: string; purpose: string; bars: number; color: string }>;
  trackRoles: ReadonlyArray<GarageArrangementTrackRole>;
}

export const GARAGE_ARRANGEMENT_RECIPES: readonly GarageArrangementRecipe[] = [
  {
    id: 'HOOK_FIRST_POP', name: 'Hook-first pop', badge: 'POP',
    description: 'Open with the part people remember, then bring it back bigger.',
    sections: [
      { name: 'Count-in', purpose: 'Get ready', bars: 1, color: '#f6d45d' },
      { name: 'Hook', purpose: 'Lead with the big idea', bars: 8, color: '#ff6dad' },
      { name: 'Verse', purpose: 'Tell the story', bars: 16, color: '#55dfe8' },
      { name: 'Lift', purpose: 'Build into the hook', bars: 4, color: '#b899ff' },
      { name: 'Hook 2', purpose: 'Bring the big idea back', bars: 8, color: '#ff6dad' },
      { name: 'Bridge', purpose: 'Change the angle', bars: 8, color: '#ffae65' },
      { name: 'Final hook', purpose: 'Last and biggest', bars: 8, color: '#b9ee46' },
      { name: 'Outro', purpose: 'Land the ending', bars: 4, color: '#8f859a' },
    ],
    trackRoles: [
      { name: 'Drums', kind: 'DRUMS', presetId: 'pop-bounce' },
      { name: 'Bass', kind: 'BASS', presetId: 'round-bass' },
      { name: 'Chords', kind: 'KEYS', presetId: 'soft-electric' },
      { name: 'Hook', kind: 'KEYS', presetId: 'pop-lead' },
      { name: 'Lead vocal', kind: 'AUDIO' },
    ],
  },
  {
    id: 'RAP_16', name: '16-bar rap', badge: 'RAP',
    description: 'Two focused verses with room for a hook, ad-libs, and an ending.',
    sections: [
      { name: 'Count-in', purpose: 'Catch the beat', bars: 1, color: '#f6d45d' },
      { name: 'Verse 1', purpose: 'First 16 bars', bars: 16, color: '#55dfe8' },
      { name: 'Hook', purpose: 'The repeatable line', bars: 8, color: '#ff6dad' },
      { name: 'Verse 2', purpose: 'Second 16 bars', bars: 16, color: '#8c9dff' },
      { name: 'Hook 2', purpose: 'Return to the hook', bars: 8, color: '#ff6dad' },
      { name: 'Outro', purpose: 'Final bars or tag', bars: 4, color: '#b9ee46' },
    ],
    trackRoles: [
      { name: 'Drums', kind: 'DRUMS', presetId: 'trap-essentials' },
      { name: '808 / Bass', kind: 'BASS', presetId: 'deep-sub' },
      { name: 'Main vocal', kind: 'AUDIO' },
      { name: 'Ad-libs', kind: 'AUDIO' },
    ],
  },
  {
    id: 'DANCE_BUILD', name: 'Dance build / drop', badge: 'DANCE',
    description: 'Introduce the groove, raise the pressure, then make the drop count.',
    sections: [
      { name: 'Count-in', purpose: 'Lock to the tempo', bars: 1, color: '#f6d45d' },
      { name: 'Intro', purpose: 'Introduce the groove', bars: 8, color: '#55dfe8' },
      { name: 'Build', purpose: 'Add energy', bars: 8, color: '#ffae65' },
      { name: 'Drop', purpose: 'Full beat and bass', bars: 16, color: '#ff6dad' },
      { name: 'Break', purpose: 'Pull the energy back', bars: 8, color: '#8c9dff' },
      { name: 'Final drop', purpose: 'Biggest version', bars: 16, color: '#b9ee46' },
      { name: 'Outro', purpose: 'Wind the groove down', bars: 8, color: '#8f859a' },
    ],
    trackRoles: [
      { name: 'Dance drums', kind: 'DRUMS', presetId: 'festival-pop' },
      { name: 'Bass', kind: 'BASS', presetId: 'reese-bass' },
      { name: 'Chords', kind: 'KEYS', presetId: 'school-organ' },
      { name: 'Lead / FX', kind: 'KEYS', presetId: 'pop-lead' },
    ],
  },
  {
    id: 'PODCAST_BED', name: 'Podcast bed', badge: 'POD',
    description: 'Give talk, music, and transitions their own clear places.',
    sections: [
      { name: 'Count-in', purpose: 'Quiet before the open', bars: 1, color: '#f6d45d' },
      { name: 'Cold open', purpose: 'Start with a strong moment', bars: 8, color: '#ff6dad' },
      { name: 'Theme', purpose: 'Show title and music', bars: 4, color: '#55dfe8' },
      { name: 'Main talk', purpose: 'The full conversation', bars: 32, color: '#b899ff' },
      { name: 'Break', purpose: 'Reset or transition', bars: 4, color: '#ffae65' },
      { name: 'Close', purpose: 'Wrap and credit', bars: 8, color: '#b9ee46' },
    ],
    trackRoles: [
      { name: 'Host', kind: 'AUDIO' },
      { name: 'Guest', kind: 'AUDIO' },
      { name: 'Music bed', kind: 'AUDIO' },
      { name: 'SFX', kind: 'AUDIO' },
    ],
  },
  {
    id: 'NEWS_STING', name: 'News sting', badge: 'STING',
    description: 'A short build, a clean hit, and space for the show name.',
    sections: [
      { name: 'Count-in', purpose: 'Ready the crew', bars: 1, color: '#f6d45d' },
      { name: 'Build', purpose: 'Create forward motion', bars: 4, color: '#55dfe8' },
      { name: 'Hit', purpose: 'Land the logo moment', bars: 1, color: '#ff6dad' },
      { name: 'Tag', purpose: 'Leave room for the name', bars: 2, color: '#b9ee46' },
    ],
    trackRoles: [
      { name: 'Sting drums', kind: 'DRUMS', presetId: 'festival-pop' },
      { name: 'Bass hit', kind: 'BASS', presetId: 'deep-sub' },
      { name: 'Brass / Keys', kind: 'KEYS', presetId: 'synth-brass' },
      { name: 'Voice tag', kind: 'AUDIO' },
    ],
  },
] as const;

export function garageArrangementRecipe(id: GarageArrangementRecipeId): GarageArrangementRecipe {
  return GARAGE_ARRANGEMENT_RECIPES.find((recipe) => recipe.id === id) ?? GARAGE_ARRANGEMENT_RECIPES[0]!;
}

function buildSections(recipe: GarageArrangementRecipe): GarageArrangementSection[] {
  let startBeat = 0;
  return recipe.sections.map((part) => {
    const section = {
      id: newId(), name: part.name, purpose: part.purpose, color: part.color,
      startBeat, durationBeats: Math.max(4, Math.round(part.bars) * 4),
    };
    startBeat += section.durationBeats;
    return section;
  });
}

export function applyGarageArrangementRecipe(
  project: GarageProject, recipeId: GarageArrangementRecipeId,
): GarageProject {
  return { ...project, arrangementRecipeId: recipeId, arrangement: buildSections(garageArrangementRecipe(recipeId)) };
}

function sectionContaining(sections: ReadonlyArray<GarageArrangementSection>, beat: number) {
  return sections.find((section) => beat >= section.startBeat && beat < section.startBeat + section.durationBeats);
}

function moveClipsWithSections(
  project: GarageProject,
  before: ReadonlyArray<GarageArrangementSection>,
  after: ReadonlyArray<GarageArrangementSection>,
): GarageProject {
  const newStarts = new Map(after.map((section) => [section.id, section.startBeat]));
  const move = (clip: AudioClip): AudioClip => {
    const beat = secondsToBeats(clip.startSec, project.bpm);
    const oldSection = sectionContaining(before, beat);
    const newStart = oldSection ? newStarts.get(oldSection.id) : undefined;
    if (!oldSection || newStart === undefined) return clip;
    return { ...clip, startSec: beatsToSeconds(newStart + beat - oldSection.startBeat, project.bpm) };
  };
  return {
    ...project,
    arrangement: [...after],
    tracks: project.tracks.map((track) => ({ ...track, clips: track.clips.map(move) })),
  };
}

export function moveArrangementSection(project: GarageProject, sectionId: string, targetIndex: number): GarageProject {
  const before = project.arrangement ?? [];
  const currentIndex = before.findIndex((section) => section.id === sectionId);
  if (currentIndex < 0 || before.length < 2) return project;
  const ordered = [...before];
  const [section] = ordered.splice(currentIndex, 1);
  ordered.splice(Math.max(0, Math.min(targetIndex, ordered.length)), 0, section!);
  let startBeat = Math.min(...before.map((item) => item.startBeat));
  const after = ordered.map((item) => {
    const next = { ...item, startBeat };
    startBeat += item.durationBeats;
    return next;
  });
  return moveClipsWithSections(project, before, after);
}

export function resizeArrangementSection(
  project: GarageProject, sectionId: string, durationBeats: number,
): GarageProject {
  const before = project.arrangement ?? [];
  const index = before.findIndex((section) => section.id === sectionId);
  if (index < 0) return project;
  const nextDuration = Math.max(4, Math.round(durationBeats / 4) * 4);
  const delta = nextDuration - before[index]!.durationBeats;
  const after = before.map((section, sectionIndex) => sectionIndex === index
    ? { ...section, durationBeats: nextDuration }
    : sectionIndex > index ? { ...section, startBeat: Math.max(0, section.startBeat + delta) } : section);
  return moveClipsWithSections(project, before, after);
}

export function renameArrangementSection(project: GarageProject, sectionId: string, name: string): GarageProject {
  const cleanName = name.trim().slice(0, 40);
  if (!cleanName) return project;
  return {
    ...project,
    arrangement: project.arrangement?.map((section) => section.id === sectionId ? { ...section, name: cleanName } : section),
  };
}

export function recolorArrangementSection(project: GarageProject, sectionId: string, color: string): GarageProject {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return project;
  return {
    ...project,
    arrangement: project.arrangement?.map((section) => section.id === sectionId ? { ...section, color } : section),
  };
}

export function appendArrangementSection(
  project: GarageProject, input: { name: string; bars: number; color: string; purpose?: string },
): GarageProject {
  const sections = project.arrangement ?? [];
  const startBeat = sections.reduce((end, section) => Math.max(end, section.startBeat + section.durationBeats), 0);
  const section: GarageArrangementSection = {
    id: newId(), name: input.name.trim().slice(0, 40) || 'New part',
    purpose: input.purpose?.trim().slice(0, 80) || 'Shape this part',
    color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#55dfe8',
    startBeat, durationBeats: Math.max(4, Math.round(input.bars) * 4),
  };
  return { ...project, arrangement: [...sections, section] };
}

export function removeArrangementSection(project: GarageProject, sectionId: string): GarageProject {
  return { ...project, arrangement: project.arrangement?.filter((section) => section.id !== sectionId) };
}

export function arrangementEndBeat(project: GarageProject): number {
  return (project.arrangement ?? []).reduce(
    (end, section) => Math.max(end, section.startBeat + section.durationBeats), 0,
  );
}
