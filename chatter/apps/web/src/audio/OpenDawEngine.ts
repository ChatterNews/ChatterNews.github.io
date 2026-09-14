/**
 * Chatter Studio's one and only engine: openDAW's headless WASM runtime.
 *
 * The full openDAW Studio is intentionally not embedded. Its supported
 * headless path leaves the engine, project, recording-ready Tape tracks and
 * offline renderer intact while Chatter provides a smaller, school-ready UI.
 */
import { BpmDetector, InstrumentFactories, NoteSignal, type InstrumentBox } from '@opendaw/studio-adapters';
import { ClassicWaveform, PPQN } from '@opendaw/lib-dsp';
import { UUID } from '@opendaw/lib-std';
import { AnimationFrame } from '@opendaw/lib-dom';
import { IndexedBox } from '@opendaw/lib-box';
import { VoicingMode } from '@opendaw/studio-enums';
import {
  AudioWorklets, GlobalSampleLoaderManager, GlobalSoundfontLoaderManager,
  AudioContentFactory, CaptureMidi, EffectFactories, OfflineEngineRenderer, Project, SampleService, SoundfontService, Workers,
} from '@opendaw/studio-core';
import { WasmEngine } from '@opendaw/studio-core-wasm';
import {
  AudioFileBox, AutotuneDeviceBox, CompressorDeviceBox, CrusherDeviceBox, DelayDeviceBox,
  CubedDeviceBox, GateDeviceBox, NeonDeviceBox, NoteEventBox, NoteEventCollectionBox, NoteRegionBox,
  PlayfieldDeviceBox, PlayfieldSampleBox, ReverbDeviceBox, RevampDeviceBox, VaporisateurDeviceBox,
  type AudioRegionBox, type AudioUnitBox, type TapeDeviceBox, type TrackBox,
} from '@opendaw/studio-boxes';
import type { EffectBox } from '@opendaw/studio-core';
import {
  DEFAULT_SAMPLER_SETTINGS, defaultEffectSettings, defaultInstrumentPreset, instrumentPreset,
  type GarageEffect, type GarageEffectSettings, type GarageInstrumentControl, type GarageInstrumentControls,
  type GarageInstrumentPreset, type GarageSamplerSettings, type GarageTrackKind,
} from '@chatter/shared';
import WorkersUrl from '@opendaw/studio-core/workers-main.js?worker&url';
import ProcessorsUrl from '@opendaw/studio-core/processors.js?url';
import WasmProcessorUrl from '@opendaw/studio-core-wasm/wasm-processor.js?url';
import WasmOfflineWorkerUrl from '@opendaw/studio-core-wasm/wasm-offline-worker.js?worker&url';
import { PerContextWorkletLoader } from './worklet-loader.js';
import { samplerFilterFrequency, samplerVoicePlan } from './sampler-engine.js';

type DrumSampleFile = readonly [name: string, path: string];
const DRUM_KIT_FILES: ReadonlyArray<ReadonlyArray<DrumSampleFile>> = [
  [
    ['Hard Kick', 'hard-trap/kicks/hard-kick-01.wav'], ['Kick Alt', 'hard-trap/kicks/hard-kick-02.wav'],
    ['Kick Knock', 'hard-trap/kicks/hard-kick-03.wav'], ['808 Dist', 'hard-trap/808s/808-bass-dist.wav'],
    ['808 Sub', 'hard-trap/808s/808-bass-sub.wav'], ['Snare', 'hard-trap/snares/hard-snare-01.wav'],
    ['Snare Tight', 'hard-trap/snares/hard-snare-02.wav'], ['Snare Alt', 'hard-trap/snares/hard-snare-03.wav'],
    ['Clap', 'hard-trap/claps/clap-01.wav'], ['Clap Alt', 'hard-trap/claps/cl.wav'],
    ['Closed Hat', 'hard-trap/hi-hats/hi-hat-closed-01.wav'], ['Hat Alt', 'hard-trap/hi-hats/ch.wav'],
    ['Open Hat', 'hard-trap/open-hats/open-hat-01.wav'], ['Cowbell', 'hard-trap/percs/perc-cowbell.wav'],
    ['Rim', 'hard-trap/percs/perc-rimshot.wav'], ['Crash FX', 'hard-trap/fx/fx-cymbal.wav'],
  ],
  [
    ['Kick', 'bounce/kicks/bounce-kick-01.wav'], ['Kick Soft', 'bounce/kicks/bounce-kick-02.wav'],
    ['Kick Punch', 'bounce/kicks/bounce-kick-03.wav'], ['808 Long', 'bounce/808s/808-bass-long.wav'],
    ['808 Punch', 'bounce/808s/808-bass-punch.wav'], ['Snare', 'bounce/snares/bounce-snare-01.wav'],
    ['Snare Snap', 'bounce/snares/bounce-snare-02.wav'], ['Snare Alt', 'bounce/snares/bounce-snare-03.wav'],
    ['Clap', 'bounce/claps/clap-01.wav'], ['Clap Wide', 'bounce/claps/cp.wav'],
    ['Closed Hat', 'bounce/hi-hats/hi-hat-closed-01.wav'], ['Open Hat', 'bounce/open-hats/open-hat-01.wav'],
    ['High Tom', 'bounce/percs/perc-high-tom.wav'], ['Low Tom', 'bounce/percs/perc-low-tom.wav'],
    ['808 Round', 'bounce/808s/808-round-long.wav'], ['Crash FX', 'bounce/fx/fx-cymbal.wav'],
  ],
  [
    ['Vinyl Kick', 'soulful-vintage/kicks/vintage-kick-01.wav'], ['Kick Soft', 'soulful-vintage/kicks/vintage-kick-02.wav'],
    ['Kick Knock', 'soulful-vintage/kicks/vintage-kick-03.wav'], ['808 Warm', 'soulful-vintage/808s/808-bass-lofi.wav'],
    ['808 Short', 'soulful-vintage/808s/808-lofi.wav'], ['Snare', 'soulful-vintage/snares/vintage-snare-01.wav'],
    ['Snare Dust', 'soulful-vintage/snares/vintage-snare-02.wav'], ['Snare Alt', 'soulful-vintage/snares/vintage-snare-03.wav'],
    ['Clap', 'soulful-vintage/claps/vintage-clap-01.wav'], ['Clap Dust', 'soulful-vintage/claps/cl-lofi.wav'],
    ['Closed Hat', 'soulful-vintage/hi-hats/ch-lofi.wav'], ['Open Hat', 'soulful-vintage/open-hats/oh00-lofi.wav'],
    ['Open Hat Alt', 'soulful-vintage/open-hats/open-hat-01.wav'], ['Maraca', 'soulful-vintage/percs/perc-maraca.wav'],
    ['Lo-Fi Tom', 'soulful-vintage/percs/ht00-lofi.wav'], ['Crash Dust', 'soulful-vintage/fx/cy0000-lofi.wav'],
  ],
  [
    ['Dance Kick', 'hard-trap/kicks/hard-kick-02.wav'], ['Kick Punch', 'bounce/kicks/bounce-kick-03.wav'],
    ['Kick Low', 'bounce/kicks/bounce-kick-01.wav'], ['Sub Drop', 'bounce/808s/808-bass-long.wav'],
    ['Bass Hit', 'hard-trap/808s/808-bass-sub.wav'], ['Snare Big', 'hard-trap/snares/hard-snare-01.wav'],
    ['Snare Tight', 'bounce/snares/bounce-snare-02.wav'], ['Rim', 'hard-trap/percs/perc-rimshot.wav'],
    ['Clap Bright', 'bounce/claps/clap-01.wav'], ['Clap Wide', 'bounce/claps/cp.wav'],
    ['Closed Hat', 'hard-trap/hi-hats/hi-hat-closed-01.wav'], ['Hat Alt', 'hard-trap/hi-hats/ch.wav'],
    ['Open Hat', 'bounce/open-hats/open-hat-01.wav'], ['High Tom', 'bounce/percs/perc-high-tom.wav'],
    ['Low Tom', 'bounce/percs/perc-low-tom.wav'], ['Crash FX', 'hard-trap/fx/fx-cymbal.wav'],
  ],
];

