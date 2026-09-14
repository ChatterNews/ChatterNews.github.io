import {
  effectSettingsFor, samplerSettingsFor, secondsToBeats,
  type GarageProject, type Store,
} from '@chatter/shared';
import type { OpenDawEngine } from './OpenDawEngine.js';

export type StudioRestoreEngine = Pick<OpenDawEngine,
  'setBpm' | 'addTrack' | 'addSamplerTrack' | 'setTrackMix' | 'setEffect' |
  'setInstrumentControls' | 'createMidiClip' | 'replaceMidiNotes' | 'importAudio' | 'trimClip'> & {
  setMasterGain(gain: number): void;
};

/** Rebuild into the single OpenDAW engine; runtime IDs never survive a mount. */
export async function restoreStudioProject(store: Store, engine: StudioRestoreEngine, saved: GarageProject, live = () => true): Promise<GarageProject> {
  const check = () => { if (!live()) throw new Error('Studio was closed while restoring.'); };
  const media = new Map<string, Blob>();
  for (const track of saved.tracks) {
    if (track.kind === 'SAMPLER' && !track.sampleAssetId) throw new Error(`Studio cannot restore ${track.name}: its source audio is missing.`);
    for (const clip of track.clips) {
      if (clip.source !== 'INSTRUMENT' && !clip.sourceAssetId) throw new Error(`Studio cannot restore ${clip.name}: its source audio is missing.`);
    }
    const ids = [track.sampleAssetId, ...track.clips.map((clip) => clip.sourceAssetId)].filter((id): id is string => !!id);
    for (const id of ids) {
      if (media.has(id)) continue;
      const asset = await store.assets.get(id); check();
      if (!asset || asset.gateStatus !== 'APPROVED') throw new Error('Studio source audio is missing or awaiting review in Media Bin. Resolve it there, then reopen Studio.');
      const bytes = await store.blobs.get(asset.sha256); check();
      if (!bytes) throw new Error('Studio source audio is missing from this computer. Restore the Story Drive and reopen Studio.');
      media.set(id, new Blob([bytes as unknown as BlobPart], { type: asset.mime }));
    }
  }
  const project = structuredClone(saved);
  check(); engine.setBpm(project.bpm); engine.setMasterGain(project.masterGain ?? 1);
  for (const track of project.tracks) {
    check();
    track.engineId = track.kind === 'SAMPLER'
      ? await engine.addSamplerTrack(track.name, media.get(track.sampleAssetId!)!, samplerSettingsFor(track))
      : await engine.addTrack(track.name, track.kind, track.instrumentPresetId);
    check();
    if (track.instrumentPresetId && track.instrumentControls) {
      engine.setInstrumentControls(track.engineId, track.instrumentPresetId, track.instrumentControls);
    }
    engine.setTrackMix(track.engineId, track);
    for (const effect of track.effects) engine.setEffect(track.engineId, effect, true, effectSettingsFor(track, effect));
    for (const clip of track.clips) {
      check();
      if (clip.source === 'INSTRUMENT') {
        clip.engineId = engine.createMidiClip(track.engineId, clip.name, clip.startSec, secondsToBeats(clip.sourceDurationSec, project.bpm)).engineId;
        clip.notes = engine.replaceMidiNotes(clip.engineId, clip.notes);
      } else {
        clip.engineId = (await engine.importAudio(track.engineId, media.get(clip.sourceAssetId!)!, clip.name, clip.startSec)).engineId;
        check();
      }
      engine.trimClip(clip.engineId, clip.trimStartSec, clip.trimEndSec);
    }
  }
  return project;
}
