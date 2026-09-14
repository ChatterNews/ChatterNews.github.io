/**
 * Studio's visible audio timeline.
 *
 * openDAW owns the playable project, media storage and mixdown. This small
 * record is deliberately just the child-facing view state: names, clip bounds
 * and mixer controls. It supports audio plus a few OpenDAW-backed starter
 * instruments — not a synthetic loop grid.
 */
import { newId } from './ids.js';
import type { GarageInstrumentControl, GarageInstrumentControls } from './garage-instruments.js';
import type { Base } from './types.js';

export type ClipSource = 'RECORDING' | 'IMPORT' | 'BOOTH' | 'INSTRUMENT';
export type GarageTrackKind = 'AUDIO' | 'KEYS' | 'BASS' | 'PAD' | 'DRUMS' | 'SAMPLER';
export type GarageTrackContentRole = 'VOICE' | 'MUSIC' | 'SFX';
export type GarageEffect = 'CLEANUP' | 'VOICE_SHINE' | 'SPACE' | 'ECHO' | 'TUNE' | 'ROBOT';
export type GarageVoicePreset = 'RAW' | 'NEWS_VOICE' | 'WARM_STORY' | 'BIG_SCENE' | 'TUNED' | 'RADIO' | 'CUSTOM';
export type GarageArrangementRecipeId = 'HOOK_FIRST_POP' | 'RAP_16' | 'DANCE_BUILD' | 'PODCAST_BED' | 'NEWS_STING';
export type GarageSamplerLayout = 'PLAY' | 'SLICE';
export type GarageSamplerMode = 'ONE_SHOT' | 'GATE' | 'LOOP';

export interface GarageSamplerSettings {
  layout: GarageSamplerLayout;
  /** Normalized audible window inside the source file. */
  start: number;
  end: number;
  /** MIDI note that plays the source at its original pitch. */
  rootNote: number;
  /** Fine musical tuning in semitones. */
  tune: number;
  attack: number;
  release: number;
  /** Friendly low-pass amount: 0 is dark, 1 is open. */
  filter: number;
  mode: GarageSamplerMode;
  /** Normalized boundaries, including 0 and 1, inside the audible window. */
  slicePoints: number[];
}

export const DEFAULT_SAMPLER_SETTINGS: Readonly<GarageSamplerSettings> = {
  layout: 'PLAY', start: 0, end: 1, rootNote: 60, tune: 0,
  attack: 0, release: .38, filter: 1, mode: 'ONE_SHOT',
  slicePoints: Array.from({ length: 17 }, (_, index) => index / 16),
};

export interface GarageSamplerPreset extends Base {
  storyId: string;
  name: string;
  sampleName: string;
  sourceAssetId: string;
  durationSec?: number;
  waveform?: number[];
  transientPoints?: number[];
  settings: GarageSamplerSettings;
}

export interface GarageArrangementSection {
  id: string;
  name: string;
  purpose: string;
  color: string;
  startBeat: number;
  durationBeats: number;
}

export interface GarageEffectSettings {
  /** The child-facing wet/strength control, from 0 to 1. */
  amount: number;
  /** Effect-specific second control: sensitivity, punch, size, repeats, speed or grit. */
  character: number;
  /** Chromatic key, C through B. Used by TUNE. */
  key: number;
  /** OpenDAW scale index. Used by TUNE. */
  scale: number;
}