AudioWorklets.install(ProcessorsUrl);
const wasmWorklets = new PerContextWorkletLoader<AudioContext>(WasmProcessorUrl);

interface EngineTrack {
  audioUnitBox: AudioUnitBox;
  trackBox: TrackBox;
  tapeDevice?: TapeDeviceBox;
  instrumentBox: InstrumentBox;
  capture?: CaptureMidi;
  kind: GarageTrackKind;
  effects: Map<GarageEffect, EffectBox>;
  samplerFile?: AudioFileBox;
  samplerFilter?: RevampDeviceBox;
  samplerSettings?: GarageSamplerSettings;
}

interface EngineClip {
  region: AudioRegionBox | NoteRegionBox;
  noteCollection?: NoteEventCollectionBox;
  notes?: Map<string, NoteEventBox>;
}

interface MidiRecordingSession {
  track: EngineTrack;
  startPulse: number;
  startContextTime: number;
  region?: NoteRegionBox;
  collection?: NoteEventCollectionBox;
  active: Map<number, { note: NoteEventBox; startPulse: number }>;
  subscription: { terminate(): void };
}

export interface ImportedAudio {
  engineId: string;
  name: string;
  durationSec: number;
}

export interface MidiNoteView {
  engineId: string;
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface RecordedMidiClip extends ImportedAudio {
  startSec: number;
  notes: MidiNoteView[];
}

/**
 * The OpenDAW bridge. There is deliberately no TypeScript/Tone fallback: if
 * the WASM engine cannot start, Studio says so and does not pretend to play.
 */
export class OpenDawEngine {
  private booting?: Promise<void>;
  private context?: AudioContext;
  private project?: Project;
  private sampleService?: SampleService;
  private sampleManager?: GlobalSampleLoaderManager;
  private tracks = new Map<string, EngineTrack>();
  private clips = new Map<string, EngineClip>();
  private midiRecording?: MidiRecordingSession;
  private transportPositionPulse = 0;
  private transportClock?: { startPulse: number; startContextTime: number };
  private loopRange = { enabled: false, fromPulse: 0, toPulse: PPQN.Bar * 4 };
  private drumAttachments = new Map<number, InstrumentFactories.PlayfieldAttachment>();
  private lifecycle = 0;

  async boot(): Promise<void> {
    this.booting ??= this.start();
    return this.booting;
  }

  get playing(): boolean {
    return this.project?.engine.isPlaying.getValue() ?? false;
  }

  async addTrack(name: string, kind: GarageTrackKind = 'AUDIO', presetId?: string): Promise<string> {
    await this.boot();
    const project = this.assertProject();
    const preset = kind === 'AUDIO' ? undefined : (presetId ? instrumentPreset(presetId) : defaultInstrumentPreset(kind));
    const attachment = preset?.engine === 'PLAYFIELD' ? await this.ensureDrumAttachment(preset.patch.kit ?? 0) : undefined;
    let result: EngineTrack | undefined;
    project.editing.modify(() => {
      const product = kind === 'AUDIO'
        ? project.api.createInstrument(InstrumentFactories.Tape)
        : this.createInstrument(project, preset!, attachment, name);
      product.instrumentBox.label.setValue(name);
      if (preset) this.applyInstrumentBox(product.instrumentBox, preset, preset.controls);
      result = {
        audioUnitBox: product.audioUnitBox,
        trackBox: product.trackBox,
        tapeDevice: kind === 'AUDIO' ? product.instrumentBox as TapeDeviceBox : undefined,
        instrumentBox: product.instrumentBox,
        kind: preset?.kind ?? kind,
        effects: new Map(),
      };
    });
    const track = result!;
    const id = UUID.toString(track.audioUnitBox.address.uuid);
    if (kind !== 'AUDIO') {
      track.capture = project.captureDevices.get(track.audioUnitBox.address.uuid)
        .mapOr((capture) => capture as CaptureMidi, () => undefined);
    }
    this.tracks.set(id, track);
    return id;
  }

  async addSamplerTrack(
    name: string, file: Blob, settings: GarageSamplerSettings = { ...DEFAULT_SAMPLER_SETTINGS, slicePoints: [...DEFAULT_SAMPLER_SETTINGS.slicePoints] },
  ): Promise<string> {
    await this.boot();
    const project = this.assertProject();
    const sample = await this.sampleService!.importFile({
      name, bpm: 0, arrayBuffer: await file.arrayBuffer(), origin: 'import',
    });
    const uuid = UUID.parse(sample.uuid);
    await this.sampleManager!.getAudioData(uuid);
    let result: EngineTrack | undefined;
    project.editing.modify(() => {
      const audioFileBox = project.boxGraph.findBox<AudioFileBox>(uuid).unwrapOrElse(() =>
        AudioFileBox.create(project.boxGraph, uuid, (box) => {
          box.fileName.setValue(name);
          box.startInSeconds.setValue(0);
          box.endInSeconds.setValue(sample.duration);
        }));
      const product = project.api.createInstrument(InstrumentFactories.Playfield, { name, attachment: [] });
      this.rebuildSamplerVoices(product.instrumentBox, audioFileBox, settings);
      result = {
        audioUnitBox: product.audioUnitBox,
        trackBox: product.trackBox,
        instrumentBox: product.instrumentBox,
        kind: 'SAMPLER',
        effects: new Map(),
        samplerFile: audioFileBox,
        samplerSettings: { ...settings, slicePoints: [...settings.slicePoints] },
      };
      this.applySamplerFilter(project, result, settings.filter);
    });
    const track = result!;
    track.capture = project.captureDevices.get(track.audioUnitBox.address.uuid)
      .mapOr((capture) => capture as CaptureMidi, () => undefined);
    const id = UUID.toString(track.audioUnitBox.address.uuid);
    this.tracks.set(id, track);
    return id;
  }

