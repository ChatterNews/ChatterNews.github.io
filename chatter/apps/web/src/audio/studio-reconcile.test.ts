import { expect, it, vi } from 'vitest';
import {
  addAudioClip, addSamplerTrack, addTrack, copyStudioClips, defaultInstrumentPreset,
  emptyProject, pasteStudioClips, type MidiNote,
} from '@chatter/shared';
import { reconcileStudioProject, type StudioSyncEngine } from './studio-reconcile.js';

function song() {
  const preset = defaultInstrumentPreset('KEYS')!;
  let project = addTrack(emptyProject('Song'), 'Keys', 'track-engine', 'KEYS', preset.id, preset.controls);
  project = addAudioClip(project, project.tracks[0]!.id, {
    engineId: 'original', name: 'Phrase', source: 'INSTRUMENT', startSec: 0, sourceDurationSec: 4,
    notes: [{ engineId: 'note', pitch: 60, startBeat: 0, durationBeats: 1, velocity: .8 }],
  });
  return project;
}

function fakeEngine() {
  return {
    setBpm: vi.fn(), setMasterGain: vi.fn(), setTrackMix: vi.fn(), setEffect: vi.fn(), setTrackName: vi.fn(),
    setInstrumentControls: vi.fn(), setInstrumentPreset: vi.fn(async () => {}), setSamplerSettings: vi.fn(),
    addTrack: vi.fn(async () => 'new-track'), addSamplerTrack: vi.fn(async () => 'new-sampler'),
    moveClipToTrack: vi.fn(), moveClip: vi.fn(), trimClip: vi.fn(), removeClip: vi.fn(), removeTrack: vi.fn(),
    createMidiClip: vi.fn(() => ({ engineId: 'copy-engine', name: 'Phrase', durationSec: 4 })),
    replaceMidiNotes: vi.fn((_id: string, notes: Omit<MidiNote, 'engineId'>[]) => notes.map((note) => ({ ...note, engineId: 'copy-note' }))),
    importAudio: vi.fn(async () => ({ engineId: 'audio-engine', name: 'Voice', durationSec: 4 })),
  } satisfies StudioSyncEngine;
}

const noAudio = async () => { throw new Error('unexpected audio load'); };

it('duplicates MIDI independently without rewriting the source or resetting its instrument and mix', async () => {
  const project = song();
  const target = pasteStudioClips(project, copyStudioClips(project, [project.tracks[0]!.clips[0]!.id]), 4);
  const engine = fakeEngine();
  const next = await reconcileStudioProject(engine, project, target, noAudio);
  expect(next.tracks[0]!.clips.map((clip) => clip.engineId)).toEqual(['original', 'copy-engine']);
  expect(engine.replaceMidiNotes).toHaveBeenCalledExactlyOnceWith('copy-engine', target.tracks[0]!.clips[1]!.notes);
  expect(next.tracks[0]!.clips[1]!.notes[0]!.engineId).toBe('copy-note');
  expect(engine.trimClip).toHaveBeenCalledExactlyOnceWith('copy-engine', 0, 4);
  expect(engine.moveClip).not.toHaveBeenCalled();
  expect(engine.setInstrumentControls).not.toHaveBeenCalled();
  expect(engine.setTrackMix).not.toHaveBeenCalled();
  expect(engine.setBpm).not.toHaveBeenCalled();
  expect(engine.setMasterGain).not.toHaveBeenCalled();
  expect(project.tracks[0]!.clips).toHaveLength(1);
});

it('does no engine work for a restored snapshot with identical music and different runtime IDs', async () => {
  const project = song();
  const target = structuredClone(project);
  target.tracks[0]!.engineId = 'stale-track';
  target.tracks[0]!.clips[0]!.engineId = 'stale-clip';
  target.tracks[0]!.clips[0]!.notes[0]!.engineId = 'stale-note';
  const engine = fakeEngine();
  const next = await reconcileStudioProject(engine, project, target, noAudio);
  expect(next).toEqual(project);
  for (const method of Object.values(engine)) expect(method).not.toHaveBeenCalled();
});

it('applies a fader change only to the affected track', async () => {
  const project = addTrack(song(), 'Voice', 'voice-track');
  const target = structuredClone(project);
  target.tracks[0]!.gain = .4;
  const engine = fakeEngine();
  await reconcileStudioProject(engine, project, target, noAudio);
  expect(engine.setTrackMix).toHaveBeenCalledExactlyOnceWith('track-engine', expect.objectContaining({ gain: .4 }));
  expect(engine.setInstrumentControls).not.toHaveBeenCalled();
  expect(engine.trimClip).not.toHaveBeenCalled();
  expect(engine.setMasterGain).not.toHaveBeenCalled();
});

