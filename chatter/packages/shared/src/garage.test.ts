import { describe, expect, test } from 'vitest';
import {
  emptyProject, addTrack, addSamplerTrack, addAudioClip, moveClip, trimClip, removeClip,
  setTrackGain, setTrackPan, setTrackWarmth, toggleMute, toggleSolo,
  addEffect, removeEffect, audibleTracks, clipDuration, projectSeconds, formatSeconds,
  addMidiNote, removeMidiNote, updateMidiNote, replaceMidiNotes, beatsToSeconds, secondsToBeats,
  applyVoicePreset, effectSettingsFor, setEffectSettings, setInstrumentControl, setInstrumentPreset,
  samplerSettingsFor, setSamplerSettings,
} from './garage.js';
import { GARAGE_INSTRUMENT_PRESETS, instrumentPreset } from './garage-instruments.js';

describe('an audio-first Studio project', () => {
  test('starts with no tracks or made-up loop content', () => {
    const project = emptyProject('Taco bar bed');
    expect(project.tracks).toHaveLength(0);
    expect(project.bpm).toBe(96);
  });

  test('adds a named audio track backed by an engine id', () => {
    const project = addTrack(emptyProject('bed'), 'Host', 'opendaw-host');
    expect(project.tracks[0]).toMatchObject({ name: 'Host', engineId: 'opendaw-host', kind: 'AUDIO', effects: [], effectSettings: {}, voicePreset: 'RAW', clips: [] });
  });

  test('records whether a track is an audio, keys, bass, or pad tool', () => {
    const project = addTrack(emptyProject('bed'), 'Keys', 'keys-1', 'KEYS');
    expect(project.tracks[0]!.kind).toBe('KEYS');
  });

  test('keeps a loaded sample as a playable instrument track', () => {
    let project = addSamplerTrack(emptyProject('bed'), 'Bell sampler', 'nano-1', 'school-bell.wav', {
      sourceAssetId: 'asset-bell', durationSec: 1.4, waveform: [0.1, 0.8, 0.35],
    });
    const track = project.tracks[0]!;
    project = addAudioClip(project, track.id, {
      engineId: 'notes-1', name: 'Bell idea', source: 'INSTRUMENT', startSec: 0, sourceDurationSec: 4,
      notes: [{ engineId: 'note-1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
    });
    expect(project.tracks[0]).toMatchObject({
      kind: 'SAMPLER', sampleName: 'school-bell.wav', sampleAssetId: 'asset-bell', sampleDurationSec: 1.4,
      sampleWaveform: [0.1, 0.8, 0.35],
    });
    expect(samplerSettingsFor(project.tracks[0]!)).toMatchObject({
      layout: 'PLAY', start: 0, end: 1, rootNote: 60, tune: 0, mode: 'ONE_SHOT',
    });
    expect(project.tracks[0]!.clips[0]!.notes[0]).toMatchObject({ pitch: 60, velocity: 0.8 });
  });

  test('does not replace a loaded sample with a synth preset', () => {
    const project = addSamplerTrack(emptyProject('bed'), 'Bell sampler', 'nano-1', 'school-bell.wav');
    expect(() => setInstrumentPreset(project, project.tracks[0]!.id, 'keys-bright-room', 'KEYS', {
      tone: .5, character: .5, attack: .1, release: .5, motion: 0, width: .3,
    })).toThrow(/sampler/i);
  });

  test('keeps sampler shaping in playable ranges and ordered slice points', () => {
    let project = addSamplerTrack(emptyProject('bed'), 'Bell sampler', 'sampler-1', 'school-bell.wav');
    const trackId = project.tracks[0]!.id;
    project = setSamplerSettings(project, trackId, {
      layout: 'SLICE', start: .8, end: .2, rootNote: 140, tune: -20,
      attack: 2, release: -1, filter: 4, mode: 'LOOP', slicePoints: [1, .5, -.2, .5, .2, 0],
    });
    expect(samplerSettingsFor(project.tracks[0]!)).toEqual({
      layout: 'SLICE', start: .8, end: .81, rootNote: 115, tune: -12,
      attack: 1, release: 0, filter: 1, mode: 'LOOP', slicePoints: [0, .2, .5, 1],
    });
  });

  test('places a recording as an audio clip measured in seconds', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    project = addAudioClip(project, project.tracks[0]!.id, {
      engineId: 'region-1', name: 'intro.webm', source: 'RECORDING', startSec: 3, sourceDurationSec: 12.4,
    });
    expect(project.tracks[0]!.clips[0]).toMatchObject({ startSec: 3, trimStartSec: 0, trimEndSec: 12.4 });
  });

  test('refuses to place a clip on a missing track', () => {
    expect(() => addAudioClip(emptyProject('bed'), 'nope', {
      engineId: 'region-1', name: 'voice.wav', source: 'IMPORT', startSec: 0, sourceDurationSec: 3,
    })).toThrow(/track/i);
  });

  test('moves a clip but never before the start of the timeline', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const trackId = project.tracks[0]!.id;
    project = addAudioClip(project, trackId, { engineId: 'r', name: 'voice', source: 'RECORDING', startSec: 2, sourceDurationSec: 3 });
    project = moveClip(project, trackId, project.tracks[0]!.clips[0]!.id, -5);
    expect(project.tracks[0]!.clips[0]!.startSec).toBe(0);
  });

  test('trims the audible part of a clip without changing its source file', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const trackId = project.tracks[0]!.id;
    project = addAudioClip(project, trackId, { engineId: 'r', name: 'voice', source: 'IMPORT', startSec: 0, sourceDurationSec: 10 });
    project = trimClip(project, trackId, project.tracks[0]!.clips[0]!.id, 1.5, 6);
    const clip = project.tracks[0]!.clips[0]!;
    expect(clip).toMatchObject({ sourceDurationSec: 10, trimStartSec: 1.5, trimEndSec: 6 });
    expect(clipDuration(clip)).toBe(4.5);
  });

  test('keeps a tiny audible window when a trim crosses itself', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const trackId = project.tracks[0]!.id;
    project = addAudioClip(project, trackId, { engineId: 'r', name: 'voice', source: 'IMPORT', startSec: 0, sourceDurationSec: 10 });
    project = trimClip(project, trackId, project.tracks[0]!.clips[0]!.id, 9, 2);
    expect(clipDuration(project.tracks[0]!.clips[0]!)).toBeGreaterThan(0);
  });

  test('removes a clip without removing the rest of its track', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const trackId = project.tracks[0]!.id;
    project = addAudioClip(project, trackId, { engineId: 'a', name: 'one', source: 'IMPORT', startSec: 0, sourceDurationSec: 3 });
    project = addAudioClip(project, trackId, { engineId: 'b', name: 'two', source: 'IMPORT', startSec: 3, sourceDurationSec: 3 });
    project = removeClip(project, trackId, project.tracks[0]!.clips[0]!.id);
    expect(project.tracks[0]!.clips.map((clip) => clip.engineId)).toEqual(['b']);
  });
});