  setSamplerSettings(trackId: string, settings: GarageSamplerSettings): void {
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    if (!(track.instrumentBox instanceof PlayfieldDeviceBox) || !track.samplerFile) {
      throw new Error('Choose a sampler track before shaping its sound.');
    }
    project.editing.modify(() => {
      const before = track.samplerSettings;
      const needsRebuild = !before || before.layout !== settings.layout
        || before.rootNote !== settings.rootNote || before.tune !== settings.tune
        || before.slicePoints.length !== settings.slicePoints.length
        || before.slicePoints.some((point, index) => point !== settings.slicePoints[index]);
      if (needsRebuild) this.rebuildSamplerVoices(track.instrumentBox as PlayfieldDeviceBox, track.samplerFile!, settings);
      else this.updateSamplerVoices(track.instrumentBox as PlayfieldDeviceBox, settings, before);
      this.applySamplerFilter(project, track, settings.filter);
      track.samplerSettings = { ...settings, slicePoints: [...settings.slicePoints] };
    });
  }

  async setInstrumentPreset(trackId: string, presetId: string): Promise<void> {
    await this.boot();
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    if (track.kind === 'AUDIO') throw new Error('Choose an instrument track before changing sounds.');
    const preset = instrumentPreset(presetId);
    const attachment = preset.engine === 'PLAYFIELD' ? await this.ensureDrumAttachment(preset.patch.kit ?? 0) : undefined;
    project.editing.modify(() => {
      const result = preset.engine === 'NEON'
        ? project.api.replaceMIDIInstrument(track.instrumentBox, InstrumentFactories.Neon)
        : preset.engine === 'CUBED'
          ? project.api.replaceMIDIInstrument(track.instrumentBox, InstrumentFactories.Cubed)
          : preset.engine === 'PLAYFIELD'
            ? project.api.replaceMIDIInstrument(track.instrumentBox, InstrumentFactories.Playfield, attachment ?? [])
            : project.api.replaceMIDIInstrument(track.instrumentBox, InstrumentFactories.Vaporisateur);
      if (result.isFailure()) throw new Error(String(result.failureReason()));
      const next = result.result();
      next.label.setValue(preset.name);
      this.applyInstrumentBox(next, preset, preset.controls);
      track.instrumentBox = next;
      track.kind = preset.kind;
    });
  }

  setInstrumentControl(trackId: string, presetId: string, control: GarageInstrumentControl, value: number, controls: GarageInstrumentControls): void {
    this.setInstrumentControls(trackId, presetId, { ...controls, [control]: Math.max(0, Math.min(1, value)) });
  }

  /** Apply a saved patch once, rather than rebuilding it for each knob. */
  setInstrumentControls(trackId: string, presetId: string, controls: GarageInstrumentControls): void {
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    if (track.kind === 'AUDIO') return;
    project.editing.modify(() => this.applyInstrumentBox(track.instrumentBox, instrumentPreset(presetId), controls));
  }

  async importAudio(trackId: string, file: Blob, name: string, startSec: number): Promise<ImportedAudio> {
    await this.boot();
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    const sampleService = this.sampleService!;
    const sample = await sampleService.importFile({
      name, bpm: 0, arrayBuffer: await file.arrayBuffer(), origin: 'import',
    });
    const uuid = UUID.parse(sample.uuid);
    await this.sampleManager!.getAudioData(uuid);

    let region: AudioRegionBox | undefined;
    project.editing.modify(() => {
      const audioFileBox = project.boxGraph.findBox<AudioFileBox>(uuid).unwrapOrElse(() =>
        AudioFileBox.create(project.boxGraph, uuid, (box) => {
          box.fileName.setValue(name);
          box.startInSeconds.setValue(0);
          box.endInSeconds.setValue(sample.duration);
        }));
      region = AudioContentFactory.createNotStretchedRegion({
        boxGraph: project.boxGraph, sample, audioFileBox, targetTrack: track.trackBox,
        position: PPQN.secondsToPulses(Math.max(0, startSec), this.bpm),
      });
    });

    const engineId = UUID.toString(region!.address.uuid);
    this.clips.set(engineId, { region: region! });
    return { engineId, name: sample.name, durationSec: sample.duration };
  }

  /** Create the empty, editable region that opens in Chatter's piano roll. */
  createMidiClip(trackId: string, name: string, startSec = 0, beats = 16): ImportedAudio {
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    if (track.kind === 'AUDIO') throw new Error('Choose Keys, Bass, or Pad before writing notes.');
    const duration = Math.max(PPQN.Quarter, beats * PPQN.Quarter);
    let collection: NoteEventCollectionBox | undefined;
    let region: NoteRegionBox | undefined;
    project.editing.modify(() => {
      collection = NoteEventCollectionBox.create(project.boxGraph, UUID.generate());
      region = project.api.createNoteRegion({
        trackBox: track.trackBox,
        position: PPQN.secondsToPulses(Math.max(0, startSec), this.bpm),
        duration,
        loopDuration: duration,
        eventCollection: collection,
        name,
      });
    });
    const engineId = UUID.toString(region!.address.uuid);
    this.clips.set(engineId, { region: region!, noteCollection: collection!, notes: new Map() });
    return { engineId, name, durationSec: PPQN.pulsesToSeconds(duration, this.bpm) };
  }

  addMidiNote(
    clipId: string, pitch: number, startBeat: number, durationBeats: number, velocity: number,
  ): MidiNoteView {
    const project = this.assertProject();
    const clip = this.assertClip(clipId);
    if (!clip.noteCollection || !clip.notes) throw new Error('Open an instrument clip before writing notes.');
    const view = {
      engineId: '',
      pitch: Math.round(Math.max(0, Math.min(127, pitch))),
      startBeat: Math.max(0, startBeat),
      durationBeats: Math.max(0.125, durationBeats),
      velocity: Math.max(0.01, Math.min(1, velocity)),
    };
    let note: NoteEventBox | undefined;
    project.editing.modify(() => {
      note = NoteEventBox.create(project.boxGraph, UUID.generate(), (box) => {
        box.position.setValue(view.startBeat * PPQN.Quarter);
        box.duration.setValue(view.durationBeats * PPQN.Quarter);
        box.pitch.setValue(view.pitch);
        box.velocity.setValue(view.velocity);
        box.events.refer(clip.noteCollection!.events);
      });
    });
    view.engineId = UUID.toString(note!.address.uuid);
    clip.notes.set(view.engineId, note!);
    return view;
  }

  removeMidiNote(clipId: string, noteId: string): void {
    const project = this.assertProject();
    const clip = this.assertClip(clipId);
    const note = clip.notes?.get(noteId);
    if (!note) throw new Error('That note is no longer in this clip.');
    project.editing.modify(() => note.delete());
    clip.notes!.delete(noteId);
  }

  updateMidiNote(
    clipId: string,
    noteId: string,
    patch: Partial<Omit<MidiNoteView, 'engineId'>>,
  ): MidiNoteView {
    const project = this.assertProject();
    const clip = this.assertClip(clipId);
    const note = clip.notes?.get(noteId);
    if (!note) throw new Error('That note is no longer in this clip.');
    project.editing.modify(() => {
      if (patch.pitch !== undefined) note.pitch.setValue(Math.round(Math.max(0, Math.min(127, patch.pitch))));
      if (patch.startBeat !== undefined) note.position.setValue(Math.max(0, patch.startBeat) * PPQN.Quarter);
      if (patch.durationBeats !== undefined) note.duration.setValue(Math.max(0.0625, patch.durationBeats) * PPQN.Quarter);
      if (patch.velocity !== undefined) note.velocity.setValue(Math.max(0.01, Math.min(1, patch.velocity)));
    });
    return this.noteView(note);
  }