/** A child-visible projection of a real OpenDAW NoteEventBox. */
export interface MidiNote {
  engineId: string;
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface AudioClip {
  id: string;
  engineId: string;
  name: string;
  source: ClipSource;
  /** Gate asset used to rebuild or turn this source into a sampler. */
  sourceAssetId?: string;
  /** Placement on the timeline, in seconds. */
  startSec: number;
  /** The original recording/file length, in seconds. */
  sourceDurationSec: number;
  /** The audible window inside the original file. */
  trimStartSec: number;
  trimEndSec: number;
  /** Empty for audio; populated from the OpenDAW event collection for instrument clips. */
  notes: MidiNote[];
  /** Small peak summary of the real source for timeline drawing. */
  waveform?: number[];
}

export interface AudioTrack {
  id: string;
  engineId: string;
  name: string;
  kind: GarageTrackKind;
  effects: GarageEffect[];
  effectSettings: Partial<Record<GarageEffect, GarageEffectSettings>>;
  voicePreset: GarageVoicePreset;
  /** What this track contributes, used by measured Mix Check stem comparisons. */
  contentRole?: GarageTrackContentRole;
  /** OpenDAW patch identity. Older projects omit this and receive a default in the UI. */
  instrumentPresetId?: string;
  /** Six normalized Smart Controls. Presets supply defaults for older projects. */
  instrumentControls?: GarageInstrumentControls;
  /** The adviser-supplied file currently loaded into a SAMPLER track. */
  sampleName?: string;
  /** Gate asset copied into the story when this sampler was created. */
  sampleAssetId?: string;
  /** Persisted instrument record used to rebuild this sampler after room or USB moves. */
  samplerPresetId?: string;
  sampleDurationSec?: number;
  /** Small peak summary for drawing the real source without keeping PCM in React state. */
  sampleWaveform?: number[];
  /** Detected full-source onset positions, normalized from 0 to 1. */
  sampleTransientPoints?: number[];
  samplerSettings?: GarageSamplerSettings;
  clips: AudioClip[];
  gain: number;
  pan: number;
  warmth: number;
  muted: boolean;
  soloed: boolean;
}

/** Durable editable Studio song; omitted storyId is a local scratch session. */
export interface StudioProject extends Base {
  storyId?: string;
  project: GarageProject;
}

export interface GarageProject {
  id: string;
  name: string;
  bpm: number;
  tracks: AudioTrack[];
  /** Linear master output gain. Older sessions restore at unity. */
  masterGain?: number;
  /** Optional so sessions made before the Song Map continue to open. */
  arrangementRecipeId?: GarageArrangementRecipeId;
  arrangement?: GarageArrangementSection[];
}

export interface NewAudioClip {
  engineId: string;
  name: string;
  source: ClipSource;
  sourceAssetId?: string;
  startSec: number;
  sourceDurationSec: number;
  notes?: MidiNote[];
  waveform?: number[];
}

export function emptyProject(name: string, bpm = 96): GarageProject {
  return { id: newId(), name, bpm, tracks: [] };
}

export function setProjectBpm(project: GarageProject, bpm: number): GarageProject {
  return { ...project, bpm: Math.round(clamp(bpm, 40, 240)) };
}

export function addTrack(
  project: GarageProject, name: string, engineId = newId(), kind: GarageTrackKind = 'AUDIO',
  instrumentPresetId?: string, instrumentControls?: GarageInstrumentControls,
): GarageProject {
  const track: AudioTrack = {
    id: newId(), engineId, name, kind, effects: [], effectSettings: {}, voicePreset: 'RAW',
    contentRole: kind === 'AUDIO' ? 'VOICE' : 'MUSIC',
    ...(instrumentPresetId ? { instrumentPresetId } : {}),
    ...(instrumentControls ? { instrumentControls: { ...instrumentControls } } : {}),
    clips: [], gain: 0.8, pan: 0, warmth: 0,
    muted: false, soloed: false,
  };
  return { ...project, tracks: [...project.tracks, track] };
}

export function addSamplerTrack(
  project: GarageProject, name: string, engineId: string, sampleName: string,
  options: {
    sourceAssetId?: string;
    presetId?: string;
    durationSec?: number;
    waveform?: number[];
    transientPoints?: number[];
    settings?: Partial<GarageSamplerSettings>;
  } = {},
): GarageProject {
  const samplerSettings = normalizeSamplerSettings({ ...DEFAULT_SAMPLER_SETTINGS, ...options.settings });
  const next = addTrack(project, name, engineId, 'SAMPLER', undefined, {
    tone: samplerSettings.filter, character: 0, attack: samplerSettings.attack,
    release: samplerSettings.release, motion: 0, width: .5,
  });
  const track = next.tracks.at(-1)!;
  return mapTrack(next, track.id, (current) => ({
    ...current, sampleName, samplerSettings,
    ...(options.sourceAssetId ? { sampleAssetId: options.sourceAssetId } : {}),
    ...(options.presetId ? { samplerPresetId: options.presetId } : {}),
    ...(options.durationSec !== undefined ? { sampleDurationSec: Math.max(0, options.durationSec) } : {}),
    ...(options.waveform ? { sampleWaveform: [...options.waveform] } : {}),
    ...(options.transientPoints ? { sampleTransientPoints: [...options.transientPoints] } : {}),
  }));
}

export function samplerSettingsFor(track: AudioTrack): GarageSamplerSettings {
  return normalizeSamplerSettings(track.samplerSettings ?? {
    ...DEFAULT_SAMPLER_SETTINGS,
    attack: track.instrumentControls?.attack ?? DEFAULT_SAMPLER_SETTINGS.attack,
    release: track.instrumentControls?.release ?? DEFAULT_SAMPLER_SETTINGS.release,
    filter: track.instrumentControls?.tone ?? DEFAULT_SAMPLER_SETTINGS.filter,
  });
}

export function setSamplerSettings(
  project: GarageProject, trackId: string, patch: Partial<GarageSamplerSettings>,
): GarageProject {
  return mapTrack(project, trackId, (track) => {
    if (track.kind !== 'SAMPLER') throw new Error('Choose a sampler track before shaping a sample.');
    const settings = normalizeSamplerSettings({ ...samplerSettingsFor(track), ...patch });
    return {
      ...track,
      samplerSettings: settings,
      instrumentControls: {
        ...(track.instrumentControls ?? { tone: 1, character: 0, attack: 0, release: .38, motion: 0, width: .5 }),
        tone: settings.filter, attack: settings.attack, release: settings.release,
      },
    };
  });
}

function normalizeSamplerSettings(settings: GarageSamplerSettings): GarageSamplerSettings {
  const start = clamp(settings.start, 0, .99);
  const end = clamp(settings.end, start + .01, 1);
  const normalizedSlices = [...new Set(settings.slicePoints.map((point) => clamp(point, 0, 1)))]
    .concat([0, 1])
    .sort((a, b) => a - b)
    .filter((point, index, points) => index === 0 || Math.abs(point - points[index - 1]!) >= .005);
  const slicePoints = normalizedSlices.length <= 17
    ? normalizedSlices
    : [0, ...normalizedSlices.slice(1, -1).slice(0, 15), 1];
  return {
    layout: settings.layout === 'SLICE' ? 'SLICE' : 'PLAY',
    start,
    end,
    rootNote: Math.round(clamp(settings.rootNote, 12, 115)),
    tune: clamp(settings.tune, -12, 12),
    attack: clamp(settings.attack, 0, 1),
    release: clamp(settings.release, 0, 1),
    filter: clamp(settings.filter, 0, 1),
    mode: settings.mode === 'GATE' || settings.mode === 'LOOP' ? settings.mode : 'ONE_SHOT',
    slicePoints,
  };
}

export function setInstrumentPreset(
  project: GarageProject, trackId: string, presetId: string, kind: Exclude<GarageTrackKind, 'AUDIO' | 'SAMPLER'>,
  controls: GarageInstrumentControls,
): GarageProject {
  return mapTrack(project, trackId, (track) => {
    if (track.kind === 'AUDIO') throw new Error('Audio tracks do not hold software instruments.');
    if (track.kind === 'SAMPLER') throw new Error('A sampler keeps its loaded sound. Load another sample from the Sound Shelf instead.');
    return { ...track, kind, instrumentPresetId: presetId, instrumentControls: { ...controls } };
  });
}

export function setInstrumentControl(
  project: GarageProject, trackId: string, control: GarageInstrumentControl, value: number,
): GarageProject {
  return mapTrack(project, trackId, (track) => {
    if (track.kind === 'AUDIO') throw new Error('Audio tracks do not hold software instruments.');
    const current: GarageInstrumentControls = track.instrumentControls ?? {
      tone: .5, character: .5, attack: .05, release: .3, motion: 0, width: .25,
    };
    return { ...track, instrumentControls: { ...current, [control]: clamp(value, 0, 1) } };
  });
}

function mapTrack(
  project: GarageProject, trackId: string, change: (track: AudioTrack) => AudioTrack,
): GarageProject {
  if (!project.tracks.some((track) => track.id === trackId)) {
    throw new Error(`no track ${trackId}`);
  }
  return { ...project, tracks: project.tracks.map((track) => track.id === trackId ? change(track) : track) };
}

export function addAudioClip(project: GarageProject, trackId: string, clip: NewAudioClip): GarageProject {
  const duration = Math.max(0.01, clip.sourceDurationSec);
  return mapTrack(project, trackId, (track) => ({
    ...track,
    clips: [...track.clips, {
      ...clip, id: newId(), startSec: Math.max(0, clip.startSec),
      sourceDurationSec: duration, trimStartSec: 0, trimEndSec: duration,
      notes: clip.notes ?? [],
    }],
  }));
}

function mapClip(
  project: GarageProject, clipEngineId: string, change: (clip: AudioClip) => AudioClip,
): GarageProject {
  if (!project.tracks.some((track) => track.clips.some((clip) => clip.engineId === clipEngineId))) {
    throw new Error(`no clip ${clipEngineId}`);
  }
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.engineId === clipEngineId ? change(clip) : clip),
    })),
  };
}

