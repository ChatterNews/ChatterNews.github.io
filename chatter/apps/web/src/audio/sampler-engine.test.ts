import { describe, expect, test } from 'vitest';
import { DEFAULT_SAMPLER_SETTINGS } from '@chatter/shared';
import { BoxGraph } from '@opendaw/lib-box';
import { UUID } from '@opendaw/lib-std';
import { PlayfieldSampleBox } from '@opendaw/studio-boxes';
import { samplerFilterFrequency, samplerVoicePlan } from './sampler-engine.js';

describe('OpenDAW sampler voice plan', () => {
  test('maps the source chromatically around the chosen root note', () => {
    const voices = samplerVoicePlan({
      ...DEFAULT_SAMPLER_SETTINGS, start: .1, end: .9, rootNote: 60, tune: .5, attack: .25, release: .5, mode: 'GATE',
    });
    expect(voices).toHaveLength(24);
    expect(voices[12]).toMatchObject({ note: 60, pitchCents: 50, start: .1, end: .9, gate: 1 });
    expect(voices[23]).toMatchObject({ note: 71, pitchCents: 1150 });
    expect(Math.max(...voices.map((voice) => Math.abs(voice.pitchCents - 50)))).toBeLessThanOrEqual(1200);
    expect(voices[12]!.attackSec).toBeGreaterThan(0);
    expect(voices[12]!.releaseSec).toBeGreaterThan(voices[12]!.attackSec);
  });

  test('keeps every planned pitch inside the real Playfield field range', () => {
    const graph = new BoxGraph();
    graph.beginTransaction();
    const sample = PlayfieldSampleBox.create(graph, UUID.generate());
    for (const voice of samplerVoicePlan({ ...DEFAULT_SAMPLER_SETTINGS, rootNote: 60, tune: .5 })) {
      sample.pitch.setValue(voice.pitchCents);
      expect(sample.pitch.getValue()).toBe(voice.pitchCents);
    }
    graph.endTransaction();
  });

  test('maps slices across the familiar drum-pad notes inside the trim window', () => {
    const voices = samplerVoicePlan({
      ...DEFAULT_SAMPLER_SETTINGS,
      layout: 'SLICE', start: .2, end: .8, mode: 'LOOP', slicePoints: [0, .25, .5, 1],
    });
    expect(voices).toHaveLength(3);
    expect(voices[0]).toMatchObject({ note: 36, start: .2, gate: 2 });
    expect(voices[0]!.end).toBeCloseTo(.35);
    expect(voices[2]).toMatchObject({ note: 38, start: .5, end: .8, gate: 2 });
  });

  test('opens the low-pass filter across a useful musical range', () => {
    expect(samplerFilterFrequency(0)).toBe(180);
    expect(samplerFilterFrequency(1)).toBe(20_000);
    expect(samplerFilterFrequency(.5)).toBeGreaterThan(1_000);
  });
});
