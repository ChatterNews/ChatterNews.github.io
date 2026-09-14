import { describe, expect, it } from 'vitest';
import {
  blastReilyFocus,
  blastReilyRecovery,
  boothReilyRecovery,
  boothReilyFocus,
  chatterboxReilyFocus,
  chatterboxReilyRecovery,
  deskReilyFocus,
  greenLightReilyFocus,
  showtimeReilyFocus,
  showtimeReilyRecovery,
  slateReilyFocus,
  stingerReilyFocus,
  stingerReilyRecovery,
  studioReilyFocus,
  studioReilyRecovery,
} from './reily-room-focus.js';

describe('Reily room focus derivation', () => {
  it('maps planning and writing work', () => {
    expect(slateReilyFocus({ selectedStory: false })).toBe('slate.direction');
    expect(slateReilyFocus({ selectedStory: true, tab: 'REPORT', reportArea: 'QUESTIONS' })).toBe('slate.questions');
    expect(slateReilyFocus({ selectedStory: true, tab: 'REPORT', reportArea: 'SOURCES' })).toBe('slate.sources');
    expect(deskReilyFocus(undefined)).toBe('desk.write');
    expect(deskReilyFocus('CHECK')).toBe('desk.structure');
    expect(deskReilyFocus('REPORTING')).toBe('desk.sources');
    expect(deskReilyFocus('REVIEW')).toBe('desk.review');
  });

  it('maps recording and audio work', () => {
    expect(boothReilyFocus({ recording: true, selectedTake: false })).toBe('booth.record');
    expect(boothReilyFocus({ recording: false, selectedTake: true })).toBe('booth.edit');
    expect(boothReilyFocus({ recording: false, selectedTake: false, hasTakes: true })).toBe('booth.listen');
    expect(boothReilyFocus({ recording: false, selectedTake: false })).toBe('booth.setup');
    expect(studioReilyFocus({ recording: true })).toBe('studio.record');
    expect(studioReilyFocus({ pianoRollOpen: true })).toBe('studio.instrument');
    expect(studioReilyFocus({ mixOpen: true })).toBe('studio.mix');
    expect(studioReilyFocus({})).toBe('studio.arrange');
    expect(chatterboxReilyFocus('RUNDOWN')).toBe('chatterbox.rundown');
    expect(chatterboxReilyFocus('RECORD')).toBe('chatterbox.record');
    expect(chatterboxReilyFocus('CUT')).toBe('chatterbox.edit');
    expect(chatterboxReilyFocus('MIX')).toBe('chatterbox.edit');
    expect(chatterboxReilyFocus('PACKAGE')).toBe('chatterbox.package');
  });

  it('maps authored audio failures to recovery cards without guessing from message copy', () => {
    expect(boothReilyRecovery('microphone')).toBe('booth.microphone');
    expect(boothReilyRecovery('import')).toBe('booth.import');
    expect(studioReilyRecovery('engine')).toBe('studio.engine');
    expect(studioReilyRecovery('record')).toBe('studio.record');
    expect(studioReilyRecovery('microphone')).toBe('studio.record');
    expect(studioReilyRecovery('import')).toBe('studio.import');
    expect(studioReilyRecovery('mixdown')).toBe('studio.export');
    expect(studioReilyRecovery('track')).toBeUndefined();
    expect(chatterboxReilyRecovery('microphone')).toBe('chatterbox.microphone');
    expect(chatterboxReilyRecovery('import')).toBe('chatterbox.import');
    expect(chatterboxReilyRecovery('export')).toBe('chatterbox.export');
  });

  it('maps visual and review work', () => {
    expect(blastReilyFocus(undefined)).toBe('blast.canvas');
    expect(blastReilyFocus('TEXT')).toBe('blast.text');
    expect(blastReilyFocus('IMAGE')).toBe('blast.image');
    expect(blastReilyFocus('SHAPE')).toBe('blast.shape');
    expect(stingerReilyFocus({ inspector: 'DESIGN', selectedKind: 'TEXT' })).toBe('stinger.text');
    expect(stingerReilyFocus({ inspector: 'DESIGN', selectedKind: 'IMAGE' })).toBe('stinger.image');
    expect(stingerReilyFocus({ inspector: 'MOTION', selectedKind: 'TEXT' })).toBe('stinger.motion');
    expect(stingerReilyFocus({ inspector: 'DESIGN' })).toBe('stinger.screen');
    expect(showtimeReilyFocus({ mode: 'ROLL' })).toBe('showtime.record');
    expect(showtimeReilyFocus({ mode: 'LIVE' })).toBe('showtime.switch');
    expect(showtimeReilyFocus({ mode: 'CUT' })).toBe('showtime.cut');
    expect(showtimeReilyFocus({ mode: 'CUT', selectedTitleKind: 'CAPTION' })).toBe('showtime.captions');
    expect(greenLightReilyFocus({ selectedStory: false, openNotes: 0 })).toBe('greenlight.preview');
    expect(greenLightReilyFocus({ selectedStory: true, openNotes: 2 })).toBe('greenlight.notes');
    expect(greenLightReilyFocus({ selectedStory: true, openNotes: 0 })).toBe('greenlight.release');
  });

  it('maps visual-production failures to the matching recovery card', () => {
    expect(blastReilyRecovery('import')).toBe('blast.import');
    expect(blastReilyRecovery('export')).toBe('blast.export');
    expect(stingerReilyRecovery('import')).toBe('stinger.import');
    expect(stingerReilyRecovery('export')).toBe('stinger.export');
    expect(showtimeReilyRecovery('camera')).toBe('showtime.camera');
    expect(showtimeReilyRecovery('microphone')).toBe('showtime.microphone');
    expect(showtimeReilyRecovery('media')).toBe('showtime.media');
    expect(showtimeReilyRecovery('export')).toBe('showtime.export');
  });
});