  getMidiNotes(clipId: string): MidiNoteView[] {
    const clip = this.assertClip(clipId);
    if (!clip.noteCollection) return [];
    const notes = clip.noteCollection.events.pointerHub.incoming()
      .map(({ box }) => box)
      .filter((box): box is NoteEventBox => box instanceof NoteEventBox);
    clip.notes = new Map(notes.map((note) => [UUID.toString(note.address.uuid), note]));
    return notes.map((note) => this.noteView(note)).sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
  }

  replaceMidiNotes(
    clipId: string,
    notes: ReadonlyArray<Omit<MidiNoteView, 'engineId'>>,
  ): MidiNoteView[] {
    const project = this.assertProject();
    const clip = this.assertClip(clipId);
    if (!clip.noteCollection) throw new Error('Open a MIDI clip before restoring notes.');
    project.editing.modify(() => {
      clip.noteCollection!.events.pointerHub.incoming()
        .map(({ box }) => box)
        .filter((box): box is NoteEventBox => box instanceof NoteEventBox)
        .forEach((note) => note.delete());
      notes.forEach((source) => NoteEventBox.create(project.boxGraph, UUID.generate(), (note) => {
        note.position.setValue(Math.max(0, source.startBeat) * PPQN.Quarter);
        note.duration.setValue(Math.max(0.0625, source.durationBeats) * PPQN.Quarter);
        note.pitch.setValue(Math.round(Math.max(0, Math.min(127, source.pitch))));
        note.velocity.setValue(Math.max(0.01, Math.min(1, source.velocity)));
        note.events.refer(clip.noteCollection!.events);
      }));
    });
    return this.getMidiNotes(clipId);
  }

  auditionStart(trackId: string, pitch: number, velocity: number): void {
    const track = this.assertTrack(trackId);
    void this.context?.resume();
    const signal = NoteSignal.on(
      track.audioUnitBox.address.uuid,
      Math.round(Math.max(0, Math.min(127, pitch))),
      Math.max(0.01, Math.min(1, velocity)),
    );
    if (track.capture) track.capture.notify(signal); else this.assertProject().engine.noteSignal(signal);
  }

  auditionStop(trackId: string, pitch: number): void {
    const track = this.assertTrack(trackId);
    const signal = NoteSignal.off(
      track.audioUnitBox.address.uuid,
      Math.round(Math.max(0, Math.min(127, pitch))),
    );
    if (track.capture) track.capture.notify(signal); else this.assertProject().engine.noteSignal(signal);
  }

  panic(): void {
    this.project?.engine.panic();
  }

  async startMidiRecording(trackId: string): Promise<void> {
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    if (!track.capture) throw new Error('Choose an instrument track before recording MIDI.');
    if (this.midiRecording) throw new Error('A MIDI take is already recording.');
    await this.context?.resume();
    project.captureDevices.setArm(track.capture, true);
    const startPulse = this.currentPositionPulse();
    const startContextTime = this.context!.currentTime;
    const active = new Map<number, { note: NoteEventBox; startPulse: number }>();
    const session = {} as MidiRecordingSession;
    const subscription = track.capture.subscribeNotes((signal) => {
      const pulse = startPulse + PPQN.secondsToPulses(
        Math.max(0, this.context!.currentTime - startContextTime),
        this.bpm,
      );
      if (NoteSignal.isOn(signal)) {
        project.editing.modify(() => {
          if (!session.collection || !session.region) {
            session.collection = NoteEventCollectionBox.create(project.boxGraph, UUID.generate());
            session.region = project.api.createNoteRegion({
              trackBox: track.trackBox,
              position: startPulse,
              duration: PPQN.Quarter,
              loopDuration: PPQN.Quarter,
              eventCollection: session.collection,
              name: 'Recorded take',
            });
          }
          const note = NoteEventBox.create(project.boxGraph, UUID.generate(), (box) => {
            box.position.setValue(Math.max(0, pulse - startPulse));
            box.duration.setValue(PPQN.Quarter / 16);
            box.pitch.setValue(signal.pitch);
            box.velocity.setValue(signal.velocity);
            box.events.refer(session.collection!.events);
          });
          active.set(signal.pitch, { note, startPulse: pulse });
        });
      } else if (NoteSignal.isOff(signal)) {
        const held = active.get(signal.pitch);
        if (!held) return;
        project.editing.modify(() => held.note.duration.setValue(Math.max(PPQN.Quarter / 16, pulse - held.startPulse)));
        active.delete(signal.pitch);
      }
    });
    Object.assign(session, { track, startPulse, startContextTime, active, subscription });
    this.midiRecording = session;
    project.engine.play();
  }

  async stopMidiRecording(trackId: string): Promise<RecordedMidiClip[]> {
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    const session = this.midiRecording;
    if (!track.capture || !session || session.track !== track) return [];
    const endPulse = session.startPulse + PPQN.secondsToPulses(
      Math.max(0, this.context!.currentTime - session.startContextTime),
      this.bpm,
    );
    session.subscription.terminate();
    project.engine.stop(false);
    this.transportPositionPulse = endPulse;
    project.engine.setPosition(endPulse);
    project.editing.modify(() => {
      session.active.forEach(({ note, startPulse }) =>
        note.duration.setValue(Math.max(PPQN.Quarter / 16, endPulse - startPulse)));
      if (session.region) {
        const elapsed = Math.max(PPQN.Quarter / 4, endPulse - session.startPulse);
        const duration = Math.ceil(elapsed / PPQN.Quarter) * PPQN.Quarter;
        session.region.duration.setValue(duration);
        session.region.loopDuration.setValue(duration);
      }
    });
    this.midiRecording = undefined;
    return session.region ? [this.registerMidiRegion(session.region)] : [];
  }

  get bpm(): number {
    return this.project?.timelineBox.bpm.getValue() ?? 96;
  }

  get positionBeat(): number {
    return this.currentPositionPulse() / PPQN.Quarter;
  }

  setPositionBeat(beat: number): void {
    const pulse = Math.max(0, beat) * PPQN.Quarter;
    this.transportPositionPulse = pulse;
    this.assertProject().engine.setPosition(pulse);
    if (this.transportClock && this.context) {
      this.transportClock = { startPulse: pulse, startContextTime: this.context.currentTime };
    }
  }

  setBpm(value: number): void {
    const project = this.assertProject();
    const pulse = this.currentPositionPulse();
    project.editing.modify(() => project.api.setBpm(Math.max(40, Math.min(240, Math.round(value)))));
    this.transportPositionPulse = pulse;
    if (this.transportClock && this.context) {
      this.transportClock = { startPulse: pulse, startContextTime: this.context.currentTime };
    }
  }

  setLoop(enabled: boolean, fromBeat: number, toBeat: number): void {
    const project = this.assertProject();
    project.editing.modify(() => {
      project.timelineBox.loopArea.enabled.setValue(enabled);
      project.timelineBox.loopArea.from.setValue(Math.max(0, fromBeat) * PPQN.Quarter);
      project.timelineBox.loopArea.to.setValue(Math.max(fromBeat + 0.25, toBeat) * PPQN.Quarter);
    });
    this.loopRange = {
      enabled,
      fromPulse: Math.max(0, fromBeat) * PPQN.Quarter,
      toPulse: Math.max(fromBeat + 0.25, toBeat) * PPQN.Quarter,
    };
  }

