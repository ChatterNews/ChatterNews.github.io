import { describe, expect, test } from 'vitest';
import { analyzeBoothAudio, buildBoothTakeCheck, BOOTH_PERFORMANCE_MODES } from './booth-take-check.js';
import type { TakeAudio } from './take-audio.js';

function audioFromWindows(levels: number[], windowSeconds = 0.1): TakeAudio {
  const sampleRate = 1000;
  const samples = levels.flatMap((level) => Array.from({ length: sampleRate * windowSeconds }, () => level));
  return { sampleRate, duration: samples.length / sampleRate, channels: [Float32Array.from(samples)] };
}

describe('Booth Take Check', () => {
  test('offers four concrete performance modes with different pace targets', () => {
    expect(BOOTH_PERFORMANCE_MODES.map((mode) => mode.id)).toEqual(['NEWS_READ', 'INTERVIEW_ANSWER', 'NARRATION', 'PODCAST_CONVERSATION']);
    expect(BOOTH_PERFORMANCE_MODES.find((mode) => mode.id === 'NEWS_READ')?.pace).not.toEqual(BOOTH_PERFORMANCE_MODES.find((mode) => mode.id === 'NARRATION')?.pace);
  });

  test('measures clipping, quiet-floor noise, and an interior long pause from real samples', () => {
    const audio = audioFromWindows([
      ...Array(5).fill(0.02),
      ...Array(8).fill(0.3),
      ...Array(20).fill(0),
      ...Array(8).fill(1),
      ...Array(5).fill(0.02),
    ]);
    const analysis = analyzeBoothAudio(audio);
    expect(analysis.peakDb).toBeCloseTo(0, 1);
    expect(analysis.clippedSamples).toBeGreaterThan(0);
    expect(analysis.noiseFloorDb).toBeCloseTo(-34, 1);
    expect(analysis.longestInteriorSilenceSec).toBeGreaterThanOrEqual(1.9);
  });

  test('turns evidence into specific checks instead of an opaque score', () => {
    const checks = buildBoothTakeCheck({
      analysis: { durationSec: 60, peakDb: -0.01, clippedSamples: 20, sampleCount: 60_000, noiseFloorDb: -30, longestInteriorSilenceSec: 2.4 },
      mode: 'NEWS_READ',
      transcriptText: Array(200).fill('word').join(' '),
      slated: false,
    });
    expect(checks.find((check) => check.id === 'LEVEL')).toMatchObject({ status: 'REVIEW' });
    expect(checks.find((check) => check.id === 'ROOM')).toMatchObject({ status: 'REVIEW' });
    expect(checks.find((check) => check.id === 'FLOW')).toMatchObject({ status: 'REVIEW' });
    expect(checks.find((check) => check.id === 'PACE')).toMatchObject({ status: 'REVIEW' });
    expect(checks.find((check) => check.id === 'SLATE')).toMatchObject({ status: 'REVIEW' });
  });

  test('leaves pace waiting when a transcript is not available', () => {
    const checks = buildBoothTakeCheck({
      analysis: { durationSec: 30, peakDb: -6, clippedSamples: 0, sampleCount: 30_000, noiseFloorDb: -55, longestInteriorSilenceSec: 0.5 },
      mode: 'INTERVIEW_ANSWER',
      transcriptText: '',
      slated: true,
    });
    expect(checks.find((check) => check.id === 'PACE')).toMatchObject({ status: 'WAITING' });
    expect(checks.filter((check) => check.status === 'REVIEW')).toHaveLength(0);
  });
});
