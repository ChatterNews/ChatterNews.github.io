import { describe, expect, it } from 'vitest';
import { inspectorTabsFor, resolveInspectorTab } from './stinger-inspector.js';

describe('Stinger inspector tabs', () => {
  it('keeps layer-only tabs unavailable while the scene itself is selected', () => {
    expect(inspectorTabsFor(undefined)).toEqual([
      { id: 'DESIGN', available: true, unavailableReason: undefined },
      { id: 'MOTION', available: false, unavailableReason: 'Select a layer to edit its movement.' },
      { id: 'DATA', available: false, unavailableReason: 'Select a word layer to link story details.' },
      { id: 'BRAND', available: true, unavailableReason: undefined },
    ]);
  });

  it('only offers story data to word layers', () => {
    expect(inspectorTabsFor('SHAPE').find((tab) => tab.id === 'DATA')).toEqual({
      id: 'DATA',
      available: false,
      unavailableReason: 'Story details only work with word layers.',
    });
    expect(inspectorTabsFor('IMAGE').find((tab) => tab.id === 'DATA')?.available).toBe(false);
    expect(inspectorTabsFor('TEXT').every((tab) => tab.available)).toBe(true);
  });

  it('returns to Look when a selection makes the open tab irrelevant', () => {
    expect(resolveInspectorTab('MOTION', undefined)).toBe('DESIGN');
    expect(resolveInspectorTab('DATA', 'SHAPE')).toBe('DESIGN');
    expect(resolveInspectorTab('MOTION', 'IMAGE')).toBe('MOTION');
    expect(resolveInspectorTab('BRAND', undefined)).toBe('BRAND');
  });
});