  setMetronome(enabled: boolean): void {
    const project = this.assertProject();
    project.engine.preferences.settings.metronome.enabled = enabled;
    project.engine.preferences.settings.metronome.beatSubDivision = 1;
    project.engine.preferences.settings.metronome.gain = -9;
  }

  /** Audible pre-roll that does not move the timeline or leak into a take. */
  async playCountIn(beats: number, onBeat: (remaining: number) => void, keepGoing: () => boolean): Promise<boolean> {
    await this.boot();
    const context = this.context!;
    await context.resume();
    const beatMs = 60_000 / this.bpm;
    for (let index = 0; index < beats; index++) {
      if (!keepGoing()) return false;
      onBeat(beats - index);
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(index % 4 === 0 ? 1320 : 920, now);
      gain.gain.setValueAtTime(index % 4 === 0 ? .2 : .13, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .055);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + .06);
      await new Promise<void>((resolve) => window.setTimeout(resolve, beatMs));
    }
    return keepGoing();
  }

  /** Add a real MIDI region to an OpenDAW synth; the UI calls these starter ideas, not fake loops. */
  addStarterPattern(trackId: string, name: string, startSec = 0): ImportedAudio {
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    if (track.kind === 'AUDIO') throw new Error('Choose Keys, Bass, or Pad before adding a starter idea.');
    const bars = 4;
    const duration = PPQN.Bar * bars;
    let collection: NoteEventCollectionBox | undefined;
    let region: NoteRegionBox | undefined;
    const notes = new Map<string, NoteEventBox>();
    project.editing.modify(() => {
      collection = NoteEventCollectionBox.create(project.boxGraph, UUID.generate());
      region = project.api.createNoteRegion({
        trackBox: track.trackBox,
        position: PPQN.secondsToPulses(Math.max(0, startSec), this.bpm),
        duration,
        loopDuration: duration,
        eventCollection: collection,
        name,
      });
      const roots = track.kind === 'BASS' ? [36, 34, 31, 36] : [48, 45, 41, 43];
      roots.forEach((root, bar) => {
        const onset = bar * PPQN.Bar;
        const pitches = track.kind === 'BASS' ? [root, root, root + 7, root] : [root, root + 4, root + 7];
        const noteLength = track.kind === 'BASS' ? PPQN.Quarter * 0.8 : PPQN.Bar * 0.88;
        pitches.forEach((pitch, index) => {
          const note = NoteEventBox.create(project.boxGraph, UUID.generate(), (box) => {
            box.position.setValue(onset + (track.kind === 'BASS' ? index * PPQN.Quarter : 0));
            box.duration.setValue(noteLength);
            box.pitch.setValue(pitch);
            box.velocity.setValue(track.kind === 'BASS' ? 0.72 : 0.62);
            box.events.refer(collection!.events);
          });
          notes.set(UUID.toString(note.address.uuid), note);
        });
      });
    });
    const engineId = UUID.toString(region!.address.uuid);
    this.clips.set(engineId, { region: region!, noteCollection: collection!, notes });
    return { engineId, name, durationSec: PPQN.pulsesToSeconds(duration, this.bpm) };
  }

  play(): void {
    void this.context?.resume();
    if (this.context && !this.transportClock) {
      this.transportClock = {
        startPulse: this.transportPositionPulse,
        startContextTime: this.context.currentTime,
      };
    }
    this.assertProject().engine.play();
  }

  stop(reset = false): void {
    const project = this.assertProject();
    const pulse = reset ? 0 : this.currentPositionPulse();
    this.transportClock = undefined;
    this.transportPositionPulse = pulse;
    project.engine.stop(reset);
    project.engine.setPosition(pulse);
  }

  setTrackMix(trackId: string, { gain, pan, warmth, muted, soloed }: {
    gain: number; pan: number; warmth: number; muted: boolean; soloed: boolean;
  }): void {
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    project.editing.modify(() => {
      track.audioUnitBox.volume.setValue(gain <= .001 ? -120 : 20 * Math.log10(gain));
      track.audioUnitBox.panning.setValue(pan);
      track.audioUnitBox.mute.setValue(muted);
      track.audioUnitBox.solo.setValue(soloed);
      // Tape's saturation is a small, friendly one-knob colour control.
      track.tapeDevice?.saturation.setValue(warmth);
    });
  }

  addEffect(trackId: string, effect: GarageEffect): void {
    this.setEffect(trackId, effect, true, defaultEffectSettings(effect));
  }

  setEffect(
    trackId: string, effect: GarageEffect, enabled: boolean, settings: GarageEffectSettings,
  ): void {
    const project = this.assertProject();
    const track = this.assertTrack(trackId);
    let box = track.effects.get(effect);
    if (!box && !enabled) return;
    project.editing.modify(() => {
      if (!box) {
        const factory = effect === 'CLEANUP' ? EffectFactories.Gate
          : effect === 'VOICE_SHINE' ? EffectFactories.Compressor
            : effect === 'SPACE' ? EffectFactories.Reverb
              : effect === 'ECHO' ? EffectFactories.Delay
                : effect === 'TUNE' ? EffectFactories.Autotune
                  : EffectFactories.Crusher;
        box = project.api.insertEffect(track.audioUnitBox.audioEffects, factory);
        track.effects.set(effect, box);
      }
      box.enabled.setValue(enabled);
      if (enabled) this.applyEffectSettings(box, effect, settings);
    });
  }

  subscribeMeter(trackId: string | undefined, listener: (levels: number[]) => void): { terminate(): void } {
    const project = this.assertProject();
    const address = trackId ? this.assertTrack(trackId).audioUnitBox.address : project.primaryAudioUnitBox.address;
    return project.liveStreamReceiver.subscribeFloats(address, (values) => listener(Array.from(values)));
  }

  setTrackName(trackId: string, name: string): void {
    const track = this.assertTrack(trackId);
    this.assertProject().editing.modify(() => track.instrumentBox.label.setValue(name));
  }

  setMasterGain(gain: number): void {
    const project = this.assertProject();
    project.editing.modify(() => project.primaryAudioUnitBox.volume.setValue(gain <= .001 ? -120 : 20 * Math.log10(gain)));
  }

  moveClipToTrack(clipId: string, trackId: string): void {
    const clip = this.assertClip(clipId), track = this.assertTrack(trackId);
    if (Boolean(clip.noteCollection) === (track.kind === 'AUDIO')) throw new Error('Choose a compatible audio or instrument track.');
    this.assertProject().editing.modify(() => clip.region.regions.refer(track.trackBox.regions));
  }

  removeTrack(trackId: string): void {
    const project = this.assertProject(), track = this.assertTrack(trackId);
    project.editing.modify(() => project.api.deleteAudioUnit(track.audioUnitBox));
    this.tracks.delete(trackId);
  }

