import { describe, expect, it } from 'vitest';
import { recommendReilyHelp } from './reily-help.js';
import { REILY_CREATING_HELP } from './reily-help-creating.js';
import type { ReilyHelpContext } from './reily-help-types.js';

const matches = (id: string, situation: ReilyHelpContext['situation']) => {
  const topic = REILY_CREATING_HELP.find(item => item.id === id)!;
  return Boolean(topic.when?.({ room: situation?.room ?? 'blast', role: 'STUDENT', situation }));
};

describe('Reily practical creating help', () => {
  it('does not diagnose a locked or uneditable document without observed state', () => {
    expect(matches('blast.locked', undefined)).toBe(false);
    expect(matches('blast.locked', { room: 'blast', activeTool: 'locked' })).toBe(true);
    expect(matches('desk.readonly', { room: 'desk', projectSelected: false, canEdit: false })).toBe(false);
    expect(matches('desk.readonly', { room: 'desk', projectSelected: true, canEdit: false })).toBe(true);
    expect(matches('desk.readonly', { room: 'desk', projectSelected: true, canEdit: true })).toBe(false);
  });
  it('keeps graphic timing help out of the video timeline recommendations', () => {
    expect(matches('graphics.timing', { room: 'stinger', activeTool: 'CUT' })).toBe(false);
    expect(matches('graphics.timing', { room: 'stinger', activeTool: 'graphics:MOTION' })).toBe(true);
    expect(matches('graphics.words', { room: 'stinger', activeTool: 'CUT', selectedKind: 'TEXT' })).toBe(false);
    expect(matches('graphics.words', { room: 'stinger', activeTool: 'graphics:DESIGN', selectedKind: 'TEXT' })).toBe(true);
  });
  it('recommends help for the actual selection and task', () => {
    expect(matches('blast.group', { room: 'blast', selectionCount: 1 })).toBe(false);
    expect(matches('blast.group', { room: 'blast', selectionCount: 3 })).toBe(true);
    expect(matches('blast.text', { room: 'blast', selectedKind: 'IMAGE' })).toBe(false);
    expect(matches('blast.text', { room: 'blast', selectedKind: 'TEXT' })).toBe(true);
    expect(matches('desk.compare', { room: 'desk', activeTool: 'compare' })).toBe(true);
    expect(matches('slate.direction', { room: 'slate', activeTool: 'create' })).toBe(true);
  });
  it('provides bounded steps and preserves the editable-versus-export distinction', () => {
    expect(new Set(REILY_CREATING_HELP.map(item => item.id)).size).toBe(REILY_CREATING_HELP.length);
    for (const topic of REILY_CREATING_HELP) {
      expect(topic.steps.length).toBeGreaterThanOrEqual(2);
      expect(topic.steps.length).toBeLessThanOrEqual(4);
      expect(topic.summary.length).toBeGreaterThan(20);
    }
    expect(REILY_CREATING_HELP.find(item => item.id === 'blast.export')!.steps.join(' ')).toContain('not the editable design');
    expect(REILY_CREATING_HELP.find(item => item.id === 'desk.save')!.steps.join(' ')).toContain('does not include all story media');
  });
});

describe('Blast help priority', () => {
  const recommended = (situation: ReilyHelpContext['situation'], focus?: ReilyHelpContext['focus']) => recommendReilyHelp({ room: 'blast', role: 'STUDENT', situation, focus }, 3).map(topic => topic.id);
  it('leads with word editing and keeps text styling in the first three', () => {
    const ids = recommended({ room: 'blast', projectSelected: true, selectedKind: 'TEXT', selectionCount: 1, activeTool: 'add' }, 'blast.text');
    expect(ids[0]).toBe('blast.text');
    expect(ids).toContain('blast.text-style');
  });
  it('offers starting and resuming before editor details on the shelf', () => {
    const ids = recommended({ room: 'blast', projectSelected: false, activeTool: 'start' });
    expect(ids.slice(0, 2)).toEqual(['blast.start', 'blast.resume']);
  });
  it('puts confirmed locks and active loading ahead of text craft', () => {
    expect(recommended({ room: 'blast', selectedKind: 'TEXT', selectionCount: 1, activeTool: 'locked' }, 'blast.text')[0]).toBe('blast.locked');
    expect(recommended({ room: 'blast', selectedKind: 'TEXT', busy: true, activeTool: 'add' }, 'blast.text')[0]).toBe('blast.wait');
  });
});
