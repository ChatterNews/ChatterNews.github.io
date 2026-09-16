import { describe, expect, it } from 'vitest';
import type { Story } from './types.js';
import {
  crewHandoffProgress,
  crewHandoffSpecimen,
  formatCrewHandoff,
  parseCrewHandoff,
} from './crew-handoff.js';

const story: Story = {
  id: 'solar-race',
  createdAt: 1,
  updatedAt: 1,
  slug: 'solar-race',
  title: 'Solar race',
  channels: ['web', 'social'],
  status: 'WORK',
  body: { type: 'doc', content: [] },
  readTimeSec: 0,
  bylineIds: [],
  brief: {
    angle: 'The new solar cars completed more laps than last year.',
    angleCheck: {
      affected: 'The students rebuilding their cars before regionals',
      verification: 'Count completed laps and check the timing sheet',
    },
    audience: 'Our school community',
    priority: 'NORMAL',
    questions: [],
    sources: [],
    checklist: [],
    productionNotes: '',
  },
};

describe('Crew handoff specimens', () => {
  it('gives every newsroom role a distinct, story-specific handoff', () => {
    const locations = (['report', 'write', 'voice', 'edit', 'produce', 'picture'] as const)
      .map((role) => crewHandoffSpecimen(role, story));

    expect(locations.map((item) => item.location)).toEqual([
      'Slate → Solar race → Reporting file.',
      'Desk → Solar race → saved story draft.',
      'Booth → Solar race → selected take.',
      'Green Light → Solar race → open review.',
      'Media Bin → Solar race → latest saved audio.',
      'Blast → Solar race → latest saved design.',
    ]);
    expect(locations.every((item) => `${item.finished} ${item.location} ${item.next}`.includes('Solar race'))).toBe(true);
    expect(locations[0]!.next).toContain('Count completed laps and check the timing sheet');
  });

  it('round-trips the three relay-card answers through the existing handoff note', () => {
    const parts = {
      finished: 'Interviewed Ava and Mr. Lee and marked two exact quotes.',
      location: 'Slate reporting file, sources one and two.',
      next: 'Confirm the lap count against Friday’s timing sheet.',
    };

    const note = formatCrewHandoff(parts);
    expect(note).toBe('FINISHED\nInterviewed Ava and Mr. Lee and marked two exact quotes.\n\nFIND IT\nSlate reporting file, sources one and two.\n\nCHECK NEXT\nConfirm the lap count against Friday’s timing sheet.');
    expect(parseCrewHandoff(note)).toEqual(parts);
    expect(crewHandoffProgress(parts)).toBe(3);
  });

  it('keeps an older freeform handoff readable without pretending it filled all three parts', () => {
    expect(parseCrewHandoff('The flyer is in Blast. Double-check the venue.')).toEqual({
      finished: 'The flyer is in Blast. Double-check the venue.',
      location: '',
      next: '',
    });
    expect(crewHandoffProgress(parseCrewHandoff('The flyer is in Blast. Double-check the venue.'))).toBe(1);
  });

  it('does not turn an untouched relay card into a visible note', () => {
    expect(formatCrewHandoff({ finished: '', location: '', next: '' })).toBe('');
  });
});