  moveClip(clipId: string, startSec: number): void {
    const project = this.assertProject();
    const clip = this.assertClip(clipId);
    project.editing.modify(() => clip.region.position.setValue(PPQN.secondsToPulses(Math.max(0, startSec), this.bpm)));
  }

  resizeMidiClip(clipId: string, beats: number): void {
    const project = this.assertProject();
    const clip = this.assertClip(clipId);
    if (!clip.noteCollection) throw new Error('Only MIDI clips are resized in beats.');
    const duration = Math.max(PPQN.Quarter / 4, beats * PPQN.Quarter);
    project.editing.modify(() => {
      clip.region.duration.setValue(duration);
      clip.region.loopDuration.setValue(duration);
    });
  }

  trimClip(clipId: string, trimStartSec: number, trimEndSec: number): void {
    const project = this.assertProject();
    const clip = this.assertClip(clipId);
    project.editing.modify(() => {
      const duration = Math.max(0.01, trimEndSec - trimStartSec);
      if (clip.noteCollection) {
        const offsetPulses = PPQN.secondsToPulses(trimStartSec, this.bpm);
        const durationPulses = PPQN.secondsToPulses(duration, this.bpm);
        clip.region.loopOffset.setValue(offsetPulses);
        clip.region.duration.setValue(durationPulses);
        clip.region.loopDuration.setValue(offsetPulses + durationPulses);
      } else {
        clip.region.loopOffset.setValue(trimStartSec);
        clip.region.duration.setValue(duration);
        clip.region.loopDuration.setValue(trimStartSec + duration);
      }
    });
  }

  removeClip(clipId: string): void {
    const project = this.assertProject();
    const clip = this.assertClip(clipId);
    project.editing.modify(() => clip.region.delete());
    this.clips.delete(clipId);
  }

  async bounce(): Promise<Blob> {
    const project = this.assertProject();
    const { DefaultObservableValue, Option } = await import('@opendaw/lib-std');
    const { WavFile } = await import('@opendaw/lib-dsp');
    const rendered = await OfflineEngineRenderer.start(
      project.copy(), Option.None, new DefaultObservableValue(0), undefined, 48_000,
    );
    return new Blob([WavFile.encodeInts16(rendered)], { type: 'audio/wav' });
  }

  async bounceTrack(trackId: string): Promise<Blob> {
    const project = this.assertProject();
    const selected = this.assertTrack(trackId);
    const states = [...this.tracks.values()].map((track) => ({
      track, muted: track.audioUnitBox.mute.getValue(), soloed: track.audioUnitBox.solo.getValue(),
    }));
    project.editing.modify(() => states.forEach(({ track }) => {
      track.audioUnitBox.mute.setValue(track !== selected);
      track.audioUnitBox.solo.setValue(false);
    }));
    try {
      return await this.bounce();
    } finally {
      project.editing.modify(() => states.forEach(({ track, muted, soloed }) => {
        track.audioUnitBox.mute.setValue(muted);
        track.audioUnitBox.solo.setValue(soloed);
      }));
    }
  }

  terminate(): void {
    this.lifecycle += 1;
    this.midiRecording?.subscription.terminate();
    this.project?.terminate();
    this.context?.close().catch(() => undefined);
    this.project = undefined;
    this.context = undefined;
    this.booting = undefined;
    this.tracks.clear();
    this.clips.clear();
    this.midiRecording = undefined;
    this.transportClock = undefined;
    this.transportPositionPulse = 0;
  }

  private createInstrument(
    project: Project, preset: GarageInstrumentPreset,
    attachment: InstrumentFactories.PlayfieldAttachment | undefined, name: string,
  ) {
    if (preset.engine === 'NEON') return project.api.createInstrument(InstrumentFactories.Neon, { name });
    if (preset.engine === 'CUBED') return project.api.createInstrument(InstrumentFactories.Cubed, { name });
    if (preset.engine === 'PLAYFIELD') return project.api.createInstrument(InstrumentFactories.Playfield, { name, attachment: attachment ?? [] });
    return project.api.createInstrument(InstrumentFactories.Vaporisateur, { name });
  }

  private rebuildSamplerVoices(
    device: PlayfieldDeviceBox, file: AudioFileBox, settings: GarageSamplerSettings,
  ): void {
    IndexedBox.collectIndexedBoxes(device.samples)
      .filter((sample): sample is PlayfieldSampleBox => sample instanceof PlayfieldSampleBox)
      .forEach((sample) => sample.delete());
    samplerVoicePlan(settings).forEach((voice) => PlayfieldSampleBox.create(device.graph, UUID.generate(), (sample) => {
      sample.device.refer(device.samples);
      sample.file.refer(file);
      sample.index.setValue(voice.note);
      sample.polyphone.setValue(true);
      sample.exclude.setValue(false);
      sample.pitch.setValue(voice.pitchCents);
      sample.sampleStart.setValue(voice.start);
      sample.sampleEnd.setValue(voice.end);
      sample.attack.setValue(voice.attackSec);
      sample.release.setValue(voice.releaseSec);
      sample.gate.setValue(voice.gate);
      sample.volume.setValue(-3);
    }));
  }

  private updateSamplerVoices(
    device: PlayfieldDeviceBox, settings: GarageSamplerSettings, before: GarageSamplerSettings,
  ): void {
    const plan = new Map(samplerVoicePlan(settings).map((voice) => [voice.note, voice] as const));
    IndexedBox.collectIndexedBoxes(device.samples)
      .filter((sample): sample is PlayfieldSampleBox => sample instanceof PlayfieldSampleBox)
      .forEach((sample) => {
        const voice = plan.get(sample.index.getValue());
        if (!voice) return;
        if (before.rootNote !== settings.rootNote || before.tune !== settings.tune) sample.pitch.setValue(voice.pitchCents);
        if (before.start !== settings.start || before.end !== settings.end) {
          sample.sampleStart.setValue(voice.start);
          sample.sampleEnd.setValue(voice.end);
        }
        if (before.attack !== settings.attack) sample.attack.setValue(voice.attackSec);
        if (before.release !== settings.release) sample.release.setValue(voice.releaseSec);
        if (before.mode !== settings.mode) sample.gate.setValue(voice.gate);
      });
  }

  private applySamplerFilter(project: Project, track: EngineTrack, amount: number): void {
    let filter = track.samplerFilter;
    if (!filter) {
      const inserted = project.api.insertEffect(track.audioUnitBox.audioEffects, EffectFactories.Revamp);
      if (!(inserted instanceof RevampDeviceBox)) throw new Error('OpenDAW could not add the sampler filter.');
      filter = inserted;
      track.samplerFilter = inserted;
    }
    filter.label.setValue('Sampler Filter');
    filter.lowPass.enabled.setValue(amount < .999);
    filter.lowPass.frequency.setValue(samplerFilterFrequency(amount));
    filter.lowPass.order.setValue(1);
    filter.lowPass.q.setValue(Math.SQRT1_2);
  }