export function addMidiNote(project: GarageProject, clipEngineId: string, note: MidiNote): GarageProject {
  return mapClip(project, clipEngineId, (clip) => ({ ...clip, notes: [...clip.notes, note] }));
}

export function removeMidiNote(project: GarageProject, clipEngineId: string, noteEngineId: string): GarageProject {
  return mapClip(project, clipEngineId, (clip) => ({
    ...clip, notes: clip.notes.filter((note) => note.engineId !== noteEngineId),
  }));
}

export function updateMidiNote(
  project: GarageProject,
  clipEngineId: string,
  noteEngineId: string,
  patch: Partial<Omit<MidiNote, 'engineId'>>,
): GarageProject {
  return mapClip(project, clipEngineId, (clip) => ({
    ...clip,
    notes: clip.notes.map((note) => note.engineId === noteEngineId ? {
      ...note,
      ...patch,
      pitch: Math.round(clamp(patch.pitch ?? note.pitch, 0, 127)),
      startBeat: Math.max(0, patch.startBeat ?? note.startBeat),
      durationBeats: Math.max(0.0625, patch.durationBeats ?? note.durationBeats),
      velocity: clamp(patch.velocity ?? note.velocity, 0.01, 1),
    } : note),
  }));
}

export function replaceMidiNotes(
  project: GarageProject, clipEngineId: string, notes: ReadonlyArray<MidiNote>,
): GarageProject {
  return mapClip(project, clipEngineId, (clip) => ({ ...clip, notes: [...notes] }));
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return Math.max(0, beats) * 60 / Math.max(1, bpm);
}