it('changes master gain without rewriting tracks', async () => {
  const project = song();
  const engine = fakeEngine();
  await reconcileStudioProject(engine, project, { ...project, masterGain: .5 }, noAudio);
  expect(engine.setMasterGain).toHaveBeenCalledExactlyOnceWith(.5);
  expect(engine.setTrackMix).not.toHaveBeenCalled();
  expect(engine.trimClip).not.toHaveBeenCalled();
});

it('reapplies clip positions and trims after tempo changes to preserve their times in seconds', async () => {
  const project = song();
  project.tracks[0]!.clips[0]!.startSec = 3;
  project.tracks[0]!.clips[0]!.trimStartSec = 1;
  const engine = fakeEngine();
  await reconcileStudioProject(engine, project, { ...project, bpm: 140 }, noAudio);
  expect(engine.setBpm).toHaveBeenCalledExactlyOnceWith(140);
  expect(engine.moveClip).toHaveBeenCalledExactlyOnceWith('original', 3);
  expect(engine.trimClip).toHaveBeenCalledExactlyOnceWith('original', 1, 4);
  expect(engine.replaceMidiNotes).not.toHaveBeenCalled();
});

it('reapplies the complete patch and custom name after replacing an instrument', async () => {
  const project = song();
  const target = structuredClone(project);
  const track = target.tracks[0]!;
  track.instrumentPresetId = defaultInstrumentPreset('BASS')!.id;
  track.kind = 'BASS';
  const engine = fakeEngine();
  await reconcileStudioProject(engine, project, target, noAudio);
  expect(engine.setInstrumentPreset).toHaveBeenCalledExactlyOnceWith('track-engine', track.instrumentPresetId);
  expect(engine.setInstrumentControls).toHaveBeenCalledExactlyOnceWith('track-engine', track.instrumentPresetId, track.instrumentControls);
  expect(engine.setTrackName).toHaveBeenCalledExactlyOnceWith('track-engine', 'Keys');
  expect(engine.setTrackName.mock.invocationCallOrder[0]).toBeGreaterThan(engine.setInstrumentPreset.mock.invocationCallOrder[0]!);
});

it('turns removed effects off and updates changed effect settings without resetting other settings', async () => {
  const project = song();
  project.tracks[0]!.effects = ['SPACE', 'ECHO'];
  const target = structuredClone(project);
  target.tracks[0]!.effects = ['SPACE'];
  target.tracks[0]!.effectSettings.SPACE = { amount: .8, character: .2, key: 0, scale: 0 };
  const engine = fakeEngine();
  await reconcileStudioProject(engine, project, target, noAudio);
  expect(engine.setEffect).toHaveBeenCalledTimes(2);
  expect(engine.setEffect).toHaveBeenCalledWith('track-engine', 'ECHO', false, expect.any(Object));
  expect(engine.setEffect).toHaveBeenCalledWith('track-engine', 'SPACE', true, expect.objectContaining({ amount: .8 }));
  expect(engine.setTrackMix).not.toHaveBeenCalled();
});

it('updates sampler slices only when their values change', async () => {
  const project = addSamplerTrack(emptyProject('Samples'), 'Found sound', 'sampler', 'Sample', { sourceAssetId: 'asset' });
  const target = structuredClone(project);
  target.tracks[0]!.samplerSettings!.slicePoints = [0, .25, 1];
  const engine = fakeEngine();
  await reconcileStudioProject(engine, project, structuredClone(project), noAudio);
  expect(engine.setSamplerSettings).not.toHaveBeenCalled();
  await reconcileStudioProject(engine, project, target, noAudio);
  expect(engine.setSamplerSettings).toHaveBeenCalledExactlyOnceWith('sampler', expect.objectContaining({ slicePoints: [0, .25, 1] }));
});

it('checks missing audio before applying any changes', async () => {
  const project = song();
  const target = addAudioClip(project, project.tracks[0]!.id, {
    engineId: 'missing', name: 'Voice', source: 'IMPORT', sourceAssetId: 'missing', startSec: 0, sourceDurationSec: 4,
  });
  target.bpm = 140;
  const engine = fakeEngine();
  await expect(reconcileStudioProject(engine, project, target, async () => { throw new Error('Missing source'); })).rejects.toThrow('Missing source');
  for (const method of Object.values(engine)) expect(method).not.toHaveBeenCalled();
});