  private applyInstrumentBox(box: InstrumentBox, preset: GarageInstrumentPreset, controls: GarageInstrumentControls): void {
    const value = (key: GarageInstrumentControl) => Math.max(0, Math.min(1, controls[key]));
    const patch = preset.patch;
    box.label.setValue(preset.name);
    if (box instanceof VaporisateurDeviceBox) {
      const first = box.oscillators.fields()[0]!;
      const second = box.oscillators.fields()[1]!;
      first.waveform.setValue(patch.wave1 ?? ClassicWaveform.saw);
      first.volume.setValue(patch.osc1 ?? -6);
      first.octave.setValue(patch.osc1Octave ?? 0);
      first.tune.setValue(patch.osc1Tune ?? 0);
      second.waveform.setValue(patch.wave2 ?? ClassicWaveform.square);
      second.volume.setValue(patch.osc2 ?? -14);
      second.octave.setValue(patch.osc2Octave ?? 0);
      second.tune.setValue(patch.osc2Tune ?? 0);
      box.cutoff.setValue(20 * Math.pow(1000, value('tone')));
      // Keep the entire macro range musical. The old exponential mapping
      // became painfully resonant near the top of the Character control.
      box.resonance.setValue(.04 + Math.pow(value('character'), 2) * 1.65);
      box.attack.setValue(.002 + Math.pow(value('attack'), 2) * 3.5);
      box.decay.setValue(patch.decay ?? (.08 + value('character') * .8));
      box.sustain.setValue(patch.sustain ?? (.35 + value('tone') * .5));
      box.release.setValue(.02 + Math.pow(value('release'), 2) * 6);
      box.filterEnvelope.setValue(patch.filterEnvelope ?? (value('character') * .72));
      box.glideTime.setValue(patch.glide ?? Math.pow(value('motion'), 2) * .42);
      box.voicingMode.setValue(preset.kind === 'BASS' || patch.mono === 1 ? VoicingMode.Monophonic : VoicingMode.Polyphonic);
      box.unisonCount.setValue(Math.max(1, Math.round(patch.unison ?? (1 + value('width') * 6))));
      box.unisonDetune.setValue(2 + value('width') * 20);
      box.unisonStereo.setValue(value('width'));
      box.lfo.rate.setValue(.15 + value('motion') * 7.5);
      box.lfo.targetCutoff.setValue(value('motion') * .72);
      box.lfo.targetTune.setValue(value('motion') * .012);
      box.noise.volume.setValue(patch.noise ?? Number.NEGATIVE_INFINITY);
      box.version.setValue(2);
    } else if (box instanceof CubedDeviceBox) {
      box.cutoff.setValue(Math.max(0, Math.min(1, (patch.cutoff ?? .5) * .45 + value('tone') * .7)));
      box.resonance.setValue(Math.max(0, Math.min(1, (patch.resonance ?? .5) * .5 + value('character') * .6)));
      box.envMod.setValue(Math.max(0, Math.min(1, (patch.envMod ?? .5) * .45 + value('motion') * .65)));
      box.decay.setValue(Math.max(0, Math.min(1, (patch.decay ?? .4) * .45 + value('release') * .7)));
      box.accent.setValue(Math.max(0, Math.min(1, (patch.accent ?? .5) * .45 + value('width') * .6)));
      box.waveform.setValue(patch.waveform ?? (value('character') > .55 ? 1 : 0));
      box.volume.setValue(-3);
      box.version.setValue(1);
    } else if (box instanceof NeonDeviceBox) {
      box.lineSelect.setValue(Math.round(patch.lineSelect ?? value('tone') * 3));
      box.modulation.setValue(Math.round(patch.modulation ?? value('character') * 2));
      box.detune.setValue((value('width') - .5) * 28);
      box.glideTime.setValue(Math.pow(value('motion'), 2) * .4);
      box.voicingMode.setValue(preset.kind === 'BASS' ? VoicingMode.Monophonic : VoicingMode.Polyphonic);
      box.vibrato.rate.setValue(.6 + value('motion') * 8);
      box.vibrato.depth.setValue(value('motion') * .04);
      const lines = box.lines.fields();
      lines[0]!.wave1.setValue(patch.wave1 ?? 2);
      lines[0]!.wave2.setValue(patch.wave2 ?? 0);
      lines[1]!.wave1.setValue(patch.wave2 ?? 0);
      lines[1]!.wave2.setValue(patch.wave1 ?? 2);
      for (const index of [2, 5]) {
        const envelope = box.envelopes.fields()[index]!;
        envelope.rate1.setValue(Math.round(99 - value('attack') * 82));
        envelope.level1.setValue(99);
        envelope.sustain.setValue(1);
        envelope.end.setValue(2);
        envelope.rate2.setValue(Math.round(99 - value('release') * 88));
      }
      for (const index of [1, 4]) {
        const envelope = box.envelopes.fields()[index]!;
        envelope.level1.setValue(Math.round(28 + value('tone') * 71));
      }
    } else if (box instanceof PlayfieldDeviceBox) {
      const samples = IndexedBox.collectIndexedBoxes(box.samples).filter((item): item is PlayfieldSampleBox => item instanceof PlayfieldSampleBox);
      samples.forEach((sample, index) => {
        sample.pitch.setValue((value('tone') - .5) * 4);
        sample.sampleStart.setValue(value('motion') * .018);
        sample.attack.setValue(value('attack') * .02);
        sample.release.setValue(.04 + value('release') * 1.8);
        sample.volume.setValue(-4 + value('character') * 4);
        sample.panning.setValue((index % 2 ? 1 : -1) * value('width') * .32);
      });
    }
  }

  private async ensureDrumAttachment(variant: number): Promise<InstrumentFactories.PlayfieldAttachment> {
    const cached = this.drumAttachments.get(variant);
    if (cached) return cached;
    const service = this.sampleService;
    const manager = this.sampleManager;
    if (!service || !manager) throw new Error('OpenDAW is still loading its drum sounds.');
    const files = DRUM_KIT_FILES[variant] ?? DRUM_KIT_FILES[0]!;
    const rows: Array<{ note: number; uuid: UUID.Bytes; name: string; durationInSeconds: number; exclude: boolean }> = [];
    for (let index = 0; index < files.length; index++) {
      const [name, path] = files[index]!;
      const response = await fetch(`${import.meta.env.BASE_URL}studio-kits/${path}`);
      if (!response.ok) throw new Error(`Studio could not load ${name}. Reload and choose the kit again.`);
      const sample = await service.importFile({
        name: `${name}.wav`, bpm: 0, arrayBuffer: await response.arrayBuffer(), origin: 'import',
      });
      const uuid = UUID.parse(sample.uuid);
      await manager.getAudioData(uuid);
      rows.push({ note: 36 + index, uuid, name, durationInSeconds: sample.duration, exclude: false });
    }
    const attachment: InstrumentFactories.PlayfieldAttachment = rows;
    this.drumAttachments.set(variant, attachment);
    return attachment;
  }

