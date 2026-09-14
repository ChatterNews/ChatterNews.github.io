import { useSessionCheckpoint } from '../store/useSessionCheckpoint.js';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  addAudioClip, addEffect, addSamplerTrack, addTrack, appendArrangementSection, applyGarageArrangementRecipe,
  applyVoicePreset, arrangementEndBeat, audibleTracks, beatsToSeconds, checkGarageMix, clipDuration, deliverableBytes,
  DEFAULT_SAMPLER_SETTINGS, defaultInstrumentPreset, effectSettingsFor, emptyProject, instrumentPreset,
  formatSeconds, garageArrangementRecipe, GARAGE_ARRANGEMENT_RECIPES, moveArrangementSection,
  projectSeconds, recordRole, recolorArrangementSection, removeArrangementSection, renameArrangementSection,
  replaceMidiNotes, removeEffect, resizeArrangementSection, saveDeliverable,
  samplerSettingsFor, secondsToBeats, setEffectSettings, setInstrumentControl,
  setInstrumentPreset, setProjectBpm,
  setSamplerSettings, setTrackContentRole, setTrackGain, setTrackPan, toggleMute, toggleSolo,
  type AudioClip, type AudioTrack, type ClipSource, type Deliverable, type GarageArrangementRecipeId,
  type GarageArrangementSection, type GarageEffect, type GarageProject,
  type GarageEffectSettings, type GarageInstrumentControl,
  type GarageInstrumentControls, type GarageInstrumentPreset, type GarageMixReading,
  type GarageSamplerSettings, type GarageTrackKind, type GarageVoicePreset,
  type GarageTrackContentRole,
  type MidiNote, type Story, type User,
  StudioHistory, copyStudioClips, pasteStudioClips, moveStudioClips, trimStudioClip, splitStudioClips, deleteStudioClips,
  saveStudioSession, flushStudioSaves, loadStudioSession, linkStudioSession, visibleStudioNotes, studioSourceNotePatch, type StudioClipboard,
} from '@chatter/shared';
import { restoreStudioProject } from '../audio/studio-restore.js';
import { applyStudioTransaction } from '../audio/studio-transaction.js';
import { StudioMixer, STUDIO_COLORS } from './StudioMixer.js';
import { StudioSoundCabinet, StudioSoundPad } from './StudioSoundCabinet.js';
import { OpenDawEngine } from '../audio/OpenDawEngine.js';
import { ingestShelfSample } from '../audio/sample-use.js';
import type { SampleLibraryEntry } from '../audio/sample-library.js';
import { analyzeMixBlob, summarizeAudioBlob } from '../audio/studio-mix-analysis.js';
import { chooseRecorderMime, microphoneErrorMessage, musicMicrophoneConstraints } from '../audio/microphone.js';
import { playheadLeftPx, shouldPublishPlayhead, studioTimelineLabels } from '../audio/studio-performance.js';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { Icon } from '../components/Sprite.js';
import { LookInside } from '../components/LookInside.js';
import { noteName, PianoRoll, type PianoTool } from '../components/PianoRoll.js';
import { SampleShelf } from '../components/SampleShelf.js';
import { useReilyFocus, useReilyRecovery } from '../components/ReilyContextProvider.js';
import { studioReilyFocus, studioReilyRecovery } from '../components/reily-room-focus.js';
import { StudioMixCheck } from './StudioMixCheck.js';
import { StudioSamplerWorkbench } from './StudioSamplerWorkbench.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './GarageDaw.css';
import './StudioWorkbench.css';

const QWERTY_KEYS = [
  ['KeyA', 'A', 0], ['KeyW', 'W', 1], ['KeyS', 'S', 2], ['KeyE', 'E', 3], ['KeyD', 'D', 4],
  ['KeyF', 'F', 5], ['KeyT', 'T', 6], ['KeyG', 'G', 7], ['KeyY', 'Y', 8], ['KeyH', 'H', 9],
  ['KeyU', 'U', 10], ['KeyJ', 'J', 11], ['KeyK', 'K', 12], ['KeyO', 'O', 13], ['KeyL', 'L', 14],
  ['KeyP', 'P', 15], ['Semicolon', ';', 16], ['Quote', "'", 17],
] as const;
const DRUM_KEYS = [
  ['KeyQ', 'Q', 44], ['KeyW', 'W', 45], ['KeyE', 'E', 46], ['KeyR', 'R', 47],
  ['KeyT', 'T', 48], ['KeyY', 'Y', 49], ['KeyU', 'U', 50], ['KeyI', 'I', 51],
  ['KeyA', 'A', 36], ['KeyS', 'S', 37], ['KeyD', 'D', 38], ['KeyF', 'F', 39],
  ['KeyG', 'G', 40], ['KeyH', 'H', 41], ['KeyJ', 'J', 42], ['KeyK', 'K', 43],
] as const;

type RecordingMode = 'MIDI' | 'AUDIO';
type RecordQuantize = 'OFF' | '1/8' | '1/16';
type DockTab = 'INPUT' | 'VOICE' | 'INSTRUMENT' | 'EDITOR' | 'MIXER';
type MicrophoneState = 'IDLE' | 'ASKING' | 'READY' | 'BLOCKED' | 'UNAVAILABLE';
type LoopDragMode = 'MOVE' | 'START' | 'END';
type PracticeNote = { pitch: number; startMs: number; endMs: number; velocity: number };

const VOICE_EFFECTS: GarageEffect[] = ['CLEANUP', 'VOICE_SHINE', 'SPACE', 'ECHO', 'TUNE', 'ROBOT'];
const VOICE_PRESETS: Array<{ id: Exclude<GarageVoicePreset, 'CUSTOM'>; name: string; note: string; mark: string }> = [
  { id: 'RAW', name: 'Raw', note: 'No effects', mark: '○' },
  { id: 'NEWS_VOICE', name: 'News Voice', note: 'Clean and steady', mark: '●' },
  { id: 'WARM_STORY', name: 'Warm Story', note: 'Close and cozy', mark: '☀' },
  { id: 'BIG_SCENE', name: 'Big Scene', note: 'Wide and dramatic', mark: '✦' },
  { id: 'TUNED', name: 'Tuned', note: 'Musical vocals', mark: '♪' },
  { id: 'RADIO', name: 'Radio', note: 'Crunchy character', mark: '⌁' },
];
const EFFECT_INFO: Record<GarageEffect, {
  name: string; kicker: string; description: string; amount: string; character: string; mark: string;
}> = {
  CLEANUP: { name: 'Clean Up', kicker: 'GATE', description: 'Turns down room noise in the quiet gaps.', amount: 'Cleanup', character: 'Sensitivity', mark: '✂' },
  VOICE_SHINE: { name: 'Even It Out', kicker: 'COMPRESSOR', description: 'Brings whispers and loud words closer together.', amount: 'Mix', character: 'Punch', mark: '↕' },
  SPACE: { name: 'Room', kicker: 'REVERB', description: 'Places the voice in a space, from booth to hall.', amount: 'Mix', character: 'Room size', mark: '◌' },
  ECHO: { name: 'Echo', kicker: 'DELAY', description: 'Sends words bouncing behind the original.', amount: 'Mix', character: 'Repeats', mark: '»' },
  TUNE: { name: 'Tune It', kicker: 'PITCH', description: 'Pulls sung notes toward the song’s key.', amount: 'Amount', character: 'Snap', mark: '♪' },
  ROBOT: { name: 'Robot Radio', kicker: 'CRUSHER', description: 'Adds a crunchy digital broadcast voice.', amount: 'Mix', character: 'Grit', mark: '▦' },
};
const NOTE_KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const TUNE_SCALES = ['Chromatic', 'Major', 'Minor', 'Dorian', 'Mixolydian', 'Pentatonic', 'Blues', 'Whole tone'];
const SONG_PART_COLORS = ['#ff6dad', '#55dfe8', '#f6d45d', '#b9ee46', '#b899ff', '#ffae65', '#8c9dff', '#8f859a'];

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
}

function kindLabel(kind: GarageTrackKind): string {
  return kind === 'AUDIO' ? 'Voice / audio' : kind === 'KEYS' ? 'Keys & synths' : kind === 'BASS' ? 'Bass' : kind === 'PAD' ? 'Pads' : kind === 'SAMPLER' ? 'Sampler' : 'Drum kit';
}

function songPartSpan(section: GarageArrangementSection): string {
  const firstBar = section.startBeat / 4 + 1;
  const lastBar = (section.startBeat + section.durationBeats) / 4;
  return firstBar === lastBar ? `bar ${firstBar}` : `bars ${firstBar}–${lastBar}`;
}

const INSTRUMENT_CONTROLS: Array<{ id: GarageInstrumentControl; label: string; low: string; high: string }> = [
  { id: 'tone', label: 'Tone', low: 'Dark', high: 'Bright' },
  { id: 'character', label: 'Character', low: 'Smooth', high: 'Bite' },
  { id: 'attack', label: 'Attack', low: 'Fast', high: 'Slow' },
  { id: 'release', label: 'Release', low: 'Short', high: 'Long' },
  { id: 'motion', label: 'Motion', low: 'Still', high: 'Moving' },
  { id: 'width', label: 'Width', low: 'Narrow', high: 'Wide' },
];