export function secondsToBeats(seconds: number, bpm: number): number {
  return Math.max(0, seconds) * Math.max(1, bpm) / 60;
}

export function removeClip(project: GarageProject, trackId: string, clipId: string): GarageProject {
  return mapTrack(project, trackId, (track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== clipId) }));
}

export function moveClip(project: GarageProject, trackId: string, clipId: string, startSec: number): GarageProject {
  return mapTrack(project, trackId, (track) => ({
    ...track,
    clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, startSec: Math.max(0, startSec) } : clip),
  }));
}

export function trimClip(
  project: GarageProject, trackId: string, clipId: string, trimStartSec: number, trimEndSec: number,
): GarageProject {
  return mapTrack(project, trackId, (track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId) return clip;
      const start = Math.max(0, Math.min(trimStartSec, clip.sourceDurationSec - 0.01));
      const end = Math.max(start + 0.01, Math.min(trimEndSec, clip.sourceDurationSec));
      return { ...clip, trimStartSec: start, trimEndSec: end };
    }),
  }));
}

export function resizeInstrumentClip(
  project: GarageProject, trackId: string, clipId: string, durationSec: number,
): GarageProject {
  return mapTrack(project, trackId, (track) => ({
    ...track,
    clips: track.clips.map((clip) => clip.id === clipId && clip.source === 'INSTRUMENT'
      ? {
        ...clip,
        sourceDurationSec: Math.max(0.01, durationSec),
        trimStartSec: 0,
        trimEndSec: Math.max(0.01, durationSec),
      }
      : clip),
  }));
}

export function setTrackGain(project: GarageProject, trackId: string, gain: number): GarageProject {
  return mapTrack(project, trackId, (track) => ({ ...track, gain: clamp(gain, 0, 1) }));
}

export function setTrackPan(project: GarageProject, trackId: string, pan: number): GarageProject {
  return mapTrack(project, trackId, (track) => ({ ...track, pan: clamp(pan, -1, 1) }));
}

export function setTrackContentRole(project: GarageProject, trackId: string, contentRole: GarageTrackContentRole): GarageProject {
  return mapTrack(project, trackId, (track) => ({ ...track, contentRole }));
}

export function setTrackWarmth(project: GarageProject, trackId: string, warmth: number): GarageProject {
  return mapTrack(project, trackId, (track) => ({ ...track, warmth: clamp(warmth, 0, 1) }));
}

export function addEffect(project: GarageProject, trackId: string, effect: GarageEffect): GarageProject {
  return mapTrack(project, trackId, (track) => ({
    ...track,
    effects: track.effects.includes(effect) ? track.effects : [...track.effects, effect],
    effectSettings: track.effectSettings[effect]
      ? track.effectSettings
      : { ...track.effectSettings, [effect]: defaultEffectSettings(effect) },
    voicePreset: 'CUSTOM',
  }));
}

