import { expect, test } from 'vitest';
import { addAudioClip, addTrack, emptyProject, MemoryStore, type MidiNote } from '@chatter/shared';
import { applyStudioTransaction, type StudioTransactionEngine } from './studio-transaction.js';

function projects() {
  let previous = addTrack(emptyProject('Saved song', 96), 'Keys', 'old-track', 'KEYS');
  previous = addAudioClip(previous, previous.tracks[0]!.id, { engineId: 'old-clip', name: 'Verse', source: 'INSTRUMENT', startSec: 0, sourceDurationSec: 4, notes: [{ engineId: 'old-note', pitch: 60, startBeat: 0, durationBeats: 1, velocity: .8 }] });
  const target = { ...structuredClone(previous), bpm: 120 };
  target.tracks[0]!.name = 'Renamed keys';
  return { previous, target };
}

function fakeEngine(onFailedMutation?: () => void) {
  const calls: string[] = [];
  let fail = true;
  const engine = {
    setBpm(bpm: number) { calls.push(`bpm:${bpm}`); }, setMasterGain() {},
    async addTrack() { calls.push('restore-track'); return 'fresh-track'; }, async addSamplerTrack() { return 'fresh-sampler'; },
    setTrackMix() {}, setEffect() {}, setInstrumentControls() {}, setSamplerSettings() {}, async setInstrumentPreset() {},
    setTrackName() { calls.push('name'); if (fail) { onFailedMutation?.(); throw new Error('OpenDAW mutation failed'); } },
    createMidiClip() { calls.push('restore-clip'); return { engineId: 'fresh-clip' }; },
    replaceMidiNotes(_id: string, notes: Omit<MidiNote, 'engineId'>[]) { return notes.map((note) => ({ ...note, engineId: 'fresh-note' })); },
    async importAudio() { throw new Error('unexpected audio'); }, trimClip() {}, moveClip() {}, moveClipToTrack() {}, removeClip() {}, removeTrack() {},
    terminate() { calls.push('terminate'); }, async boot() { calls.push('boot'); fail = false; },
  } as unknown as StudioTransactionEngine;
  return { engine, calls };
}

test('a partial mutation resets the engine and restores the complete previous project', async () => {
  const store = new MemoryStore('transaction'); await store.open();
  const { previous, target } = projects();
  const { engine, calls } = fakeEngine();
  const result = await applyStudioTransaction(store, engine, previous, target, async () => { throw new Error('unexpected source'); }, () => true);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected recovery');
  expect(result.error.message).toContain('mutation failed');
  expect(result.project.bpm).toBe(96);
  expect(result.project.tracks[0]!.engineId).toBe('fresh-track');
  expect(result.project.tracks[0]!.clips[0]!.engineId).toBe('fresh-clip');
  expect(calls).toEqual(['bpm:120', 'name', 'terminate', 'boot', 'bpm:96', 'restore-track', 'restore-clip']);
});

test('does not reboot or restore after the room is no longer live', async () => {
  const store = new MemoryStore('closed-transaction'); await store.open();
  const { previous, target } = projects();
  let live = true;
  const { engine, calls } = fakeEngine(() => { live = false; });
  const result = await applyStudioTransaction(store, engine, previous, target, async () => { throw new Error('unexpected source'); }, () => live);
  expect(result).toMatchObject({ ok: false, project: previous });
  expect(calls).toEqual(['bpm:120', 'name']);
});