describe('the Studio mixer', () => {
  test('keeps volume, pan and warmth on each individual audio track', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const id = project.tracks[0]!.id;
    project = setTrackGain(project, id, 0.4);
    project = setTrackPan(project, id, -0.3);
    project = setTrackWarmth(project, id, 0.7);
    expect(project.tracks[0]).toMatchObject({ gain: 0.4, pan: -0.3, warmth: 0.7 });
  });

  test('clamps mixer values to meaningful ranges', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const id = project.tracks[0]!.id;
    expect(setTrackGain(project, id, 9).tracks[0]!.gain).toBe(1);
    expect(setTrackPan(project, id, -9).tracks[0]!.pan).toBe(-1);
    expect(setTrackWarmth(project, id, -1).tracks[0]!.warmth).toBe(0);
  });

  test('keeps a small, non-duplicated effect rack on each track', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const id = project.tracks[0]!.id;
    project = addEffect(project, id, 'SPACE');
    project = addEffect(project, id, 'SPACE');
    project = addEffect(project, id, 'VOICE_SHINE');
    expect(project.tracks[0]!.effects).toEqual(['SPACE', 'VOICE_SHINE']);
    expect(removeEffect(project, id, 'SPACE').tracks[0]!.effects).toEqual(['VOICE_SHINE']);
  });

  test('stores friendly effect controls and clamps them safely', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const id = project.tracks[0]!.id;
    project = addEffect(project, id, 'TUNE');
    project = setEffectSettings(project, id, 'TUNE', { amount: 9, character: -2, key: 14, scale: 3 });
    expect(effectSettingsFor(project.tracks[0]!, 'TUNE')).toEqual({ amount: 1, character: 0, key: 11, scale: 3 });
    expect(project.tracks[0]!.voicePreset).toBe('CUSTOM');
  });

  test('applies a complete vocal recipe without stacking old effects', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const id = project.tracks[0]!.id;
    project = addEffect(project, id, 'ROBOT');
    project = applyVoicePreset(project, id, 'NEWS_VOICE');
    expect(project.tracks[0]!.effects).toEqual(['CLEANUP', 'VOICE_SHINE']);
    expect(project.tracks[0]!.voicePreset).toBe('NEWS_VOICE');
    expect(effectSettingsFor(project.tracks[0]!, 'VOICE_SHINE').amount).toBe(0.64);
  });

  test('mute and solo decide which tracks are heard', () => {
    let project = addTrack(addTrack(emptyProject('bed'), 'Host'), 'Music');
    project = toggleMute(project, project.tracks[0]!.id);
    expect(audibleTracks(project).map((track) => track.name)).toEqual(['Music']);
    project = toggleSolo(project, project.tracks[1]!.id);
    expect(audibleTracks(project).map((track) => track.name)).toEqual(['Music']);
  });
});