export function removeEffect(project: GarageProject, trackId: string, effect: GarageEffect): GarageProject {
  return mapTrack(project, trackId, (track) => ({
    ...track, effects: track.effects.filter((current) => current !== effect), voicePreset: 'CUSTOM',
  }));
}

export function defaultEffectSettings(effect: GarageEffect): GarageEffectSettings {
  const amount = effect === 'CLEANUP' ? 0.42
    : effect === 'VOICE_SHINE' ? 0.55
      : effect === 'SPACE' ? 0.2
        : effect === 'ECHO' ? 0.18
          : effect === 'TUNE' ? 0.65
            : 0.35;
  return { amount, character: 0.5, key: 0, scale: 1 };
}

export function effectSettingsFor(track: AudioTrack, effect: GarageEffect): GarageEffectSettings {
  return track.effectSettings[effect] ?? defaultEffectSettings(effect);
}

export function setEffectSettings(
  project: GarageProject,
  trackId: string,
  effect: GarageEffect,
  patch: Partial<GarageEffectSettings>,
): GarageProject {
  return mapTrack(project, trackId, (track) => {
    const current = effectSettingsFor(track, effect);
    return {
      ...track,
      effectSettings: {
        ...track.effectSettings,
        [effect]: {
          amount: clamp(patch.amount ?? current.amount, 0, 1),
          character: clamp(patch.character ?? current.character, 0, 1),
          key: Math.round(clamp(patch.key ?? current.key, 0, 11)),
          scale: Math.round(clamp(patch.scale ?? current.scale, 0, 7)),
        },
      },
      voicePreset: 'CUSTOM',
    };
  });
}

const VOICE_PRESETS: Record<Exclude<GarageVoicePreset, 'CUSTOM'>, Partial<Record<GarageEffect, Partial<GarageEffectSettings>>>> = {
  RAW: {},
  NEWS_VOICE: { CLEANUP: { amount: 0.46, character: 0.42 }, VOICE_SHINE: { amount: 0.64, character: 0.55 } },
  WARM_STORY: { CLEANUP: { amount: 0.3, character: 0.3 }, VOICE_SHINE: { amount: 0.48, character: 0.3 }, SPACE: { amount: 0.17, character: 0.35 } },
  BIG_SCENE: { VOICE_SHINE: { amount: 0.56, character: 0.58 }, SPACE: { amount: 0.43, character: 0.78 }, ECHO: { amount: 0.2, character: 0.36 } },
  TUNED: { CLEANUP: { amount: 0.24, character: 0.34 }, VOICE_SHINE: { amount: 0.43, character: 0.46 }, TUNE: { amount: 0.72, character: 0.72 } },
  RADIO: { CLEANUP: { amount: 0.34, character: 0.5 }, VOICE_SHINE: { amount: 0.7, character: 0.7 }, ROBOT: { amount: 0.34, character: 0.42 } },
};

export function applyVoicePreset(
  project: GarageProject, trackId: string, preset: Exclude<GarageVoicePreset, 'CUSTOM'>,
): GarageProject {
  return mapTrack(project, trackId, (track) => {
    const recipe = VOICE_PRESETS[preset];
    const effects = Object.keys(recipe) as GarageEffect[];
    const effectSettings = { ...track.effectSettings };
    effects.forEach((effect) => {
      effectSettings[effect] = { ...defaultEffectSettings(effect), ...recipe[effect] };
    });
    return { ...track, effects, effectSettings, voicePreset: preset };
  });
}

export function toggleMute(project: GarageProject, trackId: string): GarageProject {
  return mapTrack(project, trackId, (track) => ({ ...track, muted: !track.muted }));
}

export function toggleSolo(project: GarageProject, trackId: string): GarageProject {
  return mapTrack(project, trackId, (track) => ({ ...track, soloed: !track.soloed }));
}

export function audibleTracks(project: GarageProject): AudioTrack[] {
  const anySoloed = project.tracks.some((track) => track.soloed);
  return project.tracks.filter((track) => !track.muted && (!anySoloed || track.soloed));
}

export function clipDuration(clip: AudioClip): number {
  return clip.trimEndSec - clip.trimStartSec;
}

export function projectSeconds(project: GarageProject): number {
  return project.tracks.flatMap((track) => track.clips)
    .reduce((last, clip) => Math.max(last, clip.startSec + clipDuration(clip)), 0);
}

export function formatSeconds(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
