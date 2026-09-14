import type { ReilyFocus, ReilyRecoveryKind } from './reily-advice.js';

export function slateReilyFocus(state: {
  selectedStory: boolean;
  tab?: 'PLAN' | 'REPORT' | 'PRODUCE';
  reportArea?: 'QUESTIONS' | 'SOURCES';
}): ReilyFocus {
  if (!state.selectedStory || state.tab === 'PLAN' || state.tab === 'PRODUCE') return 'slate.direction';
  return state.reportArea === 'SOURCES' ? 'slate.sources' : 'slate.questions';
}

export function deskReilyFocus(tab?: 'CHECK' | 'BRIEF' | 'REPORTING' | 'REVIEW'): ReilyFocus {
  if (tab === 'CHECK') return 'desk.structure';
  if (tab === 'BRIEF' || tab === 'REPORTING') return 'desk.sources';
  if (tab === 'REVIEW') return 'desk.review';
  return 'desk.write';
}

export function greenLightReilyFocus(state: { selectedStory: boolean; openNotes: number }): ReilyFocus {
  if (!state.selectedStory) return 'greenlight.preview';
  return state.openNotes > 0 ? 'greenlight.notes' : 'greenlight.release';
}

export function boothReilyFocus(state: { recording: boolean; selectedTake: boolean; hasTakes?: boolean }): ReilyFocus {
  if (state.recording) return 'booth.record';
  if (state.selectedTake) return 'booth.edit';
  if (state.hasTakes) return 'booth.listen';
  return 'booth.setup';
}

export function studioReilyFocus(state: { recording?: boolean; pianoRollOpen?: boolean; mixOpen?: boolean }): ReilyFocus {
  if (state.recording) return 'studio.record';
  if (state.pianoRollOpen) return 'studio.instrument';
  if (state.mixOpen) return 'studio.mix';
  return 'studio.arrange';
}

export function chatterboxReilyFocus(station: 'RUNDOWN' | 'RECORD' | 'CUT' | 'MIX' | 'PACKAGE'): ReilyFocus {
  if (station === 'RUNDOWN') return 'chatterbox.rundown';
  if (station === 'RECORD') return 'chatterbox.record';
  if (station === 'PACKAGE') return 'chatterbox.package';
  return 'chatterbox.edit';
}

export function boothReilyRecovery(action: 'microphone' | 'import'): ReilyRecoveryKind {
  return action === 'microphone' ? 'booth.microphone' : 'booth.import';
}

export function studioReilyRecovery(action?: 'engine' | 'track' | 'record' | 'microphone' | 'import' | 'mixdown'): ReilyRecoveryKind | undefined {
  if (action === 'engine') return 'studio.engine';
  if (action === 'record' || action === 'microphone') return 'studio.record';
  if (action === 'import') return 'studio.import';
  if (action === 'mixdown') return 'studio.export';
  return undefined;
}

export function chatterboxReilyRecovery(action: 'microphone' | 'import' | 'export'): ReilyRecoveryKind {
  if (action === 'microphone') return 'chatterbox.microphone';
  if (action === 'import') return 'chatterbox.import';
  return 'chatterbox.export';
}

export function blastReilyFocus(kind?: 'TEXT' | 'IMAGE' | 'SHAPE' | 'LINE' | 'GROUP'): ReilyFocus {
  if (kind === 'TEXT') return 'blast.text';
  if (kind === 'IMAGE') return 'blast.image';
  if (kind === 'SHAPE' || kind === 'LINE') return 'blast.shape';
  return 'blast.canvas';
}

export function blastReilyRecovery(action: 'import' | 'export'): ReilyRecoveryKind {
  return action === 'import' ? 'blast.import' : 'blast.export';
}

export function stingerReilyFocus(state: {
  inspector: 'BRAND' | 'DESIGN' | 'MOTION' | 'DATA';
  selectedKind?: 'TEXT' | 'IMAGE' | 'SHAPE';
}): ReilyFocus {
  if (state.inspector === 'MOTION' && state.selectedKind) return 'stinger.motion';
  if (state.inspector === 'DESIGN' && state.selectedKind === 'TEXT') return 'stinger.text';
  if (state.inspector === 'DESIGN' && state.selectedKind === 'IMAGE') return 'stinger.image';
  return 'stinger.screen';
}

export function stingerReilyRecovery(action: 'import' | 'export'): ReilyRecoveryKind {
  return action === 'import' ? 'stinger.import' : 'stinger.export';
}

export function showtimeReilyFocus(state: {
  mode: 'ROLL' | 'LIVE' | 'CUT';
  selectedTitleKind?: 'HEADLINE' | 'LOWER_THIRD' | 'CAPTION';
}): ReilyFocus {
  if (state.mode === 'ROLL') return 'showtime.record';
  if (state.mode === 'LIVE') return 'showtime.switch';
  return state.selectedTitleKind === 'CAPTION' ? 'showtime.captions' : 'showtime.cut';
}

export function showtimeReilyRecovery(action: 'camera' | 'microphone' | 'media' | 'export'): ReilyRecoveryKind {
  if (action === 'camera') return 'showtime.camera';
  if (action === 'microphone') return 'showtime.microphone';
  if (action === 'media') return 'showtime.media';
  return 'showtime.export';
}
