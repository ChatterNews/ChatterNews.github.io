import { describe, expect, test } from 'vitest';
import { analyzePcmChannels, detectTransientSlices, summarizeWaveformChannels } from './studio-mix-analysis.js';

describe('Studio audio analysis', () => {
  test('measures peaks, clipping, loudness, and low-frequency weight from PCM', () => {
    const sampleRate = 4_800;
    const signal = Float32Array.from({ length: sampleRate }, (_, index) => {
      const bass = Math.sin(index / sampleRate * Math.PI * 2 * 80) * .45;
      return index === 20 ? 1 : bass;
    });
    const reading = analyzePcmChannels([signal], sampleRate);
    expect(reading.peak).toBe(1);
    expect(reading.clippedFraction).toBeGreaterThan(0);
    expect(reading.rms).toBeGreaterThan(.2);
    expect(reading.lowEnergyRatio).toBeGreaterThan(.4);
  });

  test('finds spaced-onset boundaries for sampler pads', () => {
    const samples = new Float32Array(4_800);
    [480, 1_920, 3_360].forEach((start) => {
      for (let index = start; index < start + 80; index++) samples[index] = (start + 80 - index) / 80;
    });
    const slices = detectTransientSlices([samples], 4_800, 8);
    expect(slices[0]).toBe(0);
    expect(slices.at(-1)).toBe(1);
    expect(slices.length).toBeGreaterThanOrEqual(4);
  });

  test('does not invent sampler cuts in silence or a steady tone', () => {
    expect(detectTransientSlices([new Float32Array(4_800)], 4_800, 16)).toEqual([0, 1]);
    expect(detectTransientSlices([new Float32Array(4_800).fill(.25)], 4_800, 16)).toEqual([0, 1]);
  });

  test('measures active passages without letting long silence bury a short voice take', () => {
    const samples = new Float32Array(48_000);
    samples.fill(.5, 0, 4_800);
    const reading = analyzePcmChannels([samples], 4_800);
    expect(reading.rms).toBeLessThan(.2);
    expect(reading.activeRms).toBeGreaterThan(.45);
  });

  test('builds a normalized waveform summary without inventing peaks', () => {
    const quiet = new Float32Array(40).fill(.1);
    const loud = new Float32Array(40).fill(.8);
    const peaks = summarizeWaveformChannels([Float32Array.from([...quiet, ...loud])], 4);
    expect(peaks).toHaveLength(4);
    expect(peaks[0]).toBeCloseTo(.1);
    expect(peaks[3]).toBeCloseTo(.8);
  });
});
