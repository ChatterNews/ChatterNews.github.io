import { describe, expect, test } from 'vitest';
import { playheadLeftPx, shouldPublishPlayhead, studioTimelineLabels } from './studio-performance.js';

describe('Studio Chromebook render helpers', () => {
  test('caps a very long ruler without losing its first or final bar', () => {
    const labels = studioTimelineLabels(360, 42, 96);
    expect(labels[0]).toBe(0);
    expect(labels.at(-1)).toBe(359);
    expect(labels.length).toBeLessThanOrEqual(96);
  });

  test('keeps every bar label for a short arrangement at a readable zoom', () => {
    expect(studioTimelineLabels(8, 42, 96)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('respects zoom density and throttles React clock publications', () => {
    expect(studioTimelineLabels(12, 10, 96)).toEqual([0, 4, 8, 11]);
    expect(shouldPublishPlayhead(100, 120)).toBe(false);
    expect(shouldPublishPlayhead(100, 134)).toBe(true);
    expect(playheadLeftPx(4, 42)).toBe(388);
  });
});
