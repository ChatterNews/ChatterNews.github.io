import {
  effectSettingsFor, samplerSettingsFor, secondsToBeats,
  type AudioTrack, type GarageProject, type MidiNote,
} from '@chatter/shared';
import type { OpenDawEngine } from './OpenDawEngine.js';

export type StudioSyncEngine = Pick<OpenDawEngine,
  'setBpm' | 'setMasterGain' | 'addTrack' | 'addSamplerTrack' | 'setTrackMix' |
  'setTrackName' | 'setEffect' | 'setSamplerSettings' | 'setInstrumentPreset' |
  'setInstrumentControls' | 'createMidiClip' | 'replaceMidiNotes' | 'importAudio' |
  'trimClip' | 'moveClip' | 'moveClipToTrack' | 'removeClip' | 'removeTrack'>;

function sameNotes(before: readonly MidiNote[], after: readonly MidiNote[]): boolean {
  // Runtime IDs change on restore; only musical content determines an edit.
  return before.length === after.length && before.every((note, index) => {
    const other = after[index]!;
    return note.pitch === other.pitch && note.startBeat === other.startBeat
      && note.durationBeats === other.durationBeats && note.velocity === other.velocity;
  });
}

async function syncTrackSettings(engine: StudioSyncEngine, track: AudioTrack, previous?: AudioTrack): Promise<void> {
  const presetChanged = !!previous && previous.instrumentPresetId !== track.instrumentPresetId;
  if (presetChanged && track.instrumentPresetId) {
    await engine.setInstrumentPreset(track.engineId, track.instrumentPresetId);
  }
  // Replacing an instrument assigns its preset name, so restore the track label afterward.
  if (!previous || presetChanged || previous.name !== track.name) {
    engine.setTrackName(track.engineId, track.name);
  }
  if (track.kind === 'SAMPLER') {
    const settings = samplerSettingsFor(track);
    if (previous && JSON.stringify(samplerSettingsFor(previous)) !== JSON.stringify(settings)) {
      engine.setSamplerSettings(track.engineId, settings);
    }
    // addSamplerTrack already applies the complete sampler settings for new tracks.
  } else if (track.instrumentPresetId && track.instrumentControls
    && (!previous || presetChanged || JSON.stringify(previous.instrumentControls) !== JSON.stringify(track.instrumentControls))) {
    engine.setInstrumentControls(track.engineId, track.instrumentPresetId, track.instrumentControls);
  }
  if (!previous || (['gain', 'pan', 'warmth', 'muted', 'soloed'] as const).some((key) => previous[key] !== track[key])) {
    engine.setTrackMix(track.engineId, track);
  }
  for (const effect of new Set([...(previous?.effects ?? []), ...track.effects])) {
    const enabled = track.effects.includes(effect);
    const settings = effectSettingsFor(track, effect);
    if (!previous || previous.effects.includes(effect) !== enabled
      || (enabled && JSON.stringify(effectSettingsFor(previous, effect)) !== JSON.stringify(settings))) {
      engine.setEffect(track.engineId, effect, enabled, settings);
    }
  }
}

/** Reconcile durable identities without restarting audio or rewriting unchanged tracks. */
export async function reconcileStudioProject(
  engine: StudioSyncEngine, previous: GarageProject, target: GarageProject,
  source: (id: string) => Promise<Blob>,
): Promise<GarageProject> {
  const next = structuredClone(target);
  const assets = new Map<string, Blob>();
  const oldTracks = new Map(previous.tracks.map((track) => [track.id, track]));
  const oldClips = new Map(previous.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, { clip, track }] as const)));

  // Resolve missing media before making any changes to the engine.
  for (const track of next.tracks) {
    const old = oldTracks.get(track.id);
    const ids = [
      ...(!old && track.kind === 'SAMPLER' ? [track.sampleAssetId] : []),
      ...track.clips.filter((clip) => clip.source !== 'INSTRUMENT' && !oldClips.has(clip.id)).map((clip) => clip.sourceAssetId),
    ];
    for (const id of ids) {
      if (!id) throw new Error('The source audio is missing. Restore the Story Drive before editing.');
      if (!assets.has(id)) assets.set(id, await source(id));
    }
  }

  const tempoChanged = previous.bpm !== next.bpm;
  if (tempoChanged) engine.setBpm(next.bpm);
  if ((previous.masterGain ?? 1) !== (next.masterGain ?? 1)) engine.setMasterGain(next.masterGain ?? 1);

  for (const track of next.tracks) {
    const old = oldTracks.get(track.id);
    track.engineId = old?.engineId ?? (track.kind === 'SAMPLER'
      ? await engine.addSamplerTrack(track.name, assets.get(track.sampleAssetId!)!, samplerSettingsFor(track))
      : await engine.addTrack(track.name, track.kind, track.instrumentPresetId));
    await syncTrackSettings(engine, track, old);

    for (const clip of track.clips) {
      const prior = oldClips.get(clip.id);
      if (prior) {
        clip.engineId = prior.clip.engineId;
        if (prior.track.id !== track.id) engine.moveClipToTrack(clip.engineId, track.engineId);
        clip.notes = sameNotes(prior.clip.notes, clip.notes)
          ? prior.clip.notes : engine.replaceMidiNotes(clip.engineId, clip.notes);
      } else if (clip.source === 'INSTRUMENT') {
        clip.engineId = engine.createMidiClip(track.engineId, clip.name, clip.startSec, secondsToBeats(clip.sourceDurationSec, next.bpm)).engineId;
        clip.notes = engine.replaceMidiNotes(clip.engineId, clip.notes);
      } else {
        clip.engineId = (await engine.importAudio(track.engineId, assets.get(clip.sourceAssetId!)!, clip.name, clip.startSec)).engineId;
      }
      // OpenDAW stores musical pulses. A tempo change must reapply positions and
      // trims even when the arrangement's times in seconds have not changed.
      if (prior && (tempoChanged || prior.clip.startSec !== clip.startSec)) {
        engine.moveClip(clip.engineId, clip.startSec);
      }
      if (!prior || tempoChanged || prior.clip.trimStartSec !== clip.trimStartSec || prior.clip.trimEndSec !== clip.trimEndSec) {
        engine.trimClip(clip.engineId, clip.trimStartSec, clip.trimEndSec);
      }
    }
  }

  const keptClips = new Set(next.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  for (const [id, { clip }] of oldClips) {
    if (!keptClips.has(id)) engine.removeClip(clip.engineId);
  }
  const keptTracks = new Set(next.tracks.map((track) => track.id));
  for (const old of previous.tracks) {
    if (!keptTracks.has(old.id)) engine.removeTrack(old.engineId);
  }
  return next;
}