function VoiceLab({ track, onPreset, onToggle, onChange }: {
  track: AudioTrack;
  onPreset(preset: Exclude<GarageVoicePreset, 'CUSTOM'>): void;
  onToggle(effect: GarageEffect): void;
  onChange(effect: GarageEffect, patch: Partial<GarageEffectSettings>): void;
}) {
  return <div className="voice-lab-panel">
    <div className="voice-lab-head">
      <div className="voice-lab-title"><span className="instrument-mark kind-audio">✦</span><div><small>VOICE LAB {track.voicePreset === 'CUSTOM' && <em>· CUSTOM MIX</em>}</small><h3>Pick a sound. Make it yours.</h3><p>Start with a recipe, then switch pieces on and shape the mix.</p></div></div>
      <div className="voice-preset-bank" role="group" aria-label="Vocal sound recipes">
        {VOICE_PRESETS.map((preset) => <button
          key={preset.id}
          type="button"
          className={track.voicePreset === preset.id ? 'active' : ''}
          onClick={() => onPreset(preset.id)}
        ><b>{preset.mark} {preset.name}</b><span>{preset.note}</span></button>)}
      </div>
    </div>

    <div className="voice-effect-rack">
      {VOICE_EFFECTS.map((effect) => {
        const info = EFFECT_INFO[effect];
        const settings = effectSettingsFor(track, effect);
        const enabled = track.effects.includes(effect);
        return <article key={effect} className={`voice-effect ${enabled ? 'active' : ''}`}>
          <header>
            <span className="voice-effect-mark">{info.mark}</span>
            <div><small>{info.kicker}</small><b>{info.name}</b></div>
            <button type="button" role="switch" aria-checked={enabled} aria-label={`${enabled ? 'Turn off' : 'Turn on'} ${info.name}`} onClick={() => onToggle(effect)}><i /></button>
          </header>
          <p>{info.description}</p>
          <label className="effect-main-control"><span>{info.amount}<b>{Math.round(settings.amount * 100)}%</b></span><input
            type="range" min="0" max="1" step="0.01" value={settings.amount} disabled={!enabled}
            onChange={(event) => onChange(effect, { amount: Number(event.target.value) })}
          /></label>
          <details>
            <summary>Fine tune <span>＋</span></summary>
            <label><span>{info.character}<b>{Math.round(settings.character * 100)}%</b></span><input
              type="range" min="0" max="1" step="0.01" value={settings.character} disabled={!enabled}
              onChange={(event) => onChange(effect, { character: Number(event.target.value) })}
            /></label>
            {effect === 'TUNE' && <div className="tune-key-row">
              <label>Key<select value={settings.key} disabled={!enabled} onChange={(event) => onChange(effect, { key: Number(event.target.value) })}>{NOTE_KEYS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
              <label>Scale<select value={settings.scale} disabled={!enabled} onChange={(event) => onChange(effect, { scale: Number(event.target.value) })}>{TUNE_SCALES.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
            </div>}
          </details>
        </article>;
      })}
    </div>
    <div className="voice-lab-foot"><b>Hear it in context.</b><span>Press Play while you adjust. Every switch and slider is included in the final WAV.</span></div>
  </div>;
}

export function Studio({ stories, me }: { stories: Story[]; me?: User }) {
  const store = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { gate } = useGate();
  const engine = useRef<OpenDawEngine>();
  if (!engine.current) engine.current = new OpenDawEngine();

  const [project, setProjectState] = useState<GarageProject>(() => emptyProject('Untitled Studio session'));
  const [selectedArrangementSectionId, setSelectedArrangementSectionId] = useState<string>();
  const [songMapChooserOpen, setSongMapChooserOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState<RecordingMode>();
  const [precountBars, setPrecountBars] = useState<0 | 1 | 2>(1);
  const [countInRemaining, setCountInRemaining] = useState<number>();
  const [recordQuantize, setRecordQuantize] = useState<RecordQuantize>('1/16');
  const [sustainActive, setSustainActive] = useState(false);
  const [practiceNoteCount, setPracticeNoteCount] = useState(0);
  const [bouncing, setBouncing] = useState(false);
  const [status, setStatusValue] = useState('Loading OpenDAW…');
  const [statusIsError, setStatusIsError] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string>();
  const [selectedClipId, setSelectedClipId] = useState<string>();
  const [dockTab, setDockTab] = useState<DockTab>('INSTRUMENT');
  const [dockOpen, setDockOpen] = useState(false);
  const [cabinetOpen, setCabinetOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia?.('(max-width: 700px)').matches);
  const [compactToolsOpen, setCompactToolsOpen] = useState(false);
  const [dockHeight, setDockHeight] = useState(270);
  const [clipSelection, setClipSelection] = useState<string[]>([]);
  const [armedTrackId, setArmedTrackId] = useState<string>();
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [keyboardEnabled, setKeyboardEnabled] = useState(true);
  const [editingBusy, setEditingBusy] = useState(false);
  const [engineRevision,setEngineRevision]=useState(0);
  const [saveStatus, setSaveStatus] = useState('Opening session…');
  const [contextMenu, setContextMenu] = useState<{x:number;y:number}>();
  const editBusyRef = useRef(false);
  const sessionReady = useRef(false);
  const storedSession = useRef(false);
  const sessionTouched = useRef(false);
  const bindingBusyRef = useRef(false);
  const songHistory = useRef<StudioHistory>();
  const historyGroup = useRef<string>();
  const clipboard = useRef<StudioClipboard>();
  const recordingTrack = useRef<AudioTrack>();
  const previewTrack = useRef<string>();
  const previewGeneration = useRef(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>();

  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopFromBeat, setLoopFromBeat] = useState(0);
  const [loopToBeat, setLoopToBeat] = useState(16);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>('IDLE');
  const [microphoneMessage, setMicrophoneMessage] = useState('Check the input before recording a take.');
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('');
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [monitoring, setMonitoring] = useState(false);
  const microphoneAnalyser = useRef<AnalyserNode>();
  const [pixelsPerBeat, setPixelsPerBeat] = useState(42);
  const [pianoTool, setPianoTool] = useState<PianoTool>('SELECT');
  const [gridBeat, setGridBeat] = useState(0.25);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [midiOctave, setMidiOctave] = useState(4);
  const [midiVelocity, setMidiVelocity] = useState(0.78);
  const [changingInstrument, setChangingInstrument] = useState(false);
  const [activeMidiPitches, setActiveMidiPitches] = useState<number[]>([]);
  const [editorLowestPitch, setEditorLowestPitch] = useState(48);
  const [lastMidiDuration, setLastMidiDuration] = useState(0.25);
  const [clipPreview, setClipPreview] = useState<Record<string, { startBeat: number; durationBeats: number }>>({});
  // null means unresolved; '' is an explicitly opened local scratch session.
  const [storyId, setStoryId] = useState<string | null>(null);
  const [storyChoices, setStoryChoices] = useState(stories);
  const [linkStoryId, setLinkStoryId] = useState('');
  const [bindingBusy, setBindingBusy] = useState(false);

  useEffect(() => { setStoryChoices(stories); }, [stories]);

  useEffect(() => {
    const requested = searchParams.get('story');
    if (requested && requested !== storyId && storyChoices.some((item) => item.id === requested)) void switchStudioStory(requested, false);
  }, [searchParams, storyChoices, storyId]);
  const [boothFiles, setBoothFiles] = useState<Deliverable[]>([]);
  const [boothPickerOpen, setBoothPickerOpen] = useState(false);
  const [showAllBoothFiles, setShowAllBoothFiles] = useState(false);
  const [boothFilesLoading, setBoothFilesLoading] = useState(true);
  const [boothFilesFailed, setBoothFilesFailed] = useState(false);
  const [boothImportingId, setBoothImportingId] = useState<string>();
  const [sampleShelfOpen, setSampleShelfOpen] = useState(false);
  const [mixCheckOpen, setMixCheckOpen] = useState(false);
  const [mixReading, setMixReading] = useState<GarageMixReading>();
  const [mixMeasuring, setMixMeasuring] = useState(false);

  const recorder = useRef<MediaRecorder>();
  const savingMicrophoneTake = useRef(false);
  const microphoneStream = useRef<MediaStream>();
  const microphoneMeterContext = useRef<AudioContext>();
  const microphoneMeterFrame = useRef<number>();
  const audioChunks = useRef<Blob[]>([]);
  const audioRecordStartSec = useRef(0);
  const audioRecordTrackId = useRef<string>();
  const loadedSamplerPresetIds = useRef(new Set<string>());
  const projectRef = useRef(project);
  const samplerSaveTimers = useRef(new Map<string, number>());
  const samplerPendingSaves = useRef(new Map<string, GarageSamplerSettings>());
  const studioMounted = useRef(true);
  const filePicker = useRef<HTMLInputElement>(null);
  const pendingImportTrackId = useRef<string>();
  const pendingImportRuntime = useRef<OpenDawEngine>();
  const pendingImportStartSec = useRef(0);
  const heldComputerKeys = useRef(new Map<string, number>());
  const auditioningPitches = useRef(new Set<number>());
  const sustainedPitches = useRef(new Set<number>());
  const sustainHeld = useRef(false);
  const practiceNotes = useRef<PracticeNote[]>([]);
  const practiceActive = useRef(new Map<number, Omit<PracticeNote, 'endMs'>>());
  const lastPracticeEnd = useRef(0);
  const precountToken = useRef(0);
  const arrangementPlayhead = useRef<HTMLDivElement>(null);
  const lastPlayheadPublish = useRef(0);

  type GarageErrorAction = 'engine' | 'track' | 'record' | 'microphone' | 'import' | 'mixdown';
  const stickyStatusError = useRef<GarageErrorAction>();

  function setProject(change: GarageProject | ((current: GarageProject) => GarageProject)) {
    if (!studioMounted.current) return;
    const next = typeof change === 'function' ? change(projectRef.current) : change;
    projectRef.current = next;
    setProjectState(next);
    if (sessionReady.current) {
      songHistory.current?.commit(next, 'Edit song', historyGroup.current);
      persistProject(next);
    }
  }

  function persistProject(next: GarageProject) {
    if (storyId === null || bindingBusyRef.current) return;
    sessionTouched.current = true;
    setSaveStatus('Saving…');
    void saveStudioSession(store, storyId || undefined, next).then(() => {
      if (studioMounted.current && projectRef.current === next) { storedSession.current = true; setSaveStatus('All changes saved'); }
    }).catch(() => { if (studioMounted.current) setSaveStatus('Save failed — keep this room open and try again'); });
  }

  function currentSessionNeedsSave() {
    return storyId !== null && (storyId !== '' || storedSession.current || sessionTouched.current);
  }

  async function switchStudioStory(nextId: string, updateURL = true) {
    if (nextId === storyId || bindingBusyRef.current || stickyStatusError.current === 'record') return;
    if (recording || recorder.current || savingMicrophoneTake.current || countInRemaining !== undefined || bouncing || editBusyRef.current || boothImportingId || mixMeasuring) {
      setGarageError('Stop the current recording or job before changing Studio sessions. Your song is still here.', 'track');
      return;
    }
    bindingBusyRef.current = true; setBindingBusy(true); setReady(false);
    try {
      if (sessionReady.current && currentSessionNeedsSave()) await saveStudioSession(store, storyId || undefined, projectRef.current);
      await flushStudioSaves(store);
      sessionReady.current = false;
      setStoryId(nextId);
      if (updateURL) {
        const next = new URLSearchParams(searchParams);
        if (nextId) next.set('story', nextId); else next.delete('story');
        setSearchParams(next, { replace: true });
      }
    } catch (error) {
      setReady(sessionReady.current);
      setGarageError(error instanceof Error ? error.message : 'This song could not be saved. Keep Studio open and retry.', 'track');
    } finally { bindingBusyRef.current = false; setBindingBusy(false); }
  }

  async function attachCurrentSession() {
    if (!linkStoryId || storyId !== '' || !sessionReady.current || bindingBusyRef.current) return;
    if (recording || recorder.current || savingMicrophoneTake.current || stickyStatusError.current === 'record' || countInRemaining !== undefined || bouncing || editBusyRef.current || boothImportingId || mixMeasuring) return;
    bindingBusyRef.current = true; setBindingBusy(true); setReady(false);
    try {
      await saveStudioSession(store, undefined, projectRef.current);
      storedSession.current = true;
      await linkStudioSession(store, projectRef.current.id, linkStoryId);
      sessionReady.current = false;
      setStoryId(linkStoryId);
      const next = new URLSearchParams(searchParams); next.set('story', linkStoryId);
      setSearchParams(next, { replace: true });
      setLinkStoryId('');
      clearGarageError('track');
    } catch (error) {
      setReady(sessionReady.current);
      setGarageError(error instanceof Error ? error.message : 'This session could not be linked. Your saved song has been kept.', 'track');
    } finally { bindingBusyRef.current = false; setBindingBusy(false); }
  }

  async function sourceAudio(id: string): Promise<Blob> {
    const asset = await store.assets.get(id);
    if (!asset || asset.gateStatus !== 'APPROVED') throw new Error('This source is missing or awaiting review in Media Bin.');
    const bytes = await store.blobs.get(asset.sha256);
    if (!bytes) throw new Error('Restore the source audio from your Story Drive.');
    return new Blob([bytes as unknown as BlobPart], {type:asset.mime});
  }

  async function applySongEdit(next: GarageProject, historyMove?: 'undo'|'redo') {
    if (editBusyRef.current || recording || countInRemaining !== undefined || !ready) return;
    editBusyRef.current=true; setEditingBusy(true);
    const runtime=engine.current!;
    const previous=projectRef.current;
    const armedId=previous.tracks.find(t=>t.engineId===armedTrackId)?.id;
    const activeId=previous.tracks.find(t=>t.engineId===activeTrackId)?.id;
    const selectedId=previous.tracks.flatMap(t=>t.clips).find(c=>c.engineId===selectedClipId)?.id;
    try {
      stopPresetPreview();
      const result=await applyStudioTransaction(store,runtime,previous,next,sourceAudio,()=>studioMounted.current&&engine.current===runtime);
      if (!studioMounted.current || engine.current!==runtime) return;
      const restored=result.project;
      if(!result.ok){
        if(historyMove==='undo')songHistory.current?.redo();
        if(historyMove==='redo')songHistory.current?.undo();
        historyMove=undefined;
        projectRef.current=restored;setProjectState(restored);songHistory.current?.replaceCurrent(restored);
        setActiveTrackId(restored.tracks.find(t=>t.id===activeId)?.engineId);
        setSelectedClipId(restored.tracks.flatMap(t=>t.clips).find(c=>c.id===selectedId)?.engineId);
        setArmedTrackId(restored.tracks.find(t=>t.id===armedId)?.engineId);
        setEngineRevision(value=>value+1);setPlaying(false);runtime.setPositionBeat(playheadBeat);runtime.setLoop(loopEnabled,loopFromBeat,loopToBeat);runtime.setMetronome(metronomeEnabled);
        setGarageError(`${result.error.message} Your previous song has been restored.`,'track');return;
      }
      if (historyMove) {
        projectRef.current=restored; setProjectState(restored);
        songHistory.current?.replaceCurrent(restored); persistProject(restored);
      } else setProject(restored);
      setActiveTrackId(restored.tracks.find(t=>t.id===activeId)?.engineId ?? restored.tracks[0]?.engineId);
      setSelectedClipId(restored.tracks.flatMap(t=>t.clips).find(c=>c.id===selectedId)?.engineId);
      setArmedTrackId(restored.tracks.find(t=>t.id===armedId)?.engineId);
      setSelectedNoteIds([]);
    } catch(error) {
      if(!studioMounted.current || engine.current!==runtime)return;
      sessionReady.current=false;setReady(false);setPlaying(false);runtime.terminate();
      if(historyMove==='undo')songHistory.current?.redo();
      if(historyMove==='redo')songHistory.current?.undo();
      setGarageError('Studio could not restore the audio engine. Your saved song is kept. Leave Studio and reopen to recover.', 'engine');
    } finally {if(engine.current===runtime){editBusyRef.current=false;setEditingBusy(false);}}
  }

  function undoMidi() {
    if(editBusyRef.current || recording || countInRemaining!==undefined)return;
    const snapshot=songHistory.current?.undo(); if(snapshot)void applySongEdit(snapshot,'undo');
  }
  function redoMidi() {
    if(editBusyRef.current || recording || countInRemaining!==undefined)return;
    const snapshot=songHistory.current?.redo(); if(snapshot)void applySongEdit(snapshot,'redo');
  }
  function selectedClips(){return clipSelection.length ? clipSelection : selectedClip ? [selectedClip.id] : [];}
  function copyClips(){clipboard.current=copyStudioClips(projectRef.current,selectedClips());setStatus('Copied. Place the playhead, then Paste.');}
  function pasteClips(duplicate=false){
    const copied=duplicate ? copyStudioClips(projectRef.current,selectedClips()) : clipboard.current;
    if(!copied?.clips.length)return;
    try {
      const next=pasteStudioClips(projectRef.current,copied,duplicate ? copied.endSec : beatsToSeconds(playheadBeat,project.bpm),duplicate ? undefined : activeTrack?.id);
      const oldIds=new Set(projectRef.current.tracks.flatMap(t=>t.clips.map(c=>c.id)));
      setClipSelection(next.tracks.flatMap(t=>t.clips.filter(c=>!oldIds.has(c.id)).map(c=>c.id)));
      void applySongEdit(next); setStatus(duplicate ? 'Another copy, ready to make your own.' : 'Pasted at the playhead.');
    }catch(error){setGarageError((error as Error).message,'track');}
    setContextMenu(undefined);
  }
  function splitClips(){void applySongEdit(splitStudioClips(projectRef.current,selectedClips(),beatsToSeconds(playheadBeat,project.bpm)));setContextMenu(undefined);}
  function deleteClips(){void applySongEdit(deleteStudioClips(projectRef.current,selectedClips()));setClipSelection([]);setContextMenu(undefined);}

  const story = storyChoices.find((item) => item.id === storyId);
  const embeddedPreview = window.self !== window.top;
  const microphoneApiAvailable = window.isSecureContext
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof MediaRecorder !== 'undefined';
  const permissionsPolicy = (document as Document & {
    permissionsPolicy?: { allowsFeature(name: string): boolean };
    featurePolicy?: { allowsFeature(name: string): boolean };
  }).permissionsPolicy ?? (document as Document & {
    featurePolicy?: { allowsFeature(name: string): boolean };
  }).featurePolicy;
  const microphonePolicyAllowed = permissionsPolicy?.allowsFeature('microphone') ?? true;
  const activeTrack = project.tracks.find((track) => track.engineId === activeTrackId);
  const activePreset = activeTrack && activeTrack.kind !== 'AUDIO' && activeTrack.kind !== 'SAMPLER'
    ? instrumentPreset(activeTrack.instrumentPresetId ?? defaultInstrumentPreset(activeTrack.kind)?.id)
    : undefined;
  const activeInstrumentControls: GarageInstrumentControls | undefined = activePreset
    ? (activeTrack?.instrumentControls ?? activePreset.controls)
    : undefined;
  const activeSamplerSettings = activeTrack?.kind === 'SAMPLER' ? samplerSettingsFor(activeTrack) : undefined;
  const activeTrackUsesPads = activeTrack?.kind === 'DRUMS'
    || (activeTrack?.kind === 'SAMPLER' && activeSamplerSettings?.layout === 'SLICE');
  const samplerKeyboardBase = activeSamplerSettings ? (() => {
    const first = Math.max(0, Math.ceil(activeSamplerSettings.rootNote - 12 - activeSamplerSettings.tune));
    const last = Math.min(127, Math.floor(activeSamplerSettings.rootNote + 12 - activeSamplerSettings.tune));
    return Math.max(first, Math.min(last - (QWERTY_KEYS.length - 1), activeSamplerSettings.rootNote - 8));
  })() : undefined;
  const mixChecks = checkGarageMix(project, mixReading);
  const mixFixCount = mixChecks.filter((check) => check.status === 'FIX').length;
  const selectedClip = activeTrack?.clips.find((clip) => clip.engineId === selectedClipId)
    ?? project.tracks.flatMap((track) => track.clips).find((clip) => clip.engineId === selectedClipId);
  const selectedClipTrack = selectedClip
    ? project.tracks.find((track) => track.clips.some((clip) => clip.engineId === selectedClip.engineId))
    : undefined;
  const currentStoryBoothFiles = boothFiles.filter((item) => item.storyId === story?.id);
  const visibleBoothFiles = (showAllBoothFiles ? boothFiles : currentStoryBoothFiles)
    .slice()
    .sort((a, b) => {
      const storyFirst = Number(b.storyId === story?.id) - Number(a.storyId === story?.id);
      const preparedFirst = Number(b.stage === 'REVIEW') - Number(a.stage === 'REVIEW');
      return storyFirst || preparedFirst || b.updatedAt - a.updatedAt;
    });
  const timelineBeats = useMemo(() => {
    const contentBeats = secondsToBeats(projectSeconds(project), project.bpm);
    return Math.ceil(Math.max(64, contentBeats + 16, arrangementEndBeat(project) + 16) / 4) * 4;
  }, [project]);
  const timelineWidth = timelineBeats * pixelsPerBeat;
  const timelineBars = timelineBeats / 4;
  const rulerLabels = useMemo(() => studioTimelineLabels(timelineBars, pixelsPerBeat), [timelineBars, pixelsPerBeat]);
  const selectedClipBeats = selectedClip ? secondsToBeats(clipDuration(selectedClip), project.bpm) : 16;
  const selectedClipOffsetBeat = selectedClip ? secondsToBeats(selectedClip.trimStartSec, project.bpm) : 0;
  const selectedClipStartBeat = selectedClip ? secondsToBeats(selectedClip.startSec, project.bpm) : 0;
  const selectedArrangementSection = project.arrangement?.find((section) => section.id === selectedArrangementSectionId);
  useReilyFocus(studioReilyFocus({
    recording: Boolean(recording || countInRemaining !== undefined),
    pianoRollOpen: dockTab === 'EDITOR' && selectedClip?.source === 'INSTRUMENT',
    mixOpen: mixCheckOpen,
  }));
  const reilyStudioRecovery = statusIsError ? studioReilyRecovery(stickyStatusError.current) : undefined;
  useReilyRecovery(reilyStudioRecovery ? { kind: reilyStudioRecovery, workChanged: false } : undefined);

  useSessionCheckpoint(store, async () => {
    if (!sessionReady.current || bindingBusyRef.current || recording || recorder.current || savingMicrophoneTake.current || stickyStatusError.current === 'record' || countInRemaining !== undefined || bouncing || editingBusy || boothImportingId) throw new Error('Wait for Studio to be ready and stop any recording or export, then retry.');
    for (const [id, settings] of samplerPendingSaves.current) {
      window.clearTimeout(samplerSaveTimers.current.get(id));
      await store.samplerPresets.update(id, { settings });
      samplerPendingSaves.current.delete(id); samplerSaveTimers.current.delete(id);
    }
    if (currentSessionNeedsSave()) await saveStudioSession(store, storyId || undefined, projectRef.current);
  });

  function setStatus(message: string) {
    if (stickyStatusError.current) return;
    setStatusIsError(false);
    setStatusValue(message);
  }

  function setGarageError(message: string, action: GarageErrorAction) {
    stickyStatusError.current = action;
    setStatusIsError(true);
    setStatusValue(message);
  }

  function clearGarageError(action: GarageErrorAction) {
    if (stickyStatusError.current !== action) return;
    stickyStatusError.current = undefined;
    setStatusIsError(false);
  }

  useEffect(() => {
    let alive=true;
    studioMounted.current=true; sessionReady.current=false; setReady(false);
    setPlaying(false); setRecording(undefined); setActiveTrackId(undefined); setSelectedClipId(undefined); setClipSelection([]); setArmedTrackId(undefined);
    const runtime=new OpenDawEngine(); engine.current=runtime;
    void (async()=>{
      const selection = await loadStudioSession(store, storyId, searchParams.get('story') ?? undefined);
      if(!alive)return;
      setStoryChoices(selection.stories);
      if (storyId === null) { setStoryId(selection.storyId); return; }
      const saved = selection.saved;
      storedSession.current = Boolean(saved); sessionTouched.current = false;
      let restored=saved?.project ?? emptyProject(selection.story?.title ?? 'Untitled Studio session');
      if(!saved && storyId){
        for(const preset of (await store.samplerPresets.list()).filter(p=>p.storyId===storyId))
          restored=addSamplerTrack(restored,preset.name,preset.id,preset.sampleName,{presetId:preset.id,sourceAssetId:preset.sourceAssetId,durationSec:preset.durationSec,waveform:preset.waveform,transientPoints:preset.transientPoints,settings:preset.settings});
      }
      await runtime.boot(); if(!alive)return;
      const opened=await restoreStudioProject(store,runtime,restored,()=>alive);
      if(!alive)return;
      projectRef.current=opened;setProjectState(opened);songHistory.current=new StudioHistory(opened);
      sessionReady.current=true;setReady(true);setSaveStatus(saved?'All changes saved':'New session');
      setActiveTrackId(opened.tracks[0]?.engineId);setArmedTrackId(opened.tracks[0]?.engineId);
      setStatus(saved ? 'Welcome back. Your song is right where you left it.' : 'Pick a sound from the cabinet. Let’s hear what happens.');
    })().catch((error:Error)=>{if(alive){setSaveStatus('Saved work kept — could not open');setGarageError(error.message,'engine');}});
    return ()=>{
      alive=false;studioMounted.current=false;sessionReady.current=false;precountToken.current++;
      clearTimeout(previewTimer.current);previewTrack.current=undefined;previewGeneration.current++;editBusyRef.current=false;
      samplerSaveTimers.current.forEach(timer=>window.clearTimeout(timer));samplerSaveTimers.current.clear();
      samplerPendingSaves.current.forEach((settings,presetId)=>{void store.samplerPresets.update(presetId,{settings}).catch(()=>undefined);});samplerPendingSaves.current.clear();
      releaseMicrophone(false);runtime.terminate();
    };
  }, [storyId,store]);

  useEffect(()=>{setMixReading(undefined);},[project]);

  useEffect(() => {
    let live = true;
    setBoothFilesLoading(true);
    void store.deliverables.list().then((items) => {
      if (!live) return;
      setBoothFiles(items.filter((item) => item.kind === 'AUDIO'));
      setBoothFilesFailed(false);
    }).catch(() => {
      if (live) setBoothFilesFailed(true);
    }).finally(() => {
      if (live) setBoothFilesLoading(false);
    });
    return () => { live = false; };
  }, [store, boothPickerOpen]);

  useEffect(() => {
    if (!ready || searchParams.get('booth') !== '1') return;
    setShowAllBoothFiles(false);
    setBoothPickerOpen(true);
    const next = new URLSearchParams(searchParams); next.delete('booth'); setSearchParams(next, { replace: true });
  }, [ready, searchParams, setSearchParams]);

  useEffect(() => {
    if (!boothPickerOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !boothImportingId) setBoothPickerOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [boothPickerOpen, boothImportingId]);

  useEffect(() => {
    if (!playing && !recording) {
      const beat = engine.current!.positionBeat;
      setPlayheadBeat(beat);
      if (arrangementPlayhead.current) arrangementPlayhead.current.style.left = `${playheadLeftPx(beat, pixelsPerBeat)}px`;
      return;
    }
    let frame = 0;
    const update = (now: number) => {
      const beat = engine.current!.positionBeat;
      if (arrangementPlayhead.current) arrangementPlayhead.current.style.left = `${playheadLeftPx(beat, pixelsPerBeat)}px`;
      if (shouldPublishPlayhead(lastPlayheadPublish.current, now)) {
        lastPlayheadPublish.current = now;
        setPlayheadBeat(beat);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing, recording, pixelsPerBeat]);

  useEffect(() => {
    if (!selectedClipTrack) return;
    setEditorLowestPitch(selectedClipTrack.kind === 'BASS' ? 24 : selectedClipTrack.kind === 'DRUMS' ? 32 : 48);
    setSelectedNoteIds([]);
  }, [selectedClipId, selectedClipTrack?.kind]);

  function rememberPracticeStart(pitch: number) {
    if (recording || countInRemaining !== undefined || practiceActive.current.has(pitch)) return;
    const now = performance.now();
    if (lastPracticeEnd.current && now - lastPracticeEnd.current > 3000) {
      practiceNotes.current = [];
      setPracticeNoteCount(0);
    }
    practiceActive.current.set(pitch, { pitch, startMs: now, velocity: midiVelocity });
  }

  function rememberPracticeStop(pitch: number) {
    const started = practiceActive.current.get(pitch);
    if (!started) return;
    const endMs = performance.now();
    practiceActive.current.delete(pitch);
    practiceNotes.current.push({ ...started, endMs });
    lastPracticeEnd.current = endMs;
    setPracticeNoteCount(practiceNotes.current.length);
  }

  function releaseAudition(track: AudioTrack, pitch: number) {
    engine.current!.auditionStop(track.engineId, pitch);
    auditioningPitches.current.delete(pitch);
    sustainedPitches.current.delete(pitch);
    rememberPracticeStop(pitch);
    setActiveMidiPitches([...auditioningPitches.current]);
  }

  useEffect(() => {
    const track = activeTrack;
    if (!track || track.kind === 'AUDIO' || !keyboardEnabled || !dockOpen || !['INSTRUMENT','EDITOR'].includes(dockTab)) return;
    const basePitch = samplerKeyboardBase ?? (midiOctave + 1) * 12;
    const down = (event: KeyboardEvent) => {
      if (editBusyRef.current || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!activeTrackUsesPads && (event.code === 'ShiftLeft' || event.code === 'ShiftRight')) {
        sustainHeld.current = true;
        setSustainActive(true);
        event.preventDefault();
        return;
      }
      if (!activeTrackUsesPads && track.kind !== 'SAMPLER' && (event.code === 'KeyZ' || event.code === 'KeyX')) {
        if (!event.repeat) setMidiOctave((value) => Math.max(1, Math.min(7, value + (event.code === 'KeyX' ? 1 : -1))));
        event.preventDefault();
        return;
      }
      const mapping = activeTrackUsesPads
        ? DRUM_KEYS.find(([code]) => code === event.code)
        : QWERTY_KEYS.find(([code]) => code === event.code);
      if (!mapping || event.repeat || heldComputerKeys.current.has(event.code)) return;
      const pitch = activeTrackUsesPads ? mapping[2] : basePitch + mapping[2];
      if (sustainedPitches.current.has(pitch)) releaseAudition(track, pitch);
      heldComputerKeys.current.set(event.code, pitch);
      auditioningPitches.current.add(pitch);
      setActiveMidiPitches([...auditioningPitches.current]);
      engine.current!.auditionStart(track.engineId, pitch, midiVelocity);
      rememberPracticeStart(pitch);
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (!activeTrackUsesPads && (event.code === 'ShiftLeft' || event.code === 'ShiftRight')) {
        sustainHeld.current = false;
        setSustainActive(false);
        [...sustainedPitches.current].forEach((pitch) => releaseAudition(track, pitch));
        event.preventDefault();
        return;
      }
      const pitch = heldComputerKeys.current.get(event.code);
      if (pitch === undefined) return;
      heldComputerKeys.current.delete(event.code);
      if (sustainHeld.current && !activeTrackUsesPads) sustainedPitches.current.add(pitch);
      else releaseAudition(track, pitch);
      event.preventDefault();
    };
    const release = () => {
      engine.current!.panic();
      heldComputerKeys.current.clear();
      auditioningPitches.current.clear();
      sustainedPitches.current.clear();
      practiceActive.current.clear();
      sustainHeld.current = false;
      setSustainActive(false);
      setActiveMidiPitches([]);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      release();
    };
  }, [activeTrack?.engineId, activeTrack?.kind, activeSamplerSettings?.layout, samplerKeyboardBase, midiOctave, midiVelocity, recording, countInRemaining, keyboardEnabled, dockOpen, dockTab]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || editBusyRef.current) return;
      const instrumentKeys = activeTrackUsesPads ? DRUM_KEYS : QWERTY_KEYS;
      const command=event.metaKey||event.ctrlKey;
      const notesFocused=dockOpen && dockTab==='EDITOR' && !!(event.target as HTMLElement)?.closest('.midi-editor-panel');
      if(command && event.code==='KeyZ'){event.preventDefault();if(event.shiftKey)redoMidi();else undoMidi();return;}
      if(command && event.code==='KeyD' && !notesFocused){event.preventDefault();pasteClips(true);return;}
      if(command && event.code==='KeyC' && !notesFocused){event.preventDefault();copyClips();return;}
      if(command && event.code==='KeyV' && !notesFocused){event.preventDefault();pasteClips();return;}
      if(command && event.code==='KeyA' && !notesFocused){event.preventDefault();setClipSelection(project.tracks.flatMap(t=>t.clips.map(c=>c.id)));return;}
      if((event.key==='Delete'||event.key==='Backspace')&&!notesFocused){event.preventDefault();deleteClips();return;}
      if(event.key==='Escape'){setContextMenu(undefined);setClipSelection([]);return;}
      if(event.altKey&&event.code==='KeyX'){event.preventDefault();splitClips();return;}
      if(!command && keyboardEnabled && dockOpen && ['INSTRUMENT','EDITOR'].includes(dockTab) && activeTrack?.kind !== 'AUDIO' && instrumentKeys.some(([code]) => code === event.code)) return;
      // Let keyboard users activate focused controls before transport shortcuts.
      if ((event.code === 'Space' || event.code === 'Enter') && (event.target as HTMLElement)?.closest('button, summary, [role="button"]')) return;
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        void togglePlay();
      } else if (event.code === 'Enter' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        rewind();
      } else if (event.code === 'KeyR' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        void toggleRecord();
      } else if (event.code === 'KeyC' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        toggleLoop();
      } else if (event.code === 'KeyM' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        toggleMetronome();
      } else if (event.code === 'KeyQ' && !event.ctrlKey && !event.metaKey && selectedNoteIds.length) {
        event.preventDefault();
        quantizeNotes();
      } else if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) redoMidi(); else undoMidi();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClip?.source === 'INSTRUMENT') {
        const targets = selectedClip.notes.filter((note) => selectedNoteIds.includes(note.engineId));
        if (targets.length) {
          event.preventDefault();
          deleteMidiNotes(targets);
        }
      } else if ((event.metaKey || event.ctrlKey) && event.code === 'KeyD' && selectedClip?.source === 'INSTRUMENT') {
        event.preventDefault();
        duplicateSelectedNotes();
      } else if (selectedNoteIds.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
        event.preventDefault();
        if (event.code === 'ArrowLeft') nudgeSelectedNotes({ startBeat: -gridBeat });
        if (event.code === 'ArrowRight') nudgeSelectedNotes({ startBeat: gridBeat });
        if (event.code === 'ArrowUp') nudgeSelectedNotes({ pitch: event.shiftKey ? 12 : 1 });
        if (event.code === 'ArrowDown') nudgeSelectedNotes({ pitch: event.shiftKey ? -12 : -1 });
      }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  });

  async function makeTrack(
    kind: GarageTrackKind, errorAction: GarageErrorAction = 'track', presetId?: string, requestedName?: string,
  ) {
    clearGarageError(errorAction);
    if (!ready || editBusyRef.current || recording || countInRemaining!==undefined || bouncing || mixMeasuring) return undefined;
    if (kind === 'SAMPLER') {
      setSampleShelfOpen(true);
      setStatus('Choose a sound, then press Load sampler.');
      return undefined;
    }
    if(projectRef.current.tracks.length>=128){setGarageError('This session already has 128 tracks. Remove an unused track to add another.','track');return undefined;}
    const preset = kind === 'AUDIO' ? undefined : (presetId ? instrumentPreset(presetId) : defaultInstrumentPreset(kind));
    const actualKind = preset?.kind ?? kind;
    const number = project.tracks.filter((track) => track.kind === actualKind).length + 1;
    const name = requestedName ?? (kind === 'AUDIO' ? `Audio ${number}` : `${preset!.name} ${number}`);
    const runtime=engine.current!;
    editBusyRef.current=true;setEditingBusy(true);stopPresetPreview();
    try {
      const engineId = await runtime.addTrack(name, actualKind, preset?.id);
      if(!studioMounted.current || engine.current!==runtime)return undefined;
      setProject((current) => addTrack(current, name, engineId, actualKind, preset?.id, preset?.controls));
      setActiveTrackId(engineId);
      setArmedTrackId(engineId);
      setDockOpen(true);
      setSelectedClipId(undefined);
      if (preset) { setMidiOctave(preset.octave); }
      setDockTab(actualKind === 'AUDIO' ? 'INPUT' : 'INSTRUMENT');
      setStatus(actualKind === 'AUDIO'
        ? `${name} is selected. Drop audio into its lane or press Record.`
        : `${preset!.name} is ready. Play A W S E D, press Record, or double-click the lane to draw.`);
      return engineId;
    } catch (error) {
      setGarageError((error as Error).message, errorAction);
      return undefined;
    } finally {if(engine.current===runtime){editBusyRef.current=false;setEditingBusy(false);}}
  }

  function syncArrangementEdit(change: (current: GarageProject) => GarageProject) {
    setProject((current) => {
      const before = new Map(current.tracks.flatMap((track) => track.clips.map((clip) => [clip.engineId, clip.startSec] as const)));
      const next = change(current);
      next.tracks.forEach((track) => track.clips.forEach((clip) => {
        const oldStart = before.get(clip.engineId);
        if (oldStart !== undefined && Math.abs(oldStart - clip.startSec) > 0.0001) {
          engine.current!.moveClip(clip.engineId, clip.startSec);
        }
      }));
      return next;
    });
  }

  async function chooseSongMap(recipeId: GarageArrangementRecipeId) {
    if (!ready) return;
    const recipe = garageArrangementRecipe(recipeId);
    const addSuggestedTracks = project.tracks.length === 0;
    const mapped = applyGarageArrangementRecipe(project, recipeId);
    setProject(mapped);
    setSelectedArrangementSectionId(mapped.arrangement?.[0]?.id);
    setSongMapChooserOpen(false);
    seek(0);
    if (addSuggestedTracks) {
      for (const role of recipe.trackRoles) {
        await makeTrack(role.kind, 'track', role.presetId, role.name);
      }
    }
    setStatus(`${recipe.name} is on the Song Map. Pick a part, then set up to record there.`);
  }

  function startCustomSongMap() {
    const next = appendArrangementSection(project, {
      name: 'Part 1', purpose: 'Shape the first part', bars: 8, color: '#55dfe8',
    });
    setProject(next);
    setSelectedArrangementSectionId(next.arrangement?.at(-1)?.id);
    setSongMapChooserOpen(false);
    setStatus('Your first 8-bar part is ready. Rename it, add tracks, and start building.');
  }

  function selectSongPart(section: GarageArrangementSection) {
    if (!ready) return;
    if (playing) {
      engine.current!.stop(false);
      setPlaying(false);
    }
    setSelectedArrangementSectionId(section.id);
    seek(section.startBeat);
    setStatus(`${section.name} starts at bar ${section.startBeat / 4 + 1}.`);
  }

  function playSongPart(section: GarageArrangementSection) {
    if (!ready || recording) return;
    engine.current!.stop(false);
    if (loopEnabled) {
      setLoopEnabled(false);
      engine.current!.setLoop(false, loopFromBeat, loopToBeat);
    }
    engine.current!.setPositionBeat(section.startBeat);
    setPlayheadBeat(section.startBeat);
    engine.current!.play();
    setPlaying(true);
    setStatus(`Playing from ${section.name}.`);
  }

  function prepareSongPart(section: GarageArrangementSection) {
    if (!ready) return;
    const endBeat = section.startBeat + section.durationBeats;
    engine.current!.stop(false);
    setPlaying(false);
    engine.current!.setPositionBeat(section.startBeat);
    setPlayheadBeat(section.startBeat);
    setLoopFromBeat(section.startBeat);
    setLoopToBeat(endBeat);
    setLoopEnabled(true);
    engine.current!.setLoop(true, section.startBeat, endBeat);
    setStatus(`${section.name} is cycled. Choose a track, then press Record when you are ready.`);
  }

  function moveSelectedSongPart(direction: -1 | 1) {
    if (!selectedArrangementSection) return;
    const index = project.arrangement?.findIndex((section) => section.id === selectedArrangementSection.id) ?? -1;
    const target = index + direction;
    if (index < 0 || target < 0 || target >= (project.arrangement?.length ?? 0)) return;
    syncArrangementEdit((current) => moveArrangementSection(current, selectedArrangementSection.id, target));
    setStatus(`${selectedArrangementSection.name} moved ${direction < 0 ? 'earlier' : 'later'} with everything underneath it.`);
  }

  function addSongPart() {
    const next = appendArrangementSection(project, {
      name: `Part ${(project.arrangement?.length ?? 0) + 1}`,
      purpose: 'Shape the next part', bars: 8, color: '#55dfe8',
    });
    setProject(next);
    setSelectedArrangementSectionId(next.arrangement?.at(-1)?.id);
    setStatus('An empty 8-bar part was added to the end.');
  }

  function removeSongPartLabel() {
    if (!selectedArrangementSection) return;
    const remaining = project.arrangement?.filter((section) => section.id !== selectedArrangementSection.id) ?? [];
    syncArrangementEdit((current) => removeArrangementSection(current, selectedArrangementSection.id));
    setSelectedArrangementSectionId(remaining[0]?.id);
    setStatus(`${selectedArrangementSection.name} label removed. Recordings stayed where they were.`);
  }

  async function createMidiClipAt(track: AudioTrack, beat: number) {
    if (track.kind === 'AUDIO' || !ready || editBusyRef.current || recording || countInRemaining!==undefined) return;
    const startBeat = Math.max(0,snapEnabled?Math.round(beat/gridBeat)*gridBeat:beat);
    const name = `${track.name} clip ${track.clips.length + 1}`;
    const made = engine.current!.createMidiClip(track.engineId, name, beatsToSeconds(startBeat, project.bpm), 16);
    setProject((current) => addAudioClip(current, track.id, {
      engineId: made.engineId, name: made.name, source: 'INSTRUMENT',
      startSec: beatsToSeconds(startBeat, current.bpm), sourceDurationSec: made.durationSec, notes: [],
    }));
    setActiveTrackId(track.engineId);
    setSelectedClipId(made.engineId);
    setDockOpen(true);setClipSelection([]);
    setDockTab('EDITOR');
    setStatus('Empty MIDI clip created. Double-click places notes; drag notes to move them.');
  }

  async function togglePlay() {
    if (!ready || recording) return;
    if (playing) {
      engine.current!.stop(false);
      setPlaying(false);
      setPlayheadBeat(engine.current!.positionBeat);
    } else {
      if (loopEnabled && playheadBeat !== loopFromBeat) {
        engine.current!.setPositionBeat(loopFromBeat);
        setPlayheadBeat(loopFromBeat);
      }
      engine.current!.play();
      setPlaying(true);
    }
  }

  function rewind() {
    if (!ready || editBusyRef.current) return;
    engine.current!.stop(false);
    engine.current!.setPositionBeat(0);
    setPlaying(false);
    setPlayheadBeat(0);
  }

  function seek(beat: number) {
    engine.current!.setPositionBeat(beat);
    setPlayheadBeat(beat);
  }

  function toggleLoop() {
    if (!ready) return;
    const enabled = !loopEnabled;
    setLoopEnabled(enabled);
    engine.current!.setLoop(enabled, loopFromBeat, loopToBeat);
  }

  function toggleMetronome() {
    if (!ready) return;
    const enabled = !metronomeEnabled;
    setMetronomeEnabled(enabled);
    engine.current!.setMetronome(enabled);
    setStatus(enabled ? 'Metronome on. It clicks on every beat.' : 'Metronome off.');
  }

  function updateLoopRange(fromBeat: number, toBeat: number) {
    const from = Math.max(0, Math.min(timelineBeats - 1, fromBeat));
    const to = Math.max(from + 1, Math.min(timelineBeats, toBeat));
    setLoopFromBeat(from);
    setLoopToBeat(to);
    engine.current!.setLoop(loopEnabled, from, to);
  }

  function beginLoopDrag(event: ReactPointerEvent, mode: LoopDragMode) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const origin = { from: loopFromBeat, to: loopToBeat };
    const duration = origin.to - origin.from;
    const move = (pointer: PointerEvent) => {
      const delta = Math.round((pointer.clientX - startX) / pixelsPerBeat);
      if (mode === 'MOVE') {
        const from = Math.max(0, Math.min(timelineBeats - duration, origin.from + delta));
        updateLoopRange(from, from + duration);
      } else if (mode === 'START') {
        updateLoopRange(Math.min(origin.to - 1, origin.from + delta), origin.to);
      } else {
        updateLoopRange(origin.from, Math.max(origin.from + 1, origin.to + delta));
      }
    };
    const up = () => window.removeEventListener('pointermove', move);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function changeBpm(value: number) {
    if(!Number.isFinite(value) || !ready || editBusyRef.current)return;
    const bpm = Math.max(40, Math.min(240, Math.round(value)));
    engine.current!.setBpm(bpm);
    setProject((current) => setProjectBpm(current, bpm));
  }

  async function toggleRecord() {
    if(editBusyRef.current || !ready)return;
    stopPresetPreview();
    clearGarageError('record');
    if (countInRemaining !== undefined) {
      precountToken.current += 1;
      setCountInRemaining(undefined);
      setStatus('Count-in cancelled. Press Record when you are ready.');
      return;
    }
    if (recording === 'MIDI') return stopMidiRecording();
    if (recording === 'AUDIO') return stopAudioRecording();
    const target=project.tracks.find(t=>t.engineId===armedTrackId);
    if (!target) {
      setGarageError('Arm a track with its Record button before recording.', 'record');
      return;
    }
    recordingTrack.current=target;
    setActiveTrackId(target.engineId);
    if (target.kind === 'AUDIO') await startAudioRecording(target);
    else await startMidiRecording(target);
  }

  async function runPrecount(track: AudioTrack): Promise<boolean> {
    if (precountBars === 0) return true;
    const token = ++precountToken.current;
    const totalBeats = precountBars * 4;
    setStatus(`${precountBars === 1 ? 'One bar' : 'Two bars'} in. Listen for the high click, then play.`);
    const completed = await engine.current!.playCountIn(
      totalBeats,
      (remaining) => setCountInRemaining(remaining),
      () => precountToken.current === token,
    );
    if (precountToken.current === token) setCountInRemaining(undefined);
    if (!completed) return false;
    setStatus(`Recording ${track.name}.`);
    return true;
  }

  async function startMidiRecording(track: AudioTrack) {
    try {
      if (loopEnabled && playheadBeat !== loopFromBeat) {
        engine.current!.setPositionBeat(loopFromBeat);
        setPlayheadBeat(loopFromBeat);
      }
      if (!await runPrecount(track)) return;
      await engine.current!.startMidiRecording(track.engineId);
      setRecording('MIDI');
      setPlaying(true);
      setStatus(`Recording ${track.name}. Play the computer keyboard; OpenDAW is capturing timing and note length.`);
    } catch (error) {
      setGarageError((error as Error).message, 'record');
    }
  }

  async function stopMidiRecording() {
    const capturedTrack=recordingTrack.current;
    if (!capturedTrack || capturedTrack.kind === 'AUDIO') return;
    try {
      const captured = await engine.current!.stopMidiRecording(capturedTrack.engineId);
      engine.current!.stop(false);
      setRecording(undefined);
      setPlaying(false);
      if (!captured.length) {
        setGarageError('Recording stopped. No notes were captured. Press Record to try again.', 'record');
        return;
      }
      const grid = recordQuantize === '1/8' ? .5 : recordQuantize === '1/16' ? .25 : undefined;
      const finished = grid ? captured.map((take) => {
        const snapped = take.notes.map(({ pitch, startBeat, durationBeats, velocity }) => ({
          pitch,
          startBeat: Math.max(0, Math.round(startBeat / grid) * grid),
          durationBeats: Math.max(grid, Math.round(durationBeats / grid) * grid),
          velocity,
        }));
        return { ...take, notes: engine.current!.replaceMidiNotes(take.engineId, snapped) };
      }) : captured;
      setProject((current) => finished.reduce((next, take) => {
        const target = next.tracks.find((track) => track.engineId === capturedTrack.engineId);
        return target ? addAudioClip(next, target.id, {
          engineId: take.engineId, name: take.name, source: 'INSTRUMENT', startSec: take.startSec,
          sourceDurationSec: take.durationSec, notes: take.notes,
        }) : next;
      }, current));
      setSelectedClipId(finished[0]!.engineId);
      setDockTab('EDITOR');
      setStatus(`Kept ${finished[0]!.notes.length} notes${grid ? ` and lined them up to ${recordQuantize}` : ''}. The take is open for a quick check.`);
    } catch (error) {
      setRecording(undefined);
      setPlaying(false);
      setGarageError((error as Error).message, 'record');
    }
  }

  async function startAudioRecording(track: AudioTrack) {
    try {
      const recordBeat = loopEnabled ? loopFromBeat : playheadBeat;
      if (recordBeat !== playheadBeat) {
        engine.current!.setPositionBeat(recordBeat);
        setPlayheadBeat(recordBeat);
      }
      const stream = microphoneStream.current ?? await checkMicrophone(selectedMicrophoneId, 'record');
      if (!stream) return;
      if (!await runPrecount(track)) return;
      audioChunks.current = [];
      audioRecordStartSec.current = beatsToSeconds(recordBeat, project.bpm);
      audioRecordTrackId.current = track.engineId;
      const mimeType = chooseRecorderMime((mime) => MediaRecorder.isTypeSupported(mime));
      const next = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128_000 })
        : new MediaRecorder(stream);
      next.ondataavailable = (event) => { if (event.data.size) audioChunks.current.push(event.data); };
      next.onstop = () => {
        recorder.current = undefined;
        const blob = new Blob(audioChunks.current, { type: next.mimeType || 'audio/webm' });
        if (!blob.size) {
          setGarageError('The browser returned an empty take. Check that the input meter moves, then press Record again.', 'record');
          releaseMicrophone();
          return;
        }
        const name = `Mic take ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        savingMicrophoneTake.current = true;
        void ingestStudioAudio(blob, name, 'recording', 'RECORDING')
          .then((assetId) => importAudio(blob, name, 'RECORDING', audioRecordTrackId.current!, audioRecordStartSec.current, assetId))
          .catch((error) => setGarageError(error instanceof Error ? error.message : 'Studio could not save that recording.', 'record'))
          .finally(() => { savingMicrophoneTake.current = false; releaseMicrophone(); });
      };
      next.onerror = () => {
        setGarageError('The browser stopped the microphone unexpectedly. Check the selected input and press Record again.', 'record');
        releaseMicrophone();
      };
      next.start(250);
      recorder.current = next;
      engine.current!.play();
      setRecording('AUDIO');
      setPlaying(true);
      setStatus(`Recording ${track.name} at bar ${Math.floor(recordBeat / 4) + 1}. Speak or play while the input meter moves.`);
    } catch (error) {
      const message = microphoneErrorMessage(error, embeddedPreview);
      setMicrophoneState('BLOCKED');
      setMicrophoneMessage(message);
      setGarageError(message, 'record');
    }
  }

  function stopAudioRecording() {
    const active = recorder.current;
    if (active?.state === 'recording') {
      active.requestData();
      active.stop();
    }
    engine.current!.stop(false);
    setRecording(undefined);
    setPlaying(false);
    setStatus('Finishing the microphone take and placing it on the track…');
  }

  async function checkMicrophone(deviceId = selectedMicrophoneId, errorAction: GarageErrorAction = 'microphone'): Promise<MediaStream | undefined> {
    clearGarageError(errorAction);
    if (!microphoneApiAvailable) {
      const message = window.isSecureContext
        ? 'This browser does not provide microphone recording. Open Chatter in current Chrome, Edge, or Safari.'
        : 'Microphone recording needs localhost or an https:// address. This page is not a secure address.';
      setMicrophoneState('UNAVAILABLE');
      setMicrophoneMessage(message);
      setGarageError(message, errorAction);
      return undefined;
    }
    if (!microphonePolicyAllowed) {
      const message = 'This embedded preview blocks microphone access. Open Chatter in a normal browser tab to record audio.';
      setMicrophoneState('BLOCKED');
      setMicrophoneMessage(message);
      setGarageError(message, errorAction);
      return undefined;
    }
    releaseMicrophone(false);
    setMicrophoneState('ASKING');
    setMicrophoneMessage('Waiting for the browser. Choose Allow in the microphone prompt.');
    setStatus('Waiting for microphone permission…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(musicMicrophoneConstraints(deviceId || undefined));
      microphoneStream.current = stream;
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
      setMicrophoneDevices(devices);
      const actualId = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (actualId) setSelectedMicrophoneId(actualId);
      setMicrophoneState('READY');
      setMicrophoneMessage('Input ready. Make sure the meter moves before recording.');
      setStatus('Microphone ready. Press Record when the meter moves.');
      startMicrophoneMeter(stream);
      return stream;
    } catch (error) {
      const message = microphoneErrorMessage(error, embeddedPreview);
      setMicrophoneState('BLOCKED');
      setMicrophoneMessage(message);
      setGarageError(message, errorAction);
      return undefined;
    }
  }

  function startMicrophoneMeter(stream: MediaStream) {
    window.cancelAnimationFrame(microphoneMeterFrame.current ?? 0);
    void microphoneMeterContext.current?.close();
    const context = new AudioContext({ latencyHint: 'interactive' });
    const analyser = context.createAnalyser();
    microphoneAnalyser.current=analyser;setMonitoring(false);
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const update = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
      setMicrophoneLevel(Math.min(1, Math.sqrt(energy / samples.length) * 4));
      microphoneMeterFrame.current = window.requestAnimationFrame(update);
    };
    microphoneMeterContext.current = context;
    void context.resume();
    microphoneMeterFrame.current = window.requestAnimationFrame(update);
  }

  function releaseMicrophone(updateState = true) {
    window.cancelAnimationFrame(microphoneMeterFrame.current ?? 0);
    microphoneMeterFrame.current = undefined;
    void microphoneMeterContext.current?.close();
    microphoneMeterContext.current = undefined;
    microphoneAnalyser.current=undefined;
    if(updateState)setMonitoring(false);
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    microphoneStream.current = undefined;
    if (updateState) {
      setMicrophoneLevel(0);
      setMicrophoneState('IDLE');
      setMicrophoneMessage('Check the input before recording a take.');
    }
  }

  async function importAudio(
    file: Blob, name: string, source: ClipSource, trackEngineId: string, startSec: number, sourceAssetId?: string,
  ): Promise<boolean> {
    const runtime=engine.current!;
    setStatus('Decoding audio with OpenDAW…');
    try {
      const waveform = (await summarizeAudioBlob(file)).waveform;
      if(!studioMounted.current || engine.current!==runtime)return false;
      const imported = await runtime.importAudio(trackEngineId, file, name, startSec);
      if(!studioMounted.current || engine.current!==runtime)return false;
      setProject((current) => {
        const target = current.tracks.find((track) => track.engineId === trackEngineId);
        return target ? addAudioClip(current, target.id, {
          engineId: imported.engineId, name: imported.name, source, startSec,
          sourceDurationSec: imported.durationSec, sourceAssetId, waveform,
        }) : current;
      });
      setSelectedClipId(imported.engineId);
      setDockTab('VOICE');
      setStatus(`${imported.name} is on the arrangement at ${formatSeconds(startSec)}.`);
      return true;
    } catch (error) {
      if(!studioMounted.current || engine.current!==runtime)return false;
      const detail = error instanceof Error ? ` ${error.message}` : '';
      setGarageError(`OpenDAW could not open ${name}. Try WAV, MP3, M4A, OGG, FLAC, or WebM audio.${detail}`, source === 'RECORDING' ? 'record' : 'import');
      return false;
    }
  }

  async function ingestStudioAudio(file: Blob, name: string, source: 'upload' | 'recording' | 'generated', origin: 'UPLOAD' | 'RECORDING' | 'GENERATED'): Promise<string> {
    const result = await gate.ingest({
      source, bytes: new Uint8Array(await file.arrayBuffer()),
      ownDevice: source !== 'upload',
      meta: { kind: 'AUDIO', mime: file.type || 'audio/wav', origin, storyId: story?.id, actor: me?.id, creator: name },
    });
    if (!result.assetId) throw new Error(`Studio could not save ${name} for this story. ${result.reason ?? 'Try the file again.'}`);
    return result.assetId;
  }

  async function useShelfSound(entry: SampleLibraryEntry) {
    clearGarageError('import');
    if (!ready) throw new Error('OpenDAW is still getting Studio ready.');
    const used = await ingestShelfSample({
      gate, store, entry, storyId: story?.id, actorId: me?.id,
    });
    let trackId = activeTrack?.kind === 'AUDIO' ? activeTrack.engineId : undefined;
    if (!trackId) trackId = await makeTrack('AUDIO', 'import', undefined, 'Samples');
    if (!trackId) throw new Error('Studio could not make an audio track for this sound.');
    const added = await importAudio(
      used.file, entry.name, 'IMPORT', trackId, beatsToSeconds(playheadBeat, project.bpm), used.assetId,
    );
    if (!added) throw new Error(`${entry.name} could not be placed on the arrangement.`);
    setStatus(used.status === 'APPROVED'
      ? `${entry.name} is on the arrangement at the playhead.`
      : `${entry.name} is on the arrangement and saved for an adviser’s media check.`);
  }

  async function createSamplerFromAsset(
    file: Blob, sourceAssetId: string, sourceName: string, settings = DEFAULT_SAMPLER_SETTINGS,
  ) {
    if (!ready) throw new Error('OpenDAW is still getting Studio ready.');
    const shortName = sourceName.replace(/\.[^.]+$/, '').slice(0, 34) || 'Sample';
    const trackName = `${shortName} Sampler`;
    const summary = await summarizeAudioBlob(file).catch(() => ({ durationSec: 0, waveform: [] as number[], transientPoints: [0, 1] }));
    const saved = story ? await store.samplerPresets.create({
      storyId: story.id, name: trackName, sampleName: sourceName, sourceAssetId,
      durationSec: summary.durationSec, waveform: summary.waveform, transientPoints: summary.transientPoints,
      settings: { ...settings, slicePoints: [...settings.slicePoints] },
    }) : undefined;
    let engineId: string;
    try {
      engineId = await engine.current!.addSamplerTrack(trackName, file, settings);
    } catch (error) {
      if (saved) await store.samplerPresets.remove(saved.id).catch(() => undefined);
      throw error;
    }
    if (saved) loadedSamplerPresetIds.current.add(saved.id);
    setProject((current) => addSamplerTrack(current, trackName, engineId, sourceName, {
      presetId: saved?.id, sourceAssetId, durationSec: summary.durationSec, waveform: summary.waveform,
      transientPoints: summary.transientPoints, settings,
    }));
    setActiveTrackId(engineId);
    setSelectedClipId(undefined);
    setMidiOctave(4);
    setDockTab('INSTRUMENT');
    setSampleShelfOpen(false);
  }

  async function loadShelfSampler(entry: SampleLibraryEntry) {
    clearGarageError('import');
    const used = await ingestShelfSample({
      gate, store, entry, storyId: story?.id, actorId: me?.id,
    });
    await createSamplerFromAsset(used.file, used.assetId, entry.name);
    setStatus(used.status === 'APPROVED'
      ? `${entry.name} is playable. Use A W S E D or press Record.`
      : `${entry.name} is playable and saved for an adviser’s media check.`);
  }

  async function makeSamplerFromClip(clip: AudioClip) {
    clearGarageError('import');
    if (!clip.sourceAssetId) {
      setGarageError('This older clip has no saved source. Import or record it again, then choose Make sampler.', 'import');
      return;
    }
    try {
      const asset = await store.assets.get(clip.sourceAssetId);
      const bytes = asset ? await store.blobs.get(asset.sha256) : undefined;
      if (!asset || !bytes) throw new Error('The source sound is missing from this Story Drive.');
      await createSamplerFromAsset(new Blob([bytes as unknown as BlobPart], { type: asset.mime }), asset.id, clip.name);
      setStatus(`${clip.name} is now a saved sampler. Play it, slice it, or record it into the arrangement.`);
    } catch (error) {
      setGarageError(error instanceof Error ? error.message : 'Studio could not make that sampler.', 'import');
    }
  }

  function openBoothShelf() {
    clearGarageError('import');
    setShowAllBoothFiles(false);
    setBoothPickerOpen(true);
  }

  async function bringInBoothFile(item: Deliverable) {
    clearGarageError('import');
    setBoothImportingId(item.id);
    try {
      if (item.sourceAssetId) {
        const source = await store.assets.get(item.sourceAssetId);
        if (source && source.gateStatus !== 'APPROVED') {
          throw new Error('This audio still needs an adviser’s media check before it can enter the mix.');
        }
      }
      const bytes = await deliverableBytes(store, item);
      let targetTrackId = activeTrack?.kind === 'AUDIO' ? activeTrack.engineId : undefined;
      if (!targetTrackId) targetTrackId = await makeTrack('AUDIO', 'import');
      if (!targetTrackId) return;
      const file = new Blob([bytes as unknown as BlobPart], { type: item.mime });
      const sourceAssetId = item.sourceAssetId ?? await ingestStudioAudio(file, item.title, 'generated', 'GENERATED');
      const added = await importAudio(
        file,
        item.title,
        'BOOTH',
        targetTrackId,
        beatsToSeconds(playheadBeat, project.bpm),
        sourceAssetId,
      );
      if (added) {
        setBoothPickerOpen(false);
        setStatus(`${item.title} came in from the Media Bin. Voice Lab is ready.`);
      }
    } catch (error) {
      setGarageError(error instanceof Error ? error.message : 'That Media Bin sound could not be brought into Studio.', 'import');
    } finally {
      setBoothImportingId(undefined);
    }
  }

  function chooseAudioFile() {
    clearGarageError('import');
    setBoothPickerOpen(false);
    // Keep the native picker in the original click task. Awaiting track
    // creation first consumes the browser's transient user activation.
    pendingImportRuntime.current = engine.current;
    pendingImportTrackId.current = activeTrack?.kind === 'AUDIO' ? activeTrack.engineId : undefined;
    pendingImportStartSec.current = beatsToSeconds(playheadBeat, project.bpm);
    filePicker.current?.click();
  }

  async function importFromPicker(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const runtime=pendingImportRuntime.current;
    if(!runtime || runtime!==engine.current || !sessionReady.current){event.target.value='';pendingImportTrackId.current=undefined;setStatus('The song changed. Choose Import audio again in this session.');return;}
    try {
      const sourceAssetId = await ingestStudioAudio(file, file.name, 'upload', 'UPLOAD');
      if(!studioMounted.current || engine.current!==runtime)return;
      let trackId = pendingImportTrackId.current;
      if (!trackId) trackId = await makeTrack('AUDIO', 'import');
      if (trackId) await importAudio(file, file.name, 'IMPORT', trackId, pendingImportStartSec.current, sourceAssetId);
    } catch (error) {
      setGarageError(error instanceof Error ? error.message : 'Studio could not import that sound.', 'import');
    } finally {
      event.target.value = '';
    }
  }

  function selectTrack(track: AudioTrack) {
    if(recording || countInRemaining!==undefined)return;
    setActiveTrackId(track.engineId);
    if (selectedClipTrack?.engineId !== track.engineId) setSelectedClipId(undefined);
    if (track.kind !== 'AUDIO' && track.kind !== 'SAMPLER') {
      const preset = instrumentPreset(track.instrumentPresetId ?? defaultInstrumentPreset(track.kind)?.id);
      setMidiOctave(preset.octave);
    }
    if(dockTab!=='MIXER')setDockTab(track.kind === 'AUDIO' ? (dockTab === 'VOICE' ? 'VOICE' : 'INPUT') : 'INSTRUMENT');
  }

  function selectClip(track: AudioTrack, clip: AudioClip, open = false) {
    if(recording || countInRemaining!==undefined || !ready)return;
    setActiveTrackId(track.engineId);
    setSelectedClipId(clip.engineId);
    if (track.kind !== 'AUDIO' && track.kind !== 'SAMPLER') {
      const preset = instrumentPreset(track.instrumentPresetId ?? defaultInstrumentPreset(track.kind)?.id);
      setMidiOctave(preset.octave);
    }
    if(open)setDockOpen(true);
    if (open && clip.source === 'INSTRUMENT') setDockTab('EDITOR');
    if (open && clip.source !== 'INSTRUMENT') setDockTab('VOICE');
  }

  function beginClipDrag(event: ReactPointerEvent, track: AudioTrack, clip: AudioClip, mode: 'MOVE'|'RESIZE'|'START'|'REPEAT') {
    if(event.button!==0 || editBusyRef.current || recording || countInRemaining!==undefined)return;
    event.preventDefault();event.stopPropagation();
    selectClip(track,clip);
    if(event.shiftKey){setClipSelection(ids=>ids.includes(clip.id)?ids.filter(id=>id!==clip.id):[...ids,clip.id]);return;}
    const ids=clipSelection.includes(clip.id)?clipSelection:[clip.id];setClipSelection(ids);
    const before=projectRef.current, startX=event.clientX, startY=event.clientY;
    let deltaSec=0, targetId:string|undefined, moved=false;
    const move=(pointer:PointerEvent)=>{
      const raw=(pointer.clientX-startX)/pixelsPerBeat;
      const beat=snapEnabled?Math.round(raw/gridBeat)*gridBeat:raw;
      deltaSec=beat*60/project.bpm;moved ||= Math.hypot(pointer.clientX-startX,pointer.clientY-startY)>3;
      if(mode==='MOVE'){
        const lane=document.elementFromPoint(pointer.clientX,pointer.clientY)?.closest<HTMLElement>('[data-studio-track]');
        targetId=lane?.dataset.studioTrack;
      }
      let preview=before;
      try{
        if(mode==='MOVE')preview=moveStudioClips(before,ids,deltaSec);
        else if(mode!=='REPEAT')preview=trimStudioClip(before,clip.id,mode==='START'?'START':'END',deltaSec);
        const selected=new Set(ids);
        setClipPreview(Object.fromEntries(preview.tracks.flatMap(t=>t.clips.filter(c=>selected.has(c.id)).map(c=>[c.engineId,{startBeat:secondsToBeats(c.startSec,project.bpm),durationBeats:secondsToBeats(clipDuration(c)+(mode==='REPEAT'?Math.max(0,deltaSec):0),project.bpm)}]))));
      }catch{}
    };
    const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);setClipPreview({});};
    const cancel=()=>cleanup();
    const up=()=>{
      cleanup();if(!moved)return;
      try{
        let next=before;
        if(mode==='MOVE'){
          const selectedTracks=before.tracks.filter(t=>t.clips.some(c=>ids.includes(c.id)));
          const offset=before.tracks.indexOf(track)-before.tracks.indexOf(selectedTracks[0]!);
          const destination=targetId?before.tracks[before.tracks.findIndex(t=>t.id===targetId)-offset]?.id:undefined;
          next=moveStudioClips(before,ids,deltaSec,destination);
        }else if(mode==='REPEAT'){
          const copy=copyStudioClips(before,[clip.id]);
          const copies=Math.min(64,Math.max(0,Math.round(deltaSec/clipDuration(clip))));
          for(let i=0;i<copies;i++)next=pasteStudioClips(next,copy,copy.endSec+i*clipDuration(clip));
        }else next=trimStudioClip(before,clip.id,mode==='START'?'START':'END',deltaSec);
        void applySongEdit(next);
      }catch(error){setGarageError((error as Error).message,'track');}
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',cancel,{once:true});
  }

  function removeSelectedClip(clip: AudioClip) {
    void applySongEdit(deleteStudioClips(projectRef.current,[clip.id]));
  }

  function toggleRackEffect(track: AudioTrack, effect: GarageEffect) {
    const enabled = !track.effects.includes(effect);
    const settings = effectSettingsFor(track, effect);
    engine.current!.setEffect(track.engineId, effect, enabled, settings);
    setProject((current) => enabled ? addEffect(current, track.id, effect) : removeEffect(current, track.id, effect));
  }

  function changeEffect(track: AudioTrack, effect: GarageEffect, patch: Partial<GarageEffectSettings>) {
    setProject((current) => {
      const next = setEffectSettings(current, track.id, effect, patch);
      const changed = next.tracks.find((item) => item.id === track.id)!;
      engine.current!.setEffect(changed.engineId, effect, changed.effects.includes(effect), effectSettingsFor(changed, effect));
      return next;
    });
  }

  function chooseVoicePreset(track: AudioTrack, preset: Exclude<GarageVoicePreset, 'CUSTOM'>) {
    setProject((current) => {
      const next = applyVoicePreset(current, track.id, preset);
      const changed = next.tracks.find((item) => item.id === track.id)!;
      VOICE_EFFECTS.forEach((effect) => engine.current!.setEffect(
        changed.engineId, effect, changed.effects.includes(effect), effectSettingsFor(changed, effect),
      ));
      return next;
    });
    const name = VOICE_PRESETS.find((item) => item.id === preset)?.name ?? preset;
    setStatus(`${name} is on ${track.name}. Press Play to hear it in the mix.`);
  }

  async function chooseInstrumentPreset(track: AudioTrack, preset: GarageInstrumentPreset) {
    if (track.kind === 'AUDIO' || track.kind === 'SAMPLER' || changingInstrument || editBusyRef.current || recording || bouncing || mixMeasuring) return;
    const runtime=engine.current!;
    editBusyRef.current=true;setEditingBusy(true);
    setChangingInstrument(true);
    setStatusValue(`Loading ${preset.name}…`);
    try {
      engine.current!.panic();
      await runtime.setInstrumentPreset(track.engineId, preset.id);
      if(!studioMounted.current || engine.current!==runtime)return;
      setProject((current) => setInstrumentPreset(current, track.id, preset.id, preset.kind, preset.controls));
      setMidiOctave(preset.octave);
      setStatus(`${preset.name} is on ${track.name}. Existing notes now play the new sound.`);
    } catch (error) {
      setGarageError(error instanceof Error ? error.message : 'That instrument did not load. Choose it again.', 'track');
    } finally {
      if(engine.current===runtime){setChangingInstrument(false);editBusyRef.current=false;setEditingBusy(false);}
    }
  }

  function changeInstrumentMacro(track: AudioTrack, control: GarageInstrumentControl, value: number) {
    if (track.kind === 'AUDIO' || track.kind === 'SAMPLER') return;
    const preset = instrumentPreset(track.instrumentPresetId ?? defaultInstrumentPreset(track.kind)?.id);
    const current = track.instrumentControls ?? preset.controls;
    engine.current!.setInstrumentControl(track.engineId, preset.id, control, value, current);
    setProject((project) => setInstrumentControl(project, track.id, control, value));
  }

  function changeSamplerShape(track: AudioTrack, patch: Partial<GarageSamplerSettings>) {
    if (track.kind !== 'SAMPLER') return;
    const next = setSamplerSettings(projectRef.current, track.id, patch);
    const changed = next.tracks.find((candidate) => candidate.id === track.id)!;
    const settings = samplerSettingsFor(changed);
    projectRef.current = next;
    engine.current!.setSamplerSettings(track.engineId, settings);
    setProject(next);
    if (changed.samplerPresetId) {
      const presetId = changed.samplerPresetId;
      window.clearTimeout(samplerSaveTimers.current.get(presetId));
      samplerPendingSaves.current.set(presetId, settings);
      const timer = window.setTimeout(() => {
        samplerSaveTimers.current.delete(presetId);
        const pending = samplerPendingSaves.current.get(presetId);
        samplerPendingSaves.current.delete(presetId);
        if (!pending) return;
        void store.samplerPresets.update(presetId, { settings: pending })
          .catch(() => {
            if (studioMounted.current) setGarageError('Studio could not save the sampler change. Move the control again to retry.', 'track');
          });
      }, 250);
      samplerSaveTimers.current.set(presetId, timer);
    }
  }

  function autoSliceSampler(track: AudioTrack, count: number) {
    const slices = Math.max(2, Math.min(16, Math.round(count)));
    changeSamplerShape(track, {
      layout: 'SLICE',
      slicePoints: Array.from({ length: slices + 1 }, (_, index) => index / slices),
    });
  }

  function detectSamplerSlices(track: AudioTrack) {
    const settings = samplerSettingsFor(track);
    const window = settings.end - settings.start;
    const points = (track.sampleTransientPoints ?? [])
      .filter((point) => point > settings.start && point < settings.end)
      .map((point) => (point - settings.start) / window)
      .slice(0, 15);
    changeSamplerShape(track, { layout: 'SLICE', slicePoints: [0, ...points, 1] });
    setStatus(points.length ? `${points.length + 1} slices found. Tap the pads, then move or remove any cut.` : 'No clear hits were found. Try 8 even slices, then move the cuts.');
  }

  function syncMix(trackId: string, transform: (project: GarageProject) => GarageProject) {
    setProject((current) => {
      const next = transform(current);
      const changed = next.tracks.find((track) => track.id === trackId);
      if (changed) engine.current!.setTrackMix(changed.engineId, changed);
      return next;
    });
  }

  function changeTrackRole(track: AudioTrack, contentRole: GarageTrackContentRole) {
    setProject((current) => setTrackContentRole(current, track.id, contentRole));
    setStatus(`${track.name} is marked as ${contentRole === 'VOICE' ? 'voice' : contentRole === 'MUSIC' ? 'music' : 'sound effects'} for Mix Check.`);
  }

  function syncMidiNotes(clip: AudioClip) {
    const afterNotes = engine.current!.getMidiNotes(clip.engineId);
    setProject((current) => replaceMidiNotes(current, clip.engineId, afterNotes));
    return afterNotes;
  }

  function createMidiNote(pitch: number, startBeat: number, durationBeats: number) {
    if (!selectedClip || selectedClip.source !== 'INSTRUMENT') return;
    const made = engine.current!.addMidiNote(
      selectedClip.engineId, pitch, startBeat + selectedClipOffsetBeat,
      Math.min(selectedClipBeats - startBeat, Math.max(gridBeat, lastMidiDuration || durationBeats)),
      midiVelocity,
    );
    syncMidiNotes(selectedClip);
    setSelectedNoteIds([made.engineId]);
  }

  function changeMidiNote(note: MidiNote, patch: Partial<Omit<MidiNote, 'engineId'>>) {
    if (!selectedClip || selectedClip.source !== 'INSTRUMENT') return;
    const changed = engine.current!.updateMidiNote(selectedClip.engineId, note.engineId, patch);
    if (patch.durationBeats !== undefined) setLastMidiDuration(patch.durationBeats);
    syncMidiNotes(selectedClip);
    setSelectedNoteIds((ids) => ids.map((id) => id === note.engineId ? changed.engineId : id));
  }

  function deleteMidiNotes(notes: MidiNote[]) {
    if (!selectedClip || selectedClip.source !== 'INSTRUMENT' || !notes.length) return;
    notes.forEach((note) => engine.current!.removeMidiNote(selectedClip.engineId, note.engineId));
    syncMidiNotes(selectedClip);
    setSelectedNoteIds([]);
  }

  function quantizeNotes() {
    if (!selectedClip || selectedClip.source !== 'INSTRUMENT') return;
    const targets = selectedClip.notes.filter((note) => selectedNoteIds.includes(note.engineId));
    if (!targets.length) return;
    targets.forEach((note) => engine.current!.updateMidiNote(selectedClip.engineId, note.engineId, {
      startBeat: Math.round(note.startBeat / gridBeat) * gridBeat,
      durationBeats: Math.max(gridBeat, Math.round(note.durationBeats / gridBeat) * gridBeat),
    }));
    syncMidiNotes(selectedClip);
  }

  function nudgeSelectedNotes(delta: { startBeat?: number; pitch?: number }) {
    if (!selectedClip || selectedClip.source !== 'INSTRUMENT') return;
    const targets = selectedClip.notes.filter((note) => selectedNoteIds.includes(note.engineId));
    if (!targets.length) return;
    targets.forEach((note) => engine.current!.updateMidiNote(selectedClip.engineId, note.engineId, {
      startBeat: delta.startBeat === undefined
        ? note.startBeat
        : Math.max(selectedClipOffsetBeat, Math.min(selectedClipOffsetBeat + selectedClipBeats - note.durationBeats, note.startBeat + delta.startBeat)),
      pitch: delta.pitch === undefined ? note.pitch : Math.max(0, Math.min(127, note.pitch + delta.pitch)),
    }));
    syncMidiNotes(selectedClip);
  }

  function humanizeSelectedNotes() {
    if (!selectedClip || selectedClip.source !== 'INSTRUMENT') return;
    const targets = selectedClip.notes.filter((note) => selectedNoteIds.includes(note.engineId));
    if (!targets.length) return;
    targets.forEach((note) => engine.current!.updateMidiNote(selectedClip.engineId, note.engineId, {
      startBeat: Math.max(selectedClipOffsetBeat, Math.min(selectedClipOffsetBeat + selectedClipBeats - note.durationBeats, note.startBeat + (Math.random() - 0.5) * 0.08)),
      velocity: Math.max(0.08, Math.min(1, note.velocity + (Math.random() - 0.5) * 0.08)),
    }));
    syncMidiNotes(selectedClip);
  }

  function legatoSelectedNotes() {
    if (!selectedClip || selectedClip.source !== 'INSTRUMENT') return;
    const targets = selectedClip.notes
      .filter((note) => selectedNoteIds.includes(note.engineId))
      .sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
    if (targets.length < 2) return;
    targets.slice(0, -1).forEach((note, index) => {
      const next = targets[index + 1]!;
      engine.current!.updateMidiNote(selectedClip.engineId, note.engineId, {
        durationBeats: Math.max(gridBeat, next.startBeat - note.startBeat),
      });
    });
    syncMidiNotes(selectedClip);
  }

  function duplicateSelectedNotes() {
    if (!selectedClip || selectedClip.source !== 'INSTRUMENT') return;
    const targets = selectedClip.notes.filter((note) => selectedNoteIds.includes(note.engineId));
    if (!targets.length) return;
    const min = Math.min(...targets.map((note) => note.startBeat));
    const max = Math.max(...targets.map((note) => note.startBeat + note.durationBeats));
    const shift = Math.max(gridBeat, max - min);
    const made = targets.map((note) => engine.current!.addMidiNote(
      selectedClip.engineId, note.pitch,
      Math.min(selectedClipOffsetBeat + selectedClipBeats - note.durationBeats, note.startBeat + shift),
      note.durationBeats, note.velocity,
    ));
    syncMidiNotes(selectedClip);
    setSelectedNoteIds(made.map((note) => note.engineId));
  }

  function startAudition(pitch: number) {
    if (editBusyRef.current || !ready || !activeTrack || activeTrack.kind === 'AUDIO' || auditioningPitches.current.has(pitch)) return;
    if (sustainedPitches.current.has(pitch)) releaseAudition(activeTrack, pitch);
    auditioningPitches.current.add(pitch);
    setActiveMidiPitches([...auditioningPitches.current]);
    engine.current!.auditionStart(activeTrack.engineId, pitch, midiVelocity);
    rememberPracticeStart(pitch);
  }

  function stopAudition(pitch: number) {
    if (!activeTrack || activeTrack.kind === 'AUDIO' || !auditioningPitches.current.has(pitch)) return;
    if (sustainHeld.current && activeTrack.kind !== 'DRUMS') sustainedPitches.current.add(pitch);
    else releaseAudition(activeTrack, pitch);
  }

  function clearPracticeCapture() {
    practiceNotes.current = [];
    practiceActive.current.clear();
    lastPracticeEnd.current = 0;
    setPracticeNoteCount(0);
  }

  function keepLastPlay() {
    if (!activeTrack || activeTrack.kind === 'AUDIO' || !practiceNotes.current.length) return;
    const source = practiceNotes.current.slice();
    const firstMs = Math.min(...source.map((note) => note.startMs));
    const msPerBeat = 60_000 / project.bpm;
    const grid = recordQuantize === '1/8' ? .5 : recordQuantize === '1/16' ? .25 : undefined;
    const draft = source.map((note) => {
      const rawStart = (note.startMs - firstMs) / msPerBeat;
      const rawDuration = Math.max(.125, (note.endMs - note.startMs) / msPerBeat);
      return {
        pitch: note.pitch,
        startBeat: grid ? Math.max(0, Math.round(rawStart / grid) * grid) : rawStart,
        durationBeats: grid ? Math.max(grid, Math.round(rawDuration / grid) * grid) : rawDuration,
        velocity: note.velocity,
      };
    });
    const phraseEnd = Math.max(...draft.map((note) => note.startBeat + note.durationBeats));
    const clipBeats = Math.max(4, Math.ceil(phraseEnd / 4) * 4);
    const startBeat = loopEnabled ? loopFromBeat : Math.floor(playheadBeat / 4) * 4;
    const made = engine.current!.createMidiClip(
      activeTrack.engineId,
      `${activeTrack.name} captured ${activeTrack.clips.length + 1}`,
      beatsToSeconds(startBeat, project.bpm),
      clipBeats,
    );
    const notes = engine.current!.replaceMidiNotes(made.engineId, draft);
    setProject((current) => addAudioClip(current, activeTrack.id, {
      engineId: made.engineId,
      name: made.name,
      source: 'INSTRUMENT',
      startSec: beatsToSeconds(startBeat, current.bpm),
      sourceDurationSec: beatsToSeconds(clipBeats, current.bpm),
      notes,
    }));
    setSelectedClipId(made.engineId);
    setDockTab('EDITOR');
    setDockOpen(true);setClipSelection([]);
    clearPracticeCapture();
    setStatus(`Kept your last play as a ${clipBeats / 4}-bar clip${grid ? ` and lined it up to ${recordQuantize}` : ''}.`);
  }

  async function exportMixdown(downloadAfter = false) {
    clearGarageError('mixdown');
    if (!story) return;
    if(editBusyRef.current || recording || countInRemaining!==undefined || bouncing || mixMeasuring)return;
    stopPresetPreview();engine.current!.panic();engine.current!.stop(false);setPlaying(false);
    setBouncing(true);editBusyRef.current=true;
    try {
      const blob = await engine.current!.bounce(); const bytes = new Uint8Array(await blob.arrayBuffer());
      const result = await gate.ingest({
        bytes, source: 'generated', ownDevice: true,
        meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'GENERATED', storyId: story.id,
          license: 'OWN', creator: me?.penName ?? 'the club' },
      });
      if (!result.assetId) throw new Error('The mixdown did not finish. Press Mixdown to try again.');
      const fileName = `${story.slug}-studio-mix.wav`;
      await saveDeliverable(store, { bytes, title: `${story.title} · Studio mix`, fileName, kind: 'AUDIO', room: 'GARAGE', stage: 'WORKING', mime: 'audio/wav', storyId: story.id, authorId: me?.id, sourceAssetId: result.assetId, durationSec: projectSeconds(project) });
      if (downloadAfter) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
      if (me) await recordRole(store, { userId: me.id, storyId: story.id, role: 'produce' });
      setStatus(`Mixdown saved to the Media Bin${downloadAfter ? ' and downloaded' : ''}.`);
    } catch (error) {
      setGarageError((error as Error).message, 'mixdown');
    } finally {
      setBouncing(false);editBusyRef.current=false;
    }
  }

  async function runMixCheck() {
    clearGarageError('mixdown');
    setMixCheckOpen(true);
    if (!projectSeconds(project)) {
      setGarageError('Put at least one recorded or played part on the timeline before Mix Check.', 'mixdown');
      return;
    }
    if(editBusyRef.current || recording || countInRemaining!==undefined || bouncing || mixMeasuring)return;
    stopPresetPreview();engine.current!.panic();
    setMixMeasuring(true);editBusyRef.current=true;
    try {
      engine.current!.stop(false);
      setPlaying(false);
      const blob = await engine.current!.bounce();
      const reading = await analyzeMixBlob(blob);
      const tracks = audibleTracks(project).filter((track) => track.clips.length);
      const trackRms: Record<string, number> = {};
      const trackPeaks: Record<string, number> = {};
      const trackClippedFractions: Record<string, number> = {};
      const trackRmsWindows: Record<string, number[]> = {};
      for (let index = 0; index < tracks.length; index++) {
        const track = tracks[index]!;
        setStatus(`Mix Check is listening to ${track.name} · ${index + 1} of ${tracks.length}`);
        const stem = await engine.current!.bounceTrack(track.engineId);
        const stemReading = await analyzeMixBlob(stem);
        trackRms[track.id] = stemReading.activeRms ?? stemReading.rms;
        trackPeaks[track.id] = stemReading.peak;
        trackClippedFractions[track.id] = stemReading.clippedFraction;
        trackRmsWindows[track.id] = stemReading.rmsWindows ?? [];
      }
      setMixReading({ ...reading, trackRms, trackPeaks, trackClippedFractions, trackRmsWindows });
      setStatus('Mix Check heard the current arrangement. Open any card that needs a move.');
    } catch (error) {
      setGarageError(error instanceof Error ? error.message : 'Mix Check could not hear this arrangement. Press it again.', 'mixdown');
    } finally {
      setMixMeasuring(false);editBusyRef.current=false;
    }
  }

  function focusMixTrack(trackId: string) {
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    setActiveTrackId(track.engineId);
    setSelectedClipId(track.clips[0]?.engineId);
    setDockTab(track.kind === 'AUDIO' ? 'VOICE' : 'INSTRUMENT');
    setMixCheckOpen(false);
    setStatus(`${track.name} is open. Play the mix while you make the move.`);
  }

  function addTrackFromMix(kind: GarageTrackKind) {
    setMixCheckOpen(false);
    void makeTrack(kind);
  }

  function stopPresetPreview(){
    previewGeneration.current++;
    clearTimeout(previewTimer.current);
    if(previewTrack.current){try{engine.current!.removeTrack(previewTrack.current);}catch{}previewTrack.current=undefined;}
  }
  async function previewPreset(preset:GarageInstrumentPreset){
    if(editBusyRef.current || recording || countInRemaining!==undefined || !ready)return;
    stopPresetPreview();
    const generation=previewGeneration.current,runtime=engine.current!;
    try {
      const id=await runtime.addTrack('Sound preview',preset.kind,preset.id);
      if(!studioMounted.current || engine.current!==runtime || generation!==previewGeneration.current){try{runtime.removeTrack(id);}catch{}return;}
      previewTrack.current=id;
      runtime.auditionStart(id,preset.kind==='DRUMS'?36:(preset.octave+1)*12,.7);
      previewTimer.current=setTimeout(()=>{if(generation===previewGeneration.current)stopPresetPreview();},700);
    }catch(error){if(generation===previewGeneration.current)setGarageError((error as Error).message,'track');}
  }
  function beginDockResize(event:ReactPointerEvent){
    event.preventDefault();const y=event.clientY, height=dockHeight;
    const move=(e:PointerEvent)=>setDockHeight(Math.max(160,Math.min(window.innerHeight*.65,height+y-e.clientY)));
    const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});window.addEventListener('pointercancel',end,{once:true});
  }
  function beginGesture(event:ReactPointerEvent){
    if((event.target as HTMLElement).matches('input[type="range"], .sound-shaper')){
      historyGroup.current=String(performance.now());
      const end=()=>{historyGroup.current=undefined;window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
      window.addEventListener('pointerup',end,{once:true});window.addEventListener('pointercancel',end,{once:true});
    }
  }

  const positionLabel = `${Math.floor(playheadBeat / 4) + 1}.${Math.floor(playheadBeat % 4) + 1}.${Math.floor((playheadBeat % 1) * 4) + 1}`;

  return (
    <section className={`view on garage-view studio-workbench ${editingBusy || bouncing || mixMeasuring || !ready ? 'is-busy' : ''}`} aria-busy={editingBusy || bouncing || mixMeasuring || !ready} onPointerDownCapture={beginGesture}>
      <input ref={filePicker} type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac,.webm" onChange={importFromPicker} hidden />
      <SampleShelf
        open={sampleShelfOpen}
        onClose={() => setSampleShelfOpen(false)}
        onAddToTimeline={useShelfSound}
        onLoadSampler={loadShelfSampler}
      />
      {mixCheckOpen && <StudioMixCheck
        checks={mixChecks}
        measuring={mixMeasuring}
        onMeasure={() => void runMixCheck()}
        onFocusTrack={focusMixTrack}
        onAddTrack={addTrackFromMix}
        onClose={() => setMixCheckOpen(false)}
      />}
      {boothPickerOpen && <div className="booth-shelf-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !boothImportingId) setBoothPickerOpen(false); }}>
        <section className="booth-shelf" role="dialog" aria-modal="true" aria-labelledby="booth-shelf-title">
          <header><div><small>MEDIA BIN → STUDIO</small><h2 id="booth-shelf-title">Bring in club audio</h2><p>Choose a saved voice, mix, or sound. It lands at the playhead on the selected audio track.</p></div><button type="button" aria-label="Close audio shelf" disabled={!!boothImportingId} onClick={() => setBoothPickerOpen(false)}>×</button></header>
          <div className="booth-shelf-filters" role="group" aria-label="Booth take stories">
            <button type="button" className={!showAllBoothFiles ? 'active' : ''} onClick={() => setShowAllBoothFiles(false)}>{story?.title ?? 'Current story'} <span>{currentStoryBoothFiles.length}</span></button>
            <button type="button" className={showAllBoothFiles ? 'active' : ''} onClick={() => setShowAllBoothFiles(true)}>All stories <span>{boothFiles.length}</span></button>
          </div>
          <div className="booth-shelf-list">
            {boothFilesLoading ? <div className="booth-shelf-empty"><b>Checking the take room…</b></div>
              : boothFilesFailed ? <div className="booth-shelf-empty"><b>The take shelf did not open.</b><span>Close this window and try again.</span></div>
                : visibleBoothFiles.length ? visibleBoothFiles.map((item) => {
                  const itemStory = stories.find((candidate) => candidate.id === item.storyId);
                  const prepared = item.stage === 'REVIEW' || /edited/i.test(item.title);
                  return <button key={item.id} type="button" disabled={!!boothImportingId} onClick={() => void bringInBoothFile(item)}>
                    <span className="booth-file-mark">◉</span>
                    <span className="booth-file-copy"><small>{itemStory?.title ?? 'Unfiled story'}</small><b>{item.title}</b><em>{formatSeconds(item.durationSec ?? 0)} · {prepared ? 'Prepared edit' : 'Original take'}</em></span>
                    <span className="booth-file-action">{boothImportingId === item.id ? 'Bringing it in…' : 'Add at playhead →'}</span>
                  </button>;
                }) : <div className="booth-shelf-empty"><b>{showAllBoothFiles ? 'The audio shelf is empty.' : `No saved audio for ${story?.title ?? 'this story'} yet.`}</b><span>{boothFiles.length && !showAllBoothFiles ? 'There is audio attached to other stories.' : 'Record in Booth or save a Studio mix and it will show up here.'}</span>{boothFiles.length && !showAllBoothFiles ? <button type="button" onClick={() => setShowAllBoothFiles(true)}>Show all stories</button> : <button type="button" onClick={() => navigate(story ? `/booth/${story.id}` : '/booth')}>Open Booth ↗</button>}</div>}
          </div>
          <footer><span>Prepared edits are marked so you can choose the cleaned-up Booth version.</span><button type="button" onClick={chooseAudioFile} disabled={!ready || !!boothImportingId}>Choose a file instead</button></footer>
        </section>
      </div>}
      <div className="garage-titlebar">
        <div className="studio-brand"><h1>Studio</h1><span className="studio-edition">Sound works!</span></div>
        <input className="session-name" disabled={!ready || editingBusy || bouncing || mixMeasuring} onBlur={event=>{if(!event.target.value.trim())setProject(p=>({...p,name:'Untitled Studio session'}));}} aria-label="Studio session name" value={project.name} maxLength={100} onChange={e=>setProject({...project,name:e.target.value})}/>
        <button className="save-readout" onClick={()=>persistProject(project)} disabled={!ready} title="Save session again"><i/>{saveStatus}</button>
      </div>

      <div data-tools-open={compactToolsOpen} className={`daw-shell ${cabinetOpen?'cabinet-open':''} ${dockOpen?'dock-open':''}`} style={{'--dock-height':`${dockHeight}px`} as React.CSSProperties}>
        <div className="daw-transport" role="toolbar" aria-label="Studio transport">
          <div className="daw-transport-row transport-main-row">
            <button type="button" className="transport-button" onClick={rewind} disabled={!ready} aria-label="Return to start">↤</button>
            <button type="button" className={`transport-button play ${playing ? 'active' : ''}`} onClick={() => void togglePlay()} disabled={!ready || !!recording} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'ic-stop' : 'ic-play'} /></button>
            <button type="button" className={`transport-button record ${recording || countInRemaining !== undefined ? 'active' : ''}`} onClick={() => void toggleRecord()} disabled={!ready} aria-label={countInRemaining !== undefined ? 'Cancel count-in' : recording ? 'Stop recording' : 'Record selected track'}><span /></button>
            <div className="transport-position" aria-label={`Playhead ${positionLabel}`}><b>{positionLabel}</b><small>BAR · BEAT · STEP</small></div>
            <label className="transport-value">TEMPO<input type="number" min="40" max="240" value={project.bpm} onChange={(event) => changeBpm(Number(event.target.value))} /><span>BPM</span></label>
            <button type="button" className={`transport-toggle ${metronomeEnabled ? 'active' : ''}`} onClick={toggleMetronome} disabled={!ready} aria-pressed={metronomeEnabled} title="Metronome (M)">♩ Click</button>
            <button type="button" className={`transport-toggle ${loopEnabled ? 'active' : ''}`} onClick={toggleLoop} disabled={!ready} aria-pressed={loopEnabled} title="Cycle playback (C)">↻ Cycle</button>
            {loopEnabled && <div className="cycle-fields" aria-label="Cycle bar range">
              <label>FROM<input aria-label="Cycle from bar" type="number" min="1" max={timelineBars} step="0.25" value={loopFromBeat / 4 + 1} onChange={(event) => updateLoopRange((Number(event.target.value) - 1) * 4, loopToBeat)} /></label>
              <label>TO<input aria-label="Cycle through bar" type="number" min="1.25" max={timelineBars} step="0.25" value={loopToBeat / 4} onChange={(event) => updateLoopRange(loopFromBeat, Number(event.target.value) * 4)} /></label>
            </div>}
            <button type="button" className="transport-button text" onClick={undoMidi} disabled={!songHistory.current?.canUndo || editingBusy || !!recording} title="Undo song edit (Ctrl/Cmd Z)">Undo</button>
            <button type="button" className="transport-button text" onClick={redoMidi} disabled={!songHistory.current?.canRedo || editingBusy || !!recording} title="Redo song edit">Redo</button>
            <div className="transport-spacer" />
            <button type="button" className="compact-studio-tools" aria-expanded={compactToolsOpen} aria-controls="studio-edit-tools" onClick={() => setCompactToolsOpen(open => !open)}>Tools {compactToolsOpen ? '▴' : '▾'}</button>
            <div className="zoom-control"><span>−</span><input aria-label="Timeline zoom" type="range" min="8" max="72" value={pixelsPerBeat} onChange={(event) => setPixelsPerBeat(Number(event.target.value))} /><span>＋</span></div>
          </div>
          <div id="studio-edit-tools" className="daw-transport-row transport-tools-row">
            <button onClick={()=>void makeTrack('AUDIO')} disabled={!ready}>＋ Audio track</button>
            <button onClick={()=>{setCabinetOpen(true);}} disabled={!ready}>＋ Instrument</button>
            <button onClick={chooseAudioFile} disabled={!ready}>Import audio</button>
            <span className="tool-divider"/>
            <button disabled={!selectedClips().length || !!recording} onClick={()=>pasteClips(true)} title="Duplicate clips (Ctrl/Cmd D)">Duplicate</button>
            <button disabled={!selectedClips().length || !!recording} onClick={splitClips} title="Split at playhead (Alt X)">Split</button>
            <button disabled={!selectedClips().length || !!recording} onClick={deleteClips}>Delete</button>
            <button aria-pressed={snapEnabled} onClick={()=>setSnapEnabled(v=>!v)}>Snap {snapEnabled?'on':'off'}</button>
            <select aria-label="Arrangement snap grid" value={gridBeat} onChange={e=>setGridBeat(Number(e.target.value))}><option value="4">Bar</option><option value="1">Beat</option><option value="0.5">1/8</option><option value="0.25">1/16</option></select>
            <div className="transport-spacer"/>
            <button aria-pressed={cabinetOpen} onClick={()=>setCabinetOpen(v=>!v)}>Sounds</button>
            <button aria-pressed={dockOpen&&dockTab==='MIXER'} onClick={()=>{setDockTab('MIXER');setDockOpen(!(dockOpen&&dockTab==='MIXER'));}}>Mixer</button>
            <button onClick={()=>setSongMapChooserOpen(v=>!v)}>Song maps</button>
          </div>
        </div>

        <div className={`daw-status ${statusIsError ? 'error' : ''}`} role={statusIsError ? 'alert' : 'status'}><span className={`daw-led ${statusIsError ? 'error' : recording ? 'recording' : ready ? 'on' : ''}`} />{status}</div>
        {countInRemaining !== undefined && <div className="precount-display" role="status" aria-live="assertive"><small>GET READY</small><b>{((precountBars * 4 - countInRemaining) % 4) + 1}</b><span>{countInRemaining} {countInRemaining === 1 ? 'beat' : 'beats'} to record</span><button type="button" onClick={() => void toggleRecord()}>Cancel</button></div>}

        {songMapChooserOpen && <section className="song-map-picker" aria-label="Choose a Song Map">
          <header>
            <div><small>SONG MAP</small><h2>Give your song a shape.</h2><p>Pick a map. Studio sets up empty parts and useful track roles—no canned music.</p></div>
            <button type="button" className="song-map-close" onClick={() => setSongMapChooserOpen(false)} aria-label="Close Song Map chooser">×</button>
          </header>
          <div className="song-map-recipes">
            {GARAGE_ARRANGEMENT_RECIPES.map((recipe) => <button key={recipe.id} type="button" disabled={!ready} onClick={() => void chooseSongMap(recipe.id)}>
              <span className="recipe-badge">{recipe.badge}</span>
              <strong>{recipe.name}</strong>
              <span className="recipe-description">{recipe.description}</span>
              <span className="recipe-parts" aria-hidden="true">{recipe.sections.map((section, index) => <i key={`${section.name}-${index}`} style={{ background: section.color, flexGrow: section.bars }} />)}</span>
              <em>{recipe.sections.length} parts · {recipe.trackRoles.length} track roles</em>
            </button>)}
            <button type="button" className="custom-map-card" disabled={!ready} onClick={startCustomSongMap}>
              <span className="recipe-badge">DIY</span><strong>Build my own</strong>
              <span className="recipe-description">Start with one empty 8-bar part. Name and shape everything yourself.</span>
              <span className="recipe-parts" aria-hidden="true"><i style={{ background: '#55dfe8', flexGrow: 1 }} /></span>
              <em>1 part · choose your own tracks</em>
            </button>
          </div>
        </section>}

        <>
          {selectedArrangementSection && <section className={`song-part-desk ${selectedArrangementSection ? 'has-selection' : ''}`} aria-label="Selected Song Map part">
            <div className="song-part-desk-title">
              <small>SONG MAP</small>
              {selectedArrangementSection ? <><b>{selectedArrangementSection.name}</b><span>{selectedArrangementSection.purpose} · {songPartSpan(selectedArrangementSection)}</span></> : <><b>Pick a part</b><span>The label moves everything underneath it together.</span></>}
            </div>
            {selectedArrangementSection && <>
              <label className="song-part-name">NAME<input
                key={selectedArrangementSection.id}
                defaultValue={selectedArrangementSection.name}
                maxLength={40}
                onBlur={(event) => syncArrangementEdit((current) => renameArrangementSection(current, selectedArrangementSection.id, event.target.value))}
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
              /></label>
              <label className="song-part-bars">BARS<input
                type="number" min="1" max="128" step="1" value={selectedArrangementSection.durationBeats / 4}
                onChange={(event) => syncArrangementEdit((current) => resizeArrangementSection(current, selectedArrangementSection.id, Number(event.target.value) * 4))}
              /></label>
              <div className="song-part-colors" aria-label="Part color">{SONG_PART_COLORS.map((color) => <button
                key={color} type="button" aria-label={`Set part color ${color}`} aria-pressed={selectedArrangementSection.color === color}
                style={{ background: color }} onClick={() => syncArrangementEdit((current) => recolorArrangementSection(current, selectedArrangementSection.id, color))}
              />)}</div>
              <div className="song-part-actions">
                <button type="button" className="part-play" onClick={() => playSongPart(selectedArrangementSection)}>▶ Play here</button>
                <button type="button" className="part-record" onClick={() => prepareSongPart(selectedArrangementSection)}>↻ Set up to record here</button>
                <button type="button" disabled={project.arrangement?.[0]?.id === selectedArrangementSection.id} onClick={() => moveSelectedSongPart(-1)}>← Earlier</button>
                <button type="button" disabled={project.arrangement?.at(-1)?.id === selectedArrangementSection.id} onClick={() => moveSelectedSongPart(1)}>Later →</button>
                <button type="button" className="part-remove" onClick={removeSongPartLabel}>Remove label</button>
              </div>
            </>}
            <div className="song-map-actions"><button type="button" onClick={()=>setSelectedArrangementSectionId(undefined)}>Close part editor</button><button type="button" onClick={addSongPart}>＋ Add part</button><button type="button" onClick={() => setSongMapChooserOpen(true)}>Change map</button></div>
          </section>}

          <div className="arrangement-scroll" tabIndex={0} aria-label="Song arrangement" onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData('application/x-chatter-instrument');if(id){e.preventDefault();void makeTrack(instrumentPreset(id).kind,'track',id);}}}>
            <div className="arrangement-content" style={{ width: `calc(${timelineWidth}px + var(--track-header-width, 220px))` }}>
              {!!project.arrangement?.length && <div className="song-map-row">
                <div className="song-map-corner"><b>SONG MAP</b><span>{project.arrangement?.length} parts</span></div>
                <div className="song-map-track" style={{ width: timelineWidth }}>
                  {project.arrangement?.map((section) => <button
                    key={section.id}
                    type="button"
                    className={selectedArrangementSectionId === section.id ? 'selected' : ''}
                    style={{ left: section.startBeat * pixelsPerBeat, width: Math.max(26, section.durationBeats * pixelsPerBeat), '--part-color': section.color } as React.CSSProperties}
                    onClick={() => selectSongPart(section)}
                    aria-pressed={selectedArrangementSectionId === section.id}
                  ><b>{section.name}</b><span>{section.durationBeats / 4} {section.durationBeats === 4 ? 'bar' : 'bars'}</span></button>)}
                </div>
              </div>}
              <div className="arrangement-ruler-row">
                <div className="arrangement-corner">Tracks <button onClick={()=>setCabinetOpen(true)} aria-label="Add instrument from sound cabinet">＋</button></div>
                <div
                  className="arrangement-ruler"
                  style={{ width: timelineWidth, '--beat-px': `${pixelsPerBeat}px` } as React.CSSProperties}
                  onPointerDown={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const beat=(event.clientX-rect.left)/pixelsPerBeat;seek(Math.max(0,snapEnabled?Math.round(beat/gridBeat)*gridBeat:beat));
                  }}
                >
                  {rulerLabels.map((bar) => <span key={bar} style={{ left: bar * 4 * pixelsPerBeat }}>{bar + 1}</span>)}
                  {loopEnabled && <div
                    className="arrangement-loop"
                    style={{ left: loopFromBeat * pixelsPerBeat, width: (loopToBeat - loopFromBeat) * pixelsPerBeat }}
                    onPointerDown={(event) => beginLoopDrag(event, 'MOVE')}
                    aria-label={`Cycle from bar ${loopFromBeat / 4 + 1} through bar ${loopToBeat / 4}`}
                  >
                    <button type="button" className="loop-handle start" aria-label="Move cycle start" onPointerDown={(event) => beginLoopDrag(event, 'START')} />
                    <b>CYCLE</b>
                    <button type="button" className="loop-handle end" aria-label="Move cycle end" onPointerDown={(event) => beginLoopDrag(event, 'END')} />
                  </div>}
                </div>
              </div>

              {!project.tracks.length && <div className="song-map-no-tracks"><b>The map is ready.</b><span>Add an instrument or audio track from the top bar, then pick a part and record.</span></div>}

              {project.tracks.map((track, trackIndex) => {
                const preset = track.kind === 'AUDIO' || track.kind === 'SAMPLER' ? undefined
                  : instrumentPreset(track.instrumentPresetId ?? defaultInstrumentPreset(track.kind)?.id);
                return (
                <div className={`arrangement-track ${track.engineId === activeTrackId ? 'active' : ''}`} style={{'--channel':STUDIO_COLORS[trackIndex%STUDIO_COLORS.length]} as React.CSSProperties} key={track.id}>
                  <div className="track-header" onClick={() => selectTrack(track)} onDoubleClick={()=>{selectTrack(track);setDockTab(track.kind==='AUDIO'?'INPUT':'INSTRUMENT');setDockOpen(true);}}>
                    <div className="track-heading"><span className={`track-icon kind-${track.kind.toLowerCase()}`} style={preset ? { background: preset.color } : undefined}>{track.kind === 'AUDIO' ? '◉' : track.kind === 'SAMPLER' ? '♫' : preset?.icon ?? '♪'}</span><div><input aria-label={`Name of ${track.name}`} defaultValue={track.name} key={track.name} maxLength={60} onBlur={e=>{const name=e.target.value.trim();if(name&&name!==track.name){engine.current!.setTrackName(track.engineId,name);setProject(p=>({...p,tracks:p.tracks.map(t=>t.id===track.id?{...t,name}:t)}));}}}/><small>{track.kind === 'SAMPLER' ? track.sampleName : preset?.name ?? kindLabel(track.kind)}</small></div></div>
                    <div className="track-switches"><button aria-label={`Open ${track.name} instrument`} onClick={e=>{e.stopPropagation();selectTrack(track);setDockTab(track.kind==='AUDIO'?'INPUT':'INSTRUMENT');setDockOpen(true);}}>♫</button>
                      <button type="button" className={track.engineId === armedTrackId ? 'armed' : ''} aria-label={`Arm ${track.name}`} aria-pressed={track.engineId===armedTrackId} disabled={!!recording} onClick={(event) => { event.stopPropagation(); setArmedTrackId(id=>id===track.engineId?undefined:track.engineId); }} title="Arm for recording">●</button>
                      <button type="button" className={track.muted ? 'active' : ''} onClick={(event) => { event.stopPropagation(); syncMix(track.id, (current) => toggleMute(current, track.id)); }}>M</button>
                      <button type="button" className={track.soloed ? 'solo' : ''} onClick={(event) => { event.stopPropagation(); syncMix(track.id, (current) => toggleSolo(current, track.id)); }}>S</button>
                      <button type="button" aria-label={`Remove ${track.name} track`} title="Remove track (Undo restores it)" disabled={!!recording || countInRemaining!==undefined} onClick={event=>{event.stopPropagation();void applySongEdit({...projectRef.current,tracks:projectRef.current.tracks.filter(t=>t.id!==track.id)});setClipSelection([]);}}>×</button>
                    </div>
                    <label className="track-volume">VOL<input aria-label={`${track.name} volume`} type="range" min="0" max="1" step="0.02" value={track.gain} onChange={(event) => syncMix(track.id, (current) => setTrackGain(current, track.id, Number(event.target.value)))} /></label>
                    <label className="track-pan">PAN<input aria-label={`${track.name} pan`} type="range" min="-1" max="1" step="0.05" value={track.pan} onChange={(event) => syncMix(track.id, (current) => setTrackPan(current, track.id, Number(event.target.value)))} /></label>
                  </div>
                  <div
                    className="track-lane" data-studio-track={track.id}
                    style={{ width: timelineWidth, '--beat-px': `${pixelsPerBeat}px` } as React.CSSProperties}
                    onDoubleClick={(event) => {
                      if (event.target !== event.currentTarget || track.kind === 'AUDIO') return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      void createMidiClipAt(track, (event.clientX - rect.left) / pixelsPerBeat);
                    }}
                    onDragOver={(event) => { if (track.kind === 'AUDIO') event.preventDefault(); }}
                    onDrop={(event) => {
                      if(event.dataTransfer.getData('application/x-chatter-instrument'))return;
                      if (track.kind !== 'AUDIO') return;
                      event.preventDefault();event.stopPropagation();
                      const file = event.dataTransfer.files[0];
                      if (!file) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const beat = Math.max(0, Math.round(((event.clientX - rect.left) / pixelsPerBeat) / gridBeat) * gridBeat);
                      void ingestStudioAudio(file, file.name, 'upload', 'UPLOAD')
                        .then((assetId) => importAudio(file, file.name, 'IMPORT', track.engineId, beatsToSeconds(beat, project.bpm), assetId))
                        .catch((error) => setGarageError(error instanceof Error ? error.message : 'Studio could not import that sound.', 'import'));
                    }}
                  >
                    {project.arrangement?.map((section) => <span
                      key={section.id}
                      className={`song-section-guide ${selectedArrangementSectionId === section.id ? 'selected' : ''}`}
                      style={{ left: section.startBeat * pixelsPerBeat, width: section.durationBeats * pixelsPerBeat, '--part-color': section.color } as React.CSSProperties}
                    />)}
                    {!track.clips.length && <span className="lane-hint">{track.kind === 'AUDIO' ? 'Record, drop a file, or bring in club audio' : 'Press Record and play · or double-click to draw a clip'}</span>}
                    {track.clips.map((clip) => {
                      const preview = clipPreview[clip.engineId];
                      const startBeat = preview?.startBeat ?? secondsToBeats(clip.startSec, project.bpm);
                      const durationBeat = preview?.durationBeats ?? secondsToBeats(clipDuration(clip), project.bpm);
                      return <div
                        key={clip.id}
                        className={`arrangement-clip ${clip.source === 'INSTRUMENT' ? 'midi' : 'audio'} ${(clipSelection.length?clipSelection.includes(clip.id):selectedClipId===clip.engineId) ? 'selected' : ''} ${clipPreview[clip.engineId] ? 'dragging' : ''}`}
                        style={{ left: startBeat * pixelsPerBeat, width: Math.max(24, durationBeat * pixelsPerBeat) }}
                        tabIndex={0} role="button" aria-label={`${clip.name}, ${track.name}, bar ${Math.floor(startBeat/4)+1}`} aria-pressed={clipSelection.includes(clip.id)}
                        onFocus={event=>{if(event.target===event.currentTarget){selectClip(track,clip);setClipSelection([clip.id]);}}}
                        onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();selectClip(track,clip,true);}}}
                        onContextMenu={event=>{event.preventDefault();selectClip(track,clip);if(!clipSelection.includes(clip.id))setClipSelection([clip.id]);setContextMenu({x:event.clientX,y:event.clientY});}}
                        onPointerDown={(event) => beginClipDrag(event, track, clip, 'MOVE')}
                        onDoubleClick={(event) => { event.stopPropagation(); selectClip(track, clip, true); }}
                      >
                        <header><span>{clip.name}</span><small>{clip.source === 'INSTRUMENT' ? `${clip.notes.length} notes` : formatSeconds(clipDuration(clip))}</small></header>
                        <div className="clip-content">
                          {clip.source === 'INSTRUMENT'
                            ? visibleStudioNotes(clip,project.bpm).map((note) => <i key={note.engineId} style={{ left: `${note.startBeat / Math.max(0.25, durationBeat) * 100}%`, width: `${note.durationBeats / Math.max(0.25, durationBeat) * 100}%`, top: `${Math.max(2, Math.min(38, (84 - note.pitch) * 1.2))}px` }} />)
                            : (clip.waveform ?? []).slice(Math.floor(clip.trimStartSec/clip.sourceDurationSec*(clip.waveform?.length??0)),Math.ceil(clip.trimEndSec/clip.sourceDurationSec*(clip.waveform?.length??0))).map((peak,index)=><i key={index} style={{height:`${Math.max(1,peak*100)}%`}}/>)}
                        </div>
                        <button type="button" className="clip-repeat" title="Drag to repeat" aria-label={`Repeat ${clip.name}`} onPointerDown={event=>beginClipDrag(event,track,clip,'REPEAT')}>↻</button>
                        <button type="button" className="clip-trim-start" aria-label={`Trim start of ${clip.name}`} onPointerDown={event=>beginClipDrag(event,track,clip,'START')}/>
                        <button type="button" className="clip-delete" aria-label={`Delete ${clip.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => removeSelectedClip(clip)}>×</button>
                        <button className="clip-resize" aria-label={`Trim end of ${clip.name}`} onPointerDown={(event) => beginClipDrag(event, track, clip, 'RESIZE')} />
                      </div>;
                    })}
                  </div>
                </div>
              );})}
              {!project.tracks.length&&<div className="studio-empty"><span className="empty-tape" aria-hidden="true">◉ ▰ ◉</span><h2>A little sound goes a long way.</h2><p>Pick an instrument. Record a noise. Make something yours.</p><div><button onClick={()=>void makeTrack('KEYS')}>♫ Play some keys</button><button onClick={()=>void makeTrack('DRUMS')}>▦ Make a beat</button><button onClick={()=>void makeTrack('AUDIO')}>● Record audio</button></div><small>Drag sounds here to add tracks. No song map required.</small></div>}
              <div ref={arrangementPlayhead} className="arrangement-playhead" style={{ left: playheadLeftPx(playheadBeat, pixelsPerBeat) }}><b /></div>
            </div>
          </div>
        </>

        {cabinetOpen && <StudioSoundCabinet disabled={!ready||editingBusy||!!recording} activePresetId={activePreset?.id} onAdd={p=>{stopPresetPreview();void makeTrack(p.kind,'track',p.id);}} onApply={activeTrack&&activeTrack.kind!=='AUDIO'&&activeTrack.kind!=='SAMPLER'?p=>{stopPresetPreview();void chooseInstrumentPreset(activeTrack,p);}:undefined} onPreview={p=>void previewPreset(p)} onSamples={()=>setSampleShelfOpen(true)} onAudio={openBoothShelf}/>}
        {dockOpen && dockTab==='MIXER' && ready && <div className="daw-dock mixer-dock"><div className="dock-resize" role="separator" tabIndex={0} aria-label="Resize mixer" aria-orientation="horizontal" onPointerDown={beginDockResize} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setDockHeight(h=>Math.max(160,Math.min(500,h+(e.key==='ArrowUp'?20:-20))));}}}/><div className="dock-tabs"><b>Mixer</b><span>Give every sound its own space.</span><div className="dock-spacer"/><button aria-label="Close mixer" onClick={()=>setDockOpen(false)}>×</button></div><StudioMixer key={engineRevision} project={project} engine={engine.current!} activeId={activeTrackId} armedId={armedTrackId} onSelect={selectTrack} onArm={t=>setArmedTrackId(id=>id===t.engineId?undefined:t.engineId)} onGain={(t,g)=>syncMix(t.id,p=>setTrackGain(p,t.id,g))} onPan={(t,pan)=>syncMix(t.id,p=>setTrackPan(p,t.id,pan))} onMute={t=>syncMix(t.id,p=>toggleMute(p,t.id))} onSolo={t=>syncMix(t.id,p=>toggleSolo(p,t.id))} onMaster={gain=>{engine.current!.setMasterGain(gain);setProject(p=>({...p,masterGain:gain}));}} onEffect={toggleRackEffect} onEffectChange={changeEffect}/></div>}
        {activeTrack && dockOpen && dockTab!=='MIXER' && (
          <div className="daw-dock">
            <div className="dock-resize" role="separator" tabIndex={0} aria-label="Resize instrument editor" aria-orientation="horizontal" onPointerDown={beginDockResize} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setDockHeight(h=>Math.max(160,Math.min(500,h+(e.key==='ArrowUp'?20:-20))));}}}/>

            <div className="dock-tabs">
              {activeTrack.kind === 'AUDIO' ? (
                <>
                  <button type="button" className={dockTab === 'INPUT' ? 'active' : ''} onClick={() => setDockTab('INPUT')}>Input</button>
                  <button type="button" className={dockTab === 'VOICE' ? 'active' : ''} onClick={() => setDockTab('VOICE')}>Voice Lab <span className="tab-count">{activeTrack.effects.length}</span></button>
                </>
              ) : <>
                <button type="button" className={dockTab === 'INSTRUMENT' ? 'active' : ''} onClick={() => setDockTab('INSTRUMENT')}>Instrument</button>
                <button type="button" className={dockTab === 'EDITOR' ? 'active' : ''} disabled={!selectedClip || selectedClip.source !== 'INSTRUMENT'} onClick={() => setDockTab('EDITOR')}>Notes {selectedClip?.source === 'INSTRUMENT' ? `(${selectedClip.notes.length})` : ''}</button>
              </>}
              <span>{activeTrack.name}</span>
              <label className="dock-role">USE<select aria-label="Track role" value={activeTrack.contentRole ?? (activeTrack.kind === 'AUDIO' ? 'VOICE' : 'MUSIC')} onChange={(event) => changeTrackRole(activeTrack, event.target.value as GarageTrackContentRole)}><option value="VOICE">Voice</option><option value="MUSIC">Music</option><option value="SFX">Sound effects</option></select></label>
              <div className="dock-spacer" />
              <button type="button" className="dock-close" aria-label="Close editor" onClick={() => setDockOpen(false)}>×</button>
            </div>

            {activeTrack.kind === 'AUDIO' && dockTab === 'VOICE' ? (
              <VoiceLab
                track={activeTrack}
                onPreset={(preset) => chooseVoicePreset(activeTrack, preset)}
                onToggle={(effect) => toggleRackEffect(activeTrack, effect)}
                onChange={(effect, patch) => changeEffect(activeTrack, effect, patch)}
              />
            ) : activeTrack.kind === 'AUDIO' ? (
              <div className="audio-input-panel">
                <div className="audio-input-info">
                  <span className="instrument-mark kind-audio">◉</span>
                  <div><small>AUDIO INPUT</small><h3>Voice or microphone</h3><p>Check the input, watch the meter, then record into the selected track.</p></div>
                </div>
                <div className="microphone-channel">
                  <div className="microphone-topline">
                    <span className={`mic-state state-${microphoneState.toLowerCase()}`}><i />{microphoneState === 'ASKING' ? 'Waiting for browser' : microphoneState === 'READY' ? 'Input ready' : microphoneState === 'BLOCKED' ? 'Permission blocked' : microphoneState === 'UNAVAILABLE' ? 'Unavailable here' : 'Input unchecked'}</span>
                    <label>INPUT
                      <select aria-label="Microphone input" value={selectedMicrophoneId} disabled={microphoneState === 'ASKING' || recording === 'AUDIO'} onChange={(event) => { setSelectedMicrophoneId(event.target.value); void checkMicrophone(event.target.value); }}>
                        <option value="">Default microphone</option>
                        {microphoneDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="input-meter" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(microphoneLevel * 100)}>
                    <i style={{ width: `${microphoneLevel * 100}%` }} />
                    <span>-∞</span><span>-24</span><span>-12</span><span>-6</span><span>0</span>
                  </div>
                  <p>{microphoneMessage}</p>
                  {microphoneState === 'ASKING' && <p className="mic-permission-callout">Look for the microphone permission prompt near the address bar and choose <b>Allow</b>.</p>}
                  {microphoneState === 'BLOCKED' && embeddedPreview && <a className="open-browser-link" href={window.location.href} target="_blank" rel="noreferrer">Open Chatter in a normal browser tab ↗</a>}
                </div>
                <div className="audio-input-actions">
                  <button type="button" onClick={() => void checkMicrophone()} disabled={microphoneState === 'ASKING' || recording === 'AUDIO'}>{microphoneState === 'READY' ? '↻ Recheck microphone' : 'Check microphone'}</button>
                  <button type="button" aria-pressed={monitoring} disabled={microphoneState!=='READY'} onClick={()=>{
                    const analyser=microphoneAnalyser.current, context=microphoneMeterContext.current;
                    if(!analyser||!context)return;
                    if(monitoring)analyser.disconnect();else analyser.connect(context.destination);
                    setMonitoring(!monitoring);
                  }}>Headphone monitor {monitoring?'on':'off'}</button>
                  {microphoneState === 'READY' && recording !== 'AUDIO' && <button type="button" onClick={() => releaseMicrophone()}>Release microphone</button>}
                  <button type="button" className={recording === 'AUDIO' ? 'recording' : 'primary'} onClick={() => void toggleRecord()} disabled={microphoneState === 'ASKING'}>{recording === 'AUDIO' ? '■ Stop take' : '● Record take'}</button>
                  <button type="button" className="booth-source" onClick={openBoothShelf} disabled={!ready}>◉ Bring in club audio</button>
                  <button type="button" onClick={chooseAudioFile} disabled={!ready}>Import audio file</button>
                  {selectedClip && selectedClip.source !== 'INSTRUMENT' && <button type="button" className="sampler-source" onClick={() => void makeSamplerFromClip(selectedClip)} disabled={!selectedClip.sourceAssetId}>♫ Make sampler</button>}
                </div>
              </div>
            ) : activeTrack.kind === 'SAMPLER' && dockTab === 'INSTRUMENT' ? (
              <div className="sampler-studio">
                <header className="sampler-studio-head">
                  <span className="instrument-mark kind-sampler">♫</span>
                  <div><small>SAMPLER · PLAYING NOW</small><h3>{activeTrack.sampleName}</h3><p>{activeSamplerSettings?.layout === 'SLICE' ? 'Cuts from the source are spread across the drum pads.' : 'One sound is spread across the keyboard. Lower keys play it deep; higher keys play it bright and fast.'}</p></div>
                  <button type="button" onClick={() => setSampleShelfOpen(true)}>New sampler from shelf</button>
                </header>
                <div className="sampler-workbench">
                  <StudioSamplerWorkbench
                    sampleName={activeTrack.sampleName}
                    durationSec={activeTrack.sampleDurationSec}
                    waveform={activeTrack.sampleWaveform}
                    settings={activeSamplerSettings!}
                    onChange={(patch) => changeSamplerShape(activeTrack, patch)}
                    onAutoSlice={(count) => autoSliceSampler(activeTrack, count)}
                    onDetectSlices={() => detectSamplerSlices(activeTrack)}
                  />
                  <section className="instrument-performance sampler-performance">
                    <div className="performance-controls">
                      <button type="button" className={recording === 'MIDI' || countInRemaining !== undefined ? 'recording' : ''} onClick={() => void toggleRecord()}>{countInRemaining !== undefined ? '× Cancel count-in' : recording === 'MIDI' ? '■ Stop take' : '● Record take'}</button>
                      <button type="button" className="capture-play" disabled={!practiceNoteCount || !!recording || countInRemaining !== undefined} onClick={keepLastPlay}>◆ Keep last play{practiceNoteCount ? ` · ${practiceNoteCount}` : ''}</button>
                      {activeTrackUsesPads ? <span className="pad-count">{activeSamplerSettings!.slicePoints.length - 1} playable slices</span> : <span className="pad-count">18 notes around {noteName(activeSamplerSettings!.rootNote)}</span>}
                      <label>Velocity <input type="range" min="0.1" max="1" step="0.02" value={midiVelocity} onChange={(event) => setMidiVelocity(Number(event.target.value))} /></label>
                      <label>Count-in<select aria-label="Sampler record count-in" value={precountBars} onChange={(event) => setPrecountBars(Number(event.target.value) as 0 | 1 | 2)}><option value="0">Off</option><option value="1">1 bar</option><option value="2">2 bars</option></select></label>
                      <label>Line up<select aria-label="Sampler record quantize" value={recordQuantize} onChange={(event) => setRecordQuantize(event.target.value as RecordQuantize)}><option value="OFF">Off</option><option value="1/8">1/8</option><option value="1/16">1/16</option></select></label>
                      {!activeTrackUsesPads && <span className={`sustain-readout ${sustainActive ? 'active' : ''}`}>⇧ Shift sustain</span>}
                    </div>
                    <div className={`software-keyboard ${activeTrackUsesPads ? 'drum-keys' : ''}`} aria-label="Sampler computer MIDI keyboard">
                      {(activeTrackUsesPads ? DRUM_KEYS : QWERTY_KEYS).map(([code, label, offset]) => {
                        const pitch = activeTrackUsesPads ? offset : (samplerKeyboardBase ?? (midiOctave + 1) * 12) + offset;
                        const black = !activeTrackUsesPads && [1, 3, 6, 8, 10].includes(pitch % 12);
                        const sliceIndex = pitch - 36;
                        const soundName = activeTrackUsesPads ? `Slice ${sliceIndex + 1}` : noteName(pitch);
                        return <button key={code} type="button" className={`${black ? 'black' : ''} ${activeMidiPitches.includes(pitch) ? 'active' : ''}`}
                          disabled={activeTrackUsesPads && sliceIndex >= activeSamplerSettings!.slicePoints.length - 1}
                          onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);startAudition(pitch);}} onPointerUp={e=>{stopAudition(pitch);e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>stopAudition(pitch)} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();e.stopPropagation();startAudition(pitch);}}} onKeyUp={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();stopAudition(pitch);}}}
                          aria-label={`${label} plays ${soundName}`}><b>{label}</b><small>{soundName}</small></button>;
                      })}
                    </div>
                    <p className="keyboard-help">{activeTrackUsesPads ? <><b>Q–I + A–K</b> plays the cuts · Record captures a pad performance you can edit in Notes</> : <><b>A W S E D F…</b> plays the sample around its root · <b>Shift</b> holds it · Record captures a performance you can edit</>}</p>
                  </section>
                  <div className="device-strip sampler-effects">
                    <b>Track FX</b><span>Add space or punch after the sampler.</span>
                    <button type="button" className={activeTrack.effects.includes('SPACE') ? 'active' : ''} onClick={() => toggleRackEffect(activeTrack, 'SPACE')}>Reverb</button>
                    <button type="button" className={activeTrack.effects.includes('ECHO') ? 'active' : ''} onClick={() => toggleRackEffect(activeTrack, 'ECHO')}>Delay</button>
                    <button type="button" className={activeTrack.effects.includes('VOICE_SHINE') ? 'active' : ''} onClick={() => toggleRackEffect(activeTrack, 'VOICE_SHINE')}>Compressor</button>
                  </div>
                </div>
              </div>
            ) : dockTab === 'INSTRUMENT' ? (
              <div className="instrument-studio">
                <header className="instrument-studio-head">
                  <span className="instrument-mark" style={{ background: activePreset?.color }}>{activePreset?.icon ?? '♪'}</span>
                  <div><small>PLAYING NOW</small><h3>{activePreset?.name}</h3><p>{activePreset?.description}</p></div>
                  <div className="instrument-tags">{activePreset?.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  <button type="button" onClick={() => activePreset && void chooseInstrumentPreset(activeTrack, activePreset)} disabled={changingInstrument}>Reset sound</button>
                </header>

                <div className="instrument-workbench">
                  <section className="instrument-main">
                    {activeInstrumentControls&&<StudioSoundPad controls={activeInstrumentControls} onChange={(tone,motion)=>{
                      setProject(current=>{let next=setInstrumentControl(current,activeTrack.id,'tone',tone);next=setInstrumentControl(next,activeTrack.id,'motion',motion);const t=next.tracks.find(t=>t.id===activeTrack.id)!;engine.current!.setInstrumentControl(t.engineId,t.instrumentPresetId!,'tone',tone,t.instrumentControls!);return next;});
                    }}/>}
                    <div className="smart-controls">
                      <header><div><b>Sound controls</b></div><button className="keyboard-toggle" aria-pressed={keyboardEnabled} onClick={()=>setKeyboardEnabled(v=>!v)}>Typing keyboard {keyboardEnabled?'on':'off'}</button></header>
                      <div className="macro-grid">
                        {activeInstrumentControls && INSTRUMENT_CONTROLS.map((control) => <label key={control.id}>
                          <span><b>{control.label}</b><output>{Math.round(activeInstrumentControls[control.id] * 100)}</output></span>
                          <input aria-label={`${control.label} for ${activePreset?.name}`} type="range" min="0" max="1" step="0.01" value={activeInstrumentControls[control.id]} onChange={(event) => changeInstrumentMacro(activeTrack, control.id, Number(event.target.value))} />
                          <small><i>{control.low}</i><i>{control.high}</i></small>
                        </label>)}
                      </div>
                    </div>

                    <div className="instrument-performance">
                      <div className="performance-controls">
                        <button type="button" className={recording === 'MIDI' || countInRemaining !== undefined ? 'recording' : ''} onClick={() => void toggleRecord()}>{countInRemaining !== undefined ? '× Cancel count-in' : recording === 'MIDI' ? '■ Stop take' : '● Record take'}</button>
                        <button type="button" className="capture-play" disabled={!practiceNoteCount || !!recording || countInRemaining !== undefined} onClick={keepLastPlay}>◆ Keep last play{practiceNoteCount ? ` · ${practiceNoteCount}` : ''}</button>
                        {activeTrack.kind === 'DRUMS' ? <span className="pad-count">16 playable pads</span> : <label>Octave <button type="button" onClick={() => setMidiOctave((value) => Math.max(1, value - 1))}>−</button><b>{midiOctave}</b><button type="button" onClick={() => setMidiOctave((value) => Math.min(7, value + 1))}>＋</button></label>}
                        <label>Velocity <input type="range" min="0.1" max="1" step="0.02" value={midiVelocity} onChange={(event) => setMidiVelocity(Number(event.target.value))} /></label>
                        <label>Count-in<select aria-label="Record count-in" value={precountBars} onChange={(event) => setPrecountBars(Number(event.target.value) as 0 | 1 | 2)}><option value="0">Off</option><option value="1">1 bar</option><option value="2">2 bars</option></select></label>
                        <label>Line up<select aria-label="Record quantize" value={recordQuantize} onChange={(event) => setRecordQuantize(event.target.value as RecordQuantize)}><option value="OFF">Off</option><option value="1/8">1/8</option><option value="1/16">1/16</option></select></label>
                        {activeTrack.kind !== 'DRUMS' && <span className={`sustain-readout ${sustainActive ? 'active' : ''}`}>⇧ Shift sustain</span>}
                      </div>
                      <div className={`software-keyboard ${activeTrack.kind === 'DRUMS' ? 'drum-keys' : ''}`} aria-label="Computer MIDI keyboard">
                        {(activeTrack.kind === 'DRUMS' ? DRUM_KEYS : QWERTY_KEYS).map(([code, label, offset]) => {
                          const pitch = activeTrack.kind === 'DRUMS' ? offset : (midiOctave + 1) * 12 + offset;
                          const black = activeTrack.kind !== 'DRUMS' && [1, 3, 6, 8, 10].includes(pitch % 12);
                          const soundName = activeTrack.kind === 'DRUMS' ? (activePreset?.padNames?.[pitch - 36] ?? `Pad ${pitch - 35}`) : noteName(pitch);
                          return <button key={code} type="button" className={`${black ? 'black' : ''} ${activeMidiPitches.includes(pitch) ? 'active' : ''} ${activeTrack.kind === 'DRUMS' ? 'has-drum' : ''}`}
                            onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);startAudition(pitch);}} onPointerUp={e=>{stopAudition(pitch);e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>stopAudition(pitch)} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();e.stopPropagation();startAudition(pitch);}}} onKeyUp={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();stopAudition(pitch);}}}
                            aria-label={`${label} plays ${soundName}`}><b>{label}</b><small>{soundName}</small></button>;
                        })}
                      </div>
                      <p className="keyboard-help">{activeTrack.kind === 'DRUMS' ? <><b>Q–I + A–K</b> plays all 16 pads · Record gets a count-in · Keep last play rescues a beat you did not record</> : <><b>A W S E D F…</b> plays notes · <b>Shift</b> holds them · <b>Z / X</b> changes octave · Keep last play rescues an idea</>}</p>
                    </div>

                    <div className="device-strip">
                      <b>Track FX</b><span>Add space or punch after the instrument.</span>
                      <button type="button" className={activeTrack.effects.includes('SPACE') ? 'active' : ''} onClick={() => toggleRackEffect(activeTrack, 'SPACE')}>Reverb</button>
                      <button type="button" className={activeTrack.effects.includes('ECHO') ? 'active' : ''} onClick={() => toggleRackEffect(activeTrack, 'ECHO')}>Delay</button>
                      <button type="button" className={activeTrack.effects.includes('VOICE_SHINE') ? 'active' : ''} onClick={() => toggleRackEffect(activeTrack, 'VOICE_SHINE')}>Compressor</button>
                    </div>
                  </section>
                </div>
              </div>
            ) : selectedClip && selectedClip.source === 'INSTRUMENT' ? (
              <div className="midi-editor-panel">
                <div className="midi-toolbar" role="toolbar" aria-label="MIDI editor tools">
                  <div className="editor-clip-name"><small>EDITING REGION</small><b>{selectedClip.name}</b></div>
                  <button type="button" className={pianoTool === 'SELECT' ? 'active' : ''} onClick={() => setPianoTool('SELECT')} title="Select, marquee, move and resize">↖ Select</button>
                  <button type="button" className={pianoTool === 'DRAW' ? 'active' : ''} onClick={() => setPianoTool('DRAW')} title="Click to draw; click notes to erase">✎ Draw</button>
                  <label>Snap<select value={gridBeat} onChange={(event) => setGridBeat(Number(event.target.value))}><option value="1">1/4</option><option value="0.5">1/8</option><option value="0.25">1/16</option></select></label>
                  <button type="button" onClick={quantizeNotes} disabled={!selectedNoteIds.length} title="Quantize selected notes (Q)">Quantize</button>
                  <button type="button" onClick={humanizeSelectedNotes} disabled={!selectedNoteIds.length}>Humanize</button>
                  <button type="button" onClick={legatoSelectedNotes} disabled={selectedNoteIds.length < 2}>Legato</button>
                  <button type="button" onClick={duplicateSelectedNotes} disabled={!selectedNoteIds.length}>Duplicate</button>
                  <button type="button" onClick={() => deleteMidiNotes(selectedClip.notes.filter((note) => selectedNoteIds.includes(note.engineId)))} disabled={!selectedNoteIds.length}>Delete</button>
                  <button type="button" onClick={() => nudgeSelectedNotes({ pitch: -1 })} disabled={!selectedNoteIds.length} title="Transpose down one semitone">−1</button>
                  <button type="button" onClick={() => nudgeSelectedNotes({ pitch: 1 })} disabled={!selectedNoteIds.length} title="Transpose up one semitone">＋1</button>
                  <button type="button" onClick={() => nudgeSelectedNotes({ pitch: -12 })} disabled={!selectedNoteIds.length} title="Transpose down one octave">−12</button>
                  <button type="button" onClick={() => nudgeSelectedNotes({ pitch: 12 })} disabled={!selectedNoteIds.length} title="Transpose up one octave">＋12</button>
                  <div className="dock-spacer" />
                  <button type="button" onClick={() => setEditorLowestPitch((value) => Math.max(0, value - 12))}>View ↓</button>
                  <button type="button" onClick={() => setEditorLowestPitch((value) => Math.min(92, value + 12))}>View ↑</button>
                  <span className="selection-readout">{selectedNoteIds.length ? `${selectedNoteIds.length} selected` : 'Double-click to add · drag to select'}</span>
                </div>
                <PianoRoll
                  key={selectedClip.engineId}
                  notes={visibleStudioNotes(selectedClip,project.bpm)} selectedIds={selectedNoteIds} tool={pianoTool}
                  lowestPitch={editorLowestPitch} clipBeats={selectedClipBeats} gridBeat={gridBeat}
                  playheadBeat={playheadBeat - selectedClipStartBeat} activePitches={activeMidiPitches}
                  onSelectionChange={setSelectedNoteIds} onCreate={createMidiNote} onChange={(note,patch)=>changeMidiNote(note,studioSourceNotePatch(selectedClip,note,patch))}
                  onDelete={deleteMidiNotes} onAuditionStart={startAudition} onAuditionStop={stopAudition}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="garage-finish">
        <div><b>Mixdown</b><span>{project.tracks.length} tracks · {formatSeconds(projectSeconds(project))}</span></div>
        <label className="garage-output-story">Session<select aria-label="Mixdown story" value={storyId ?? ''} disabled={storyId === null || bindingBusy || !!recording || countInRemaining !== undefined || bouncing || editingBusy || !!boothImportingId || mixMeasuring} onChange={(event) => void switchStudioStory(event.target.value)}><option value="">Unlinked session</option>{storyChoices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        {storyId === '' && <><label className="garage-output-story">Link to<select aria-label="Link Studio session to story" value={linkStoryId} disabled={!ready || bindingBusy} onChange={(event) => setLinkStoryId(event.target.value)}><option value="">Choose a story</option>{storyChoices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="button" className="b" disabled={!ready || bindingBusy || !linkStoryId || !!recording || countInRemaining !== undefined || bouncing || editingBusy || !!boothImportingId || mixMeasuring} onClick={() => void attachCurrentSession()}>{bindingBusy ? 'Linking…' : 'Link session'}</button></>}
        <button type="button" className={`b mix-check-finish ${mixFixCount ? 'needs-work' : ''}`} disabled={!ready || mixMeasuring || projectSeconds(project) === 0} onClick={() => void runMixCheck()}>{mixMeasuring ? 'Listening…' : mixReading ? `Mix Check · ${mixFixCount}` : 'Run Mix Check'}</button>
        <button type="button" className="b" disabled={!ready || bouncing || projectSeconds(project) === 0 || !story} onClick={() => void exportMixdown(false)}>{bouncing ? 'Rendering…' : 'Save to Media Bin'}</button>
        <button type="button" className="b go" disabled={!ready || bouncing || projectSeconds(project) === 0 || !story} onClick={() => void exportMixdown(true)}>{bouncing ? 'Rendering…' : 'Export WAV'}</button>
        <button type="button" className="b" onClick={() => navigate('/files')}>Open Media Bin →</button>
      </div>

      {contextMenu&&<><div className="clip-menu-dismiss" onPointerDown={()=>setContextMenu(undefined)}/><div className="clip-context-menu" role="menu" style={{left:Math.min(contextMenu.x,window.innerWidth-210),top:Math.min(contextMenu.y,window.innerHeight-240)}}><button role="menuitem" onClick={()=>pasteClips(true)}>Duplicate <kbd>⌘/Ctrl D</kbd></button><button role="menuitem" onClick={()=>{copyClips();setContextMenu(undefined);}}>Copy <kbd>⌘/Ctrl C</kbd></button><button role="menuitem" onClick={()=>pasteClips()}>Paste at playhead</button><button role="menuitem" onClick={splitClips}>Split at playhead <kbd>Alt X</kbd></button><button role="menuitem" onClick={deleteClips}>Delete</button></div></>}
      <LookInside room="Studio" intro="Welcome to the control room. These moves carry straight into BandLab and other full DAWs." rows={[
        { nm: 'Read the arrangement', sb: <>Time runs left to right in bars. Tracks stack top to bottom. The playhead marks the exact moment you are hearing.</> },
        { nm: 'Loop the hard part', sb: <>Turn on Cycle with <b>C</b>, then drag the loop handles around the section you want to rehearse, record, or fine-tune.</> },
        { nm: 'Perform, then polish', sb: <>Choose an instrument track, play with the QWERTY keyboard, and record a real pass. Fix the notes after you have captured the feel.</> },
        { nm: 'Build a sound shelf', sb: <>Connect a sample folder, preview sounds in place, then put one on the timeline or spread it across a sampler. Studio remembers the linked folder on this computer.</> },
        { nm: 'Shape a sample', sb: <>Trim the useful part of the waveform, tune its root note, and choose one-shot, gate, or loop. Switch to Slice to turn one recording into playable pads.</> },
        { nm: 'Open the piano roll', sb: <>Double-click a MIDI region. Draw, move, resize, quantize, humanize, transpose, change velocity, or use Legato to connect selected notes.</> },
        { nm: 'Learn the hot keys', sb: <><b>Space</b> plays, <b>R</b> records, <b>M</b> runs the metronome, <b>C</b> cycles, <b>Q</b> quantizes, and <b>Enter</b> rewinds.</> },
        { nm: 'Know audio from MIDI', sb: <>Audio is captured sound. MIDI is note and performance data that plays an instrument. Both live on the arrangement, but they edit differently.</> },
        { nm: 'Mix around the voice', sb: <>Set speech first. Bring music up until it adds energy, then back it down until every word stays easy to understand.</> },
        { nm: 'Run Mix Check', sb: <>Let Studio listen to the exact WAV it would export. It checks headroom, voice balance, and low-end weight, then opens the track that needs attention.</> },
      ]} />
    </section>
  );
}
