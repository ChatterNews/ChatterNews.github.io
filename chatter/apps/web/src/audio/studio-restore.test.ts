import { expect, test, vi } from 'vitest';
import { addAudioClip, addTrack, DEFAULT_GATE_CONFIG, defaultInstrumentPreset, emptyProject, Gate, MemoryStore, type MidiNote } from '@chatter/shared';
import { restoreStudioProject, type StudioRestoreEngine } from './studio-restore.js';

function engine(): StudioRestoreEngine {
  return {
    setBpm: vi.fn(), setMasterGain: vi.fn(), addTrack: vi.fn(async () => 'new-track'), addSamplerTrack: vi.fn(async () => 'new-sampler'),
    setTrackMix: vi.fn(), setEffect: vi.fn(), setInstrumentControls: vi.fn(),
    createMidiClip: vi.fn(() => ({ engineId: 'new-clip', name: 'Keys', durationSec: 8 })),
    replaceMidiNotes: vi.fn((_id: string, notes: Omit<MidiNote, 'engineId'>[]) => notes.map((note) => ({ ...note, engineId: 'new-note' }))),
    importAudio: vi.fn(async () => ({ engineId: 'new-audio', name: 'Voice', durationSec: 4 })), trimClip: vi.fn(),
  };
}

function expectNoEngineMutation(daw: StudioRestoreEngine) {
  for (const method of ['setBpm', 'setMasterGain', 'addTrack', 'addSamplerTrack', 'setTrackMix', 'setEffect', 'setInstrumentControls', 'createMidiClip', 'replaceMidiNotes', 'importAudio', 'trimClip'] as const) {
    expect(daw[method]).not.toHaveBeenCalled();
  }
}

test('rebuilds MIDI with new runtime identities while preserving song, notes, mixer and effects', async () => {
  const store = new MemoryStore('restore'); await store.open();
  const preset = defaultInstrumentPreset('KEYS')!;
  let project = addTrack(emptyProject('Song', 120), 'Keys', 'old-track', 'KEYS', preset.id, { ...preset.controls, tone: .27, width: .9 });
  project = addAudioClip(project, project.tracks[0]!.id, { engineId: 'old-clip', name: 'Keys', source: 'INSTRUMENT', startSec: 3, sourceDurationSec: 8, notes: [{ engineId: 'old-note', pitch: 60, startBeat: 0.5, durationBeats: 2, velocity: 0.8 }] });
  project.tracks[0]!.gain = 0.7;
  project.tracks[0]!.effects = ['SPACE'];
  project.masterGain = 0.72;
  const daw = engine();
  const restored = await restoreStudioProject(store, daw, project);
  expect(restored.id).toBe(project.id);
  expect(restored.tracks[0]!.engineId).toBe('new-track');
  expect(restored.tracks[0]!.clips[0]!.notes[0]).toEqual({ engineId: 'new-note', pitch: 60, startBeat: 0.5, durationBeats: 2, velocity: 0.8 });
  expect(daw.setInstrumentControls).toHaveBeenCalledExactlyOnceWith('new-track', preset.id, project.tracks[0]!.instrumentControls);
  expect(daw.setBpm).toHaveBeenCalledWith(120);
  expect(daw.setMasterGain).toHaveBeenCalledWith(0.72);
  expect(daw.setTrackMix).toHaveBeenCalledWith('new-track', expect.objectContaining({ gain: 0.7 }));
  expect(daw.setEffect).toHaveBeenCalledWith('new-track', 'SPACE', true, expect.any(Object));
  expect(project.tracks[0]!.engineId).toBe('old-track');
});

test('approved audio bytes and trim restore, quarantined media cannot enter OpenDAW', async () => {
  const store = new MemoryStore('audio'); await store.open();
  const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0; } });
  const result = await gate.ingest({ source: 'recording', ownDevice: true, bytes: new Uint8Array([7, 3]), meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'RECORDING' } });
  let project = addTrack(emptyProject('Audio'), 'Voice', 'old');
  project = addAudioClip(project, project.tracks[0]!.id, { engineId: 'clip', name: 'Voice', source: 'RECORDING', sourceAssetId: result.assetId!, startSec: 5, sourceDurationSec: 4 });
  project.tracks[0]!.clips[0]!.trimStartSec = 1;
  const daw = engine();
  await restoreStudioProject(store, daw, project);
  expect(daw.importAudio).toHaveBeenCalledWith('new-track', expect.any(Blob), 'Voice', 5);
  expect(daw.trimClip).toHaveBeenCalledWith('new-audio', 1, 4);
  await store.assets.update(result.assetId!, { gateStatus: 'QUARANTINED' });
  const blocked = engine();
  await expect(restoreStudioProject(store, blocked, project)).rejects.toThrow('review');
  expect(blocked.addTrack).not.toHaveBeenCalled();
});

test('missing asset record fails before any engine mutation', async () => {
  const store = new MemoryStore('missing-asset'); await store.open();
  let project = addTrack(emptyProject('Audio'), 'Voice', 'old');
  project = addAudioClip(project, project.tracks[0]!.id, { engineId: 'clip', name: 'Voice', source: 'IMPORT', sourceAssetId: 'gone', startSec: 0, sourceDurationSec: 4 });
  const daw = engine();
  await expect(restoreStudioProject(store, daw, project)).rejects.toThrow(/missing|review/);
  expectNoEngineMutation(daw);
});

test('missing blob fails before any engine mutation', async () => {
  const store = new MemoryStore('missing-blob'); await store.open();
  const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0; } });
  const result = await gate.ingest({ source: 'recording', ownDevice: true, bytes: new Uint8Array([1, 2]), meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'RECORDING' } });
  const asset = await store.assets.get(result.assetId!); await store.blobs.remove(asset!.sha256);
  let project = addTrack(emptyProject('Audio'), 'Voice', 'old');
  project = addAudioClip(project, project.tracks[0]!.id, { engineId: 'clip', name: 'Voice', source: 'RECORDING', sourceAssetId: result.assetId!, startSec: 0, sourceDurationSec: 4 });
  const daw = engine();
  await expect(restoreStudioProject(store, daw, project)).rejects.toThrow(/missing from this computer/);
  expectNoEngineMutation(daw);
});