describe('the audio timeline', () => {
  test('ends where the last trimmed clip ends', () => {
    let project = addTrack(emptyProject('bed'), 'Host');
    const id = project.tracks[0]!.id;
    project = addAudioClip(project, id, { engineId: 'a', name: 'intro', source: 'IMPORT', startSec: 2, sourceDurationSec: 5 });
    project = addAudioClip(project, id, { engineId: 'b', name: 'outro', source: 'IMPORT', startSec: 12, sourceDurationSec: 8 });
    project = trimClip(project, id, project.tracks[0]!.clips[1]!.id, 0, 4);
    expect(projectSeconds(project)).toBe(16);
  });

  test('formats timeline time for a child to read', () => {
    expect(formatSeconds(65)).toBe('1:05');
  });
});

describe('the instrument editor', () => {
  test('offers a real sound shelf across every playable category', () => {
    expect(GARAGE_INSTRUMENT_PRESETS).toHaveLength(24);
    expect(new Set(GARAGE_INSTRUMENT_PRESETS.map((preset) => preset.category))).toEqual(
      new Set(['KEYS', 'SYNTH', 'BASS', 'PAD', 'DRUMS']),
    );
  });

  test('gives every drum kit a complete, labeled 16-pad bank', () => {
    const kits = GARAGE_INSTRUMENT_PRESETS.filter((preset) => preset.category === 'DRUMS');
    expect(kits).toHaveLength(4);
    kits.forEach((kit) => {
      expect(kit.padNames).toHaveLength(16);
      expect(new Set(kit.padNames).size).toBe(16);
      expect(kit.patch.kit).toBeGreaterThanOrEqual(0);
    });
  });

  test('changes an instrument without throwing away the performance', () => {
    const first = instrumentPreset('studio-keys');
    const next = instrumentPreset('pop-lead');
    let project = addTrack(emptyProject('song'), 'Keys', 'keys-1', first.kind, first.id, first.controls);
    const trackId = project.tracks[0]!.id;
    project = addAudioClip(project, trackId, {
      engineId: 'region-1', name: 'Chorus', source: 'INSTRUMENT', startSec: 0, sourceDurationSec: 8,
      notes: [{ engineId: 'note-1', pitch: 64, startBeat: 0, durationBeats: 1, velocity: .8 }],
    });
    project = setInstrumentPreset(project, trackId, next.id, next.kind, next.controls);
    expect(project.tracks[0]).toMatchObject({ instrumentPresetId: 'pop-lead', clips: [{ notes: [{ engineId: 'note-1' }] }] });
  });

  test('stores Smart Controls and keeps them in their playable range', () => {
    const preset = instrumentPreset('deep-sub');
    let project = addTrack(emptyProject('song'), 'Bass', 'bass-1', preset.kind, preset.id, preset.controls);
    const trackId = project.tracks[0]!.id;
    project = setInstrumentControl(project, trackId, 'tone', 4);
    project = setInstrumentControl(project, trackId, 'width', -2);
    expect(project.tracks[0]!.instrumentControls).toMatchObject({ tone: 1, width: 0 });
  });

  test('keeps visible notes tied to their real OpenDAW event ids', () => {
    let project = addTrack(emptyProject('song'), 'Keys', 'keys-1', 'KEYS');
    const trackId = project.tracks[0]!.id;
    project = addAudioClip(project, trackId, {
      engineId: 'region-1', name: 'Keys clip', source: 'INSTRUMENT', startSec: 0, sourceDurationSec: 10,
    });
    project = addMidiNote(project, 'region-1', {
      engineId: 'note-1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8,
    });
    expect(project.tracks[0]!.clips[0]!.notes).toEqual([
      { engineId: 'note-1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
    ]);
    project = removeMidiNote(project, 'region-1', 'note-1');
    expect(project.tracks[0]!.clips[0]!.notes).toEqual([]);
  });

  test('moves, resizes and changes the dynamics of an existing note', () => {
    let project = addTrack(emptyProject('song'), 'Keys', 'keys-1', 'KEYS');
    const trackId = project.tracks[0]!.id;
    project = addAudioClip(project, trackId, {
      engineId: 'region-1', name: 'Keys clip', source: 'INSTRUMENT', startSec: 0, sourceDurationSec: 10,
      notes: [{ engineId: 'note-1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.5 }],
    });
    project = updateMidiNote(project, 'region-1', 'note-1', {
      pitch: 64, startBeat: 2.5, durationBeats: 1.5, velocity: 0.9,
    });
    expect(project.tracks[0]!.clips[0]!.notes[0]).toMatchObject({
      pitch: 64, startBeat: 2.5, durationBeats: 1.5, velocity: 0.9,
    });
    project = replaceMidiNotes(project, 'region-1', []);
    expect(project.tracks[0]!.clips[0]!.notes).toEqual([]);
  });

  test('converts the arrangement between beat time and wall-clock time', () => {
    expect(beatsToSeconds(16, 120)).toBe(8);
    expect(secondsToBeats(8, 120)).toBe(16);
  });
});
