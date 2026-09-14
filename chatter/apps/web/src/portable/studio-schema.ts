import type { StudioProject } from '@chatter/shared';

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 10_000; }
function numberIn(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function integerIn(value: unknown, min: number, max: number): value is number { return numberIn(value, min, max) && Number.isInteger(value); }

const MAX_SONG_SECONDS = 15 * 60;
const MAX_SONG_BEATS = MAX_SONG_SECONDS * 240 / 60;
const MAX_TRACKS = 128;
const MAX_CLIPS = 5_000;
const MAX_NOTES = 100_000;
const MAX_WAVEFORM_POINTS = 200_000;
const MAX_POINTS_PER_WAVEFORM = 20_000;
const CONTROL_KEYS = ['tone', 'character', 'attack', 'release', 'motion', 'width'] as const;
const KINDS = ['AUDIO', 'KEYS', 'BASS', 'PAD', 'DRUMS', 'SAMPLER'];
const EFFECTS = ['CLEANUP', 'VOICE_SHINE', 'SPACE', 'ECHO', 'TUNE', 'ROBOT'];

function normalizedPoints(value: unknown, limit: number): value is number[] {
  return Array.isArray(value) && value.length <= limit && value.every((point) => numberIn(point, 0, 1));
}

/** Validate the whole song before import allocates identities, media, or records. */
export function isPortableStudioRecord(value: unknown): value is StudioProject {
  if (!object(value) || !object(value.project)) return false;
  const project = value.project;
  if (!text(project.id) || !text(project.name) || !numberIn(project.bpm, 40, 240) || (project.masterGain !== undefined && !numberIn(project.masterGain, 0, 1)) || !Array.isArray(project.tracks) || project.tracks.length > MAX_TRACKS) return false;
  if (project.arrangement !== undefined && (!Array.isArray(project.arrangement) || project.arrangement.length > 500 || !project.arrangement.every((part) => object(part) && text(part.id) && text(part.name) && text(part.purpose) && text(part.color) && numberIn(part.startBeat, 0, MAX_SONG_BEATS) && numberIn(part.durationBeats, 0.0001, MAX_SONG_BEATS) && part.startBeat + part.durationBeats <= MAX_SONG_BEATS))) return false;

  let clipCount = 0;
  let noteCount = 0;
  let waveformPoints = 0;
  for (const track of project.tracks) {
    if (!object(track) || !text(track.id) || !text(track.engineId) || !text(track.name) || !KINDS.includes(String(track.kind))) return false;
    if (!numberIn(track.gain, 0, 1) || !numberIn(track.pan, -1, 1) || !numberIn(track.warmth, 0, 1) || typeof track.muted !== 'boolean' || typeof track.soloed !== 'boolean') return false;
    if (!Array.isArray(track.effects) || track.effects.length > EFFECTS.length || !track.effects.every((effect) => EFFECTS.includes(String(effect))) || !object(track.effectSettings)) return false;
    if (!Object.entries(track.effectSettings).every(([effect, settings]) => EFFECTS.includes(effect) && object(settings) && numberIn(settings.amount, 0, 1) && numberIn(settings.character, 0, 1) && integerIn(settings.key, 0, 11) && integerIn(settings.scale, 0, 7))) return false;
    if (track.instrumentControls !== undefined) {
      const controls = track.instrumentControls;
      if (!object(controls) || Object.keys(controls).length !== CONTROL_KEYS.length || !CONTROL_KEYS.every((key) => numberIn(controls[key], 0, 1))) return false;
    }
    if (track.kind === 'SAMPLER' && !text(track.sampleAssetId)) return false;
    if (track.sampleDurationSec !== undefined && !numberIn(track.sampleDurationSec, 0, MAX_SONG_SECONDS)) return false;
    if (track.sampleWaveform !== undefined) {
      if (!normalizedPoints(track.sampleWaveform, MAX_POINTS_PER_WAVEFORM)) return false;
      waveformPoints += track.sampleWaveform.length;
    }
    if (track.sampleTransientPoints !== undefined && !normalizedPoints(track.sampleTransientPoints, 2_048)) return false;
    if (track.samplerSettings !== undefined) {
      const settings = track.samplerSettings;
      if (!object(settings) || !['PLAY', 'SLICE'].includes(String(settings.layout)) || !['ONE_SHOT', 'GATE', 'LOOP'].includes(String(settings.mode)) || !numberIn(settings.start, 0, 0.99) || !numberIn(settings.end, 0.01, 1) || settings.end <= settings.start || !integerIn(settings.rootNote, 12, 115) || !numberIn(settings.tune, -12, 12) || !numberIn(settings.attack, 0, 1) || !numberIn(settings.release, 0, 1) || !numberIn(settings.filter, 0, 1) || !normalizedPoints(settings.slicePoints, 2_048)) return false;
    }
    if (!Array.isArray(track.clips)) return false;
    clipCount += track.clips.length;
    if (clipCount > MAX_CLIPS) return false;
    for (const clip of track.clips) {
      if (!object(clip) || !text(clip.id) || !text(clip.engineId) || !text(clip.name) || !['RECORDING', 'IMPORT', 'BOOTH', 'INSTRUMENT'].includes(String(clip.source)) || (clip.source !== 'INSTRUMENT' && !text(clip.sourceAssetId))) return false;
      if (!numberIn(clip.startSec, 0, MAX_SONG_SECONDS) || !numberIn(clip.sourceDurationSec, 0.01, MAX_SONG_SECONDS) || !numberIn(clip.trimStartSec, 0, clip.sourceDurationSec) || !numberIn(clip.trimEndSec, 0.01, clip.sourceDurationSec) || clip.trimEndSec <= clip.trimStartSec || clip.startSec + (clip.trimEndSec - clip.trimStartSec) > MAX_SONG_SECONDS) return false;
      if (clip.waveform !== undefined) {
        if (!normalizedPoints(clip.waveform, MAX_POINTS_PER_WAVEFORM)) return false;
        waveformPoints += clip.waveform.length;
      }
      if (waveformPoints > MAX_WAVEFORM_POINTS || !Array.isArray(clip.notes)) return false;
      noteCount += clip.notes.length;
      if (noteCount > MAX_NOTES) return false;
      const maxClipBeats = clip.sourceDurationSec * project.bpm / 60;
      if (!clip.notes.every((note) => object(note) && text(note.engineId) && integerIn(note.pitch, 0, 127) && numberIn(note.startBeat, 0, maxClipBeats) && numberIn(note.durationBeats, 0.0001, maxClipBeats) && note.startBeat + note.durationBeats <= maxClipBeats && numberIn(note.velocity, 0.0001, 1))) return false;
    }
  }
  return true;
}