  private async start(): Promise<void> {
    const lifecycle = this.lifecycle;
    if (!crossOriginIsolated) {
      throw new Error('Studio needs its secure audio lane. Reload through the school Chatter address.');
    }
    // Workers are process-wide in openDAW. React's development remount can
    // create a second Studio bridge after the shared worker is already ready.
    // Reuse it; creating a fallback engine would hide a real initialization bug.
    try {
      await Workers.install(WorkersUrl);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Workers are already installed') throw error;
    }
    const context = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
    WasmEngine.install({
      processorUrl: WasmProcessorUrl,
      offlineWorkerUrl: WasmOfflineWorkerUrl,
      // The engine appends /wasm, including when this release lives below the reader.
      wasmUrl: import.meta.env.BASE_URL.replace(/\/$/, ''),
    });
    const [wasmReady, audioWorklets] = await Promise.all([
      wasmWorklets.ensure(context, WasmEngine.isReady, (target) => WasmEngine.ensureReady(target)),
      AudioWorklets.createFor(context),
    ]);
    if (!wasmReady) {
      await context.close();
      throw new Error('openDAW could not start its audio engine. Try reloading this page.');
    }
    if (lifecycle !== this.lifecycle) {
      await context.close();
      return;
    }

    const sampleManager = new GlobalSampleLoaderManager({
      fetch: async () => { throw new Error('This sound is not on this Chromebook.'); },
    });
    const soundfontManager = new GlobalSoundfontLoaderManager({
      fetch: async () => { throw new Error('Studio is an audio room, not a MIDI instrument room.'); },
    });
    const sampleService = new SampleService(context, BpmDetector.Unknown);
    const project = Project.new({
      audioContext: context, audioWorklets, sampleManager, soundfontManager,
      sampleService, soundfontService: new SoundfontService(),
    });
    project.editing.modify(() => project.api.setBpm(96));
    if (lifecycle !== this.lifecycle) {
      project.terminate();
      await context.close();
      return;
    }
    // The headless SDK registers meter and transport readers but does not drive them.
    // This shared driver is idempotent and survives ordinary room teardown.
    AnimationFrame.start(window);
    project.startAudioWorklet();
    await project.engine.isReady();
    if (lifecycle !== this.lifecycle) {
      project.terminate();
      await context.close();
      return;
    }

    this.context = context;
    this.project = project;
    this.sampleService = sampleService;
    this.sampleManager = sampleManager;
  }

  private assertProject(): Project {
    if (!this.project) throw new Error('OpenDAW is still getting Studio ready.');
    return this.project;
  }

  private applyEffectSettings(box: EffectBox, effect: GarageEffect, settings: GarageEffectSettings): void {
    const amount = Math.max(0, Math.min(1, settings.amount));
    const character = Math.max(0, Math.min(1, settings.character));
    if (effect === 'CLEANUP' && box instanceof GateDeviceBox) {
      box.label.setValue('Clean Up');
      box.threshold.setValue(-58 + character * 34);
      box.return.setValue(3);
      box.attack.setValue(4);
      box.hold.setValue(55);
      box.release.setValue(90 + (1 - character) * 360);
      box.floor.setValue(-30 - amount * 42);
    } else if (effect === 'VOICE_SHINE' && box instanceof CompressorDeviceBox) {
      box.label.setValue('Even It Out');
      box.automakeup.setValue(true);
      box.threshold.setValue(-8 - character * 22);
      box.ratio.setValue(2 + character * 6);
      box.knee.setValue(5 + (1 - character) * 8);
      box.attack.setValue(20 - character * 15);
      box.release.setValue(90 + (1 - character) * 260);
      box.mix.setValue(amount);
    } else if (effect === 'SPACE' && box instanceof ReverbDeviceBox) {
      box.label.setValue('Room');
      box.decay.setValue(0.18 + character * 0.77);
      box.preDelay.setValue(0.006 + character * 0.075);
      box.damp.setValue(0.72 - character * 0.42);
      box.filter.setValue(-0.12 + character * 0.28);
      box.wet.setValue(-30 + Math.sqrt(amount) * 25);
      box.dry.setValue(0);
    } else if (effect === 'ECHO' && box instanceof DelayDeviceBox) {
      box.label.setValue('Echo');
      box.feedback.setValue(0.12 + character * 0.52);
      box.cross.setValue(0.65 + character * 0.35);
      box.filter.setValue(-0.28 + character * 0.38);
      box.wet.setValue(-34 + Math.sqrt(amount) * 27);
      box.dry.setValue(0);
    } else if (effect === 'TUNE' && box instanceof AutotuneDeviceBox) {
      box.label.setValue('Tune It');
      box.key.setValue(Math.round(Math.max(0, Math.min(11, settings.key))));
      box.scale.setValue(Math.round(Math.max(0, Math.min(7, settings.scale))));
      box.amount.setValue(amount);
      box.retune.setValue(0.12 + character * 0.86);
      box.smooth.setValue(0.82 - character * 0.68);
      box.shift.setValue(0);
    } else if (effect === 'ROBOT' && box instanceof CrusherDeviceBox) {
      box.label.setValue('Robot Radio');
      box.crush.setValue(0.08 + character * 0.82);
      box.bits.setValue(Math.round(16 - character * 12));
      box.boost.setValue(character * 3);
      box.mix.setValue(Math.max(0.001, amount));
    }
  }

  private noteView(note: NoteEventBox): MidiNoteView {
    return {
      engineId: UUID.toString(note.address.uuid),
      pitch: note.pitch.getValue(),
      startBeat: note.position.getValue() / PPQN.Quarter,
      durationBeats: note.duration.getValue() / PPQN.Quarter,
      velocity: note.velocity.getValue(),
    };
  }

  private currentPositionPulse(): number {
    if (!this.context) return this.transportPositionPulse;
    if (this.midiRecording) {
      return this.applyLoop(this.midiRecording.startPulse + PPQN.secondsToPulses(
        Math.max(0, this.context.currentTime - this.midiRecording.startContextTime),
        this.bpm,
      ));
    }
    if (!this.transportClock) return this.transportPositionPulse;
    return this.applyLoop(this.transportClock.startPulse + PPQN.secondsToPulses(
      Math.max(0, this.context.currentTime - this.transportClock.startContextTime),
      this.bpm,
    ));
  }

  private applyLoop(pulse: number): number {
    const { enabled, fromPulse, toPulse } = this.loopRange;
    if (!enabled || pulse < toPulse) return pulse;
    const duration = toPulse - fromPulse;
    return duration > 0 ? fromPulse + ((pulse - fromPulse) % duration) : pulse;
  }

  private registerMidiRegion(region: NoteRegionBox): RecordedMidiClip {
    const collection = region.events.targetVertex
      .map(({ box }) => box instanceof NoteEventCollectionBox ? box : undefined)
      .unwrap('Recorded MIDI region has no event collection.');
    const engineId = UUID.toString(region.address.uuid);
    this.clips.set(engineId, { region, noteCollection: collection, notes: new Map() });
    return {
      engineId,
      name: region.label.getValue() || 'MIDI take',
      startSec: PPQN.pulsesToSeconds(region.position.getValue(), this.bpm),
      durationSec: PPQN.pulsesToSeconds(region.duration.getValue(), this.bpm),
      notes: this.getMidiNotes(engineId),
    };
  }

  private assertTrack(id: string): EngineTrack {
    const track = this.tracks.get(id);
    if (!track) throw new Error('That track is no longer in Studio.');
    return track;
  }

  private assertClip(id: string): EngineClip {
    const clip = this.clips.get(id);
    if (!clip) throw new Error('That audio clip is no longer in Studio.');
    return clip;
  }
}
