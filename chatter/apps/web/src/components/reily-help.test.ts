import { describe, expect, it } from 'vitest';
import { REILY_HELP_TOPICS, recommendReilyHelp, searchReilyHelp } from './reily-help.js';
import { mergeReilySituation } from './reily-help-context.js';
import { REILY_ROOMS, type ReilyRoom } from './reily-advice.js';

const context = (room: ReilyRoom) => ({ room, role: 'STUDENT' as const });
describe('practical guide coverage and honest matching', () => {
  it('has distinct, actionable guides for every active room and no retired Studio navigation', () => {
    expect(new Set(REILY_HELP_TOPICS.map(t => t.id)).size).toBe(REILY_HELP_TOPICS.length);
    for (const room of REILY_ROOMS.filter(r => r !== 'studio')) expect(REILY_HELP_TOPICS.some(t => t.room === room), room).toBe(true);
    for (const topic of REILY_HELP_TOPICS) {
      expect(topic.steps.length, topic.id).toBeGreaterThanOrEqual(2);
      expect(topic.steps.length, topic.id).toBeLessThanOrEqual(5);
      expect(topic.action?.room).not.toBe('studio');
    }
  });
  it('does not invent an answer when the words do not match the library', () => {
    expect(searchReilyHelp('xyzzylollipop', context('blast'))).toEqual([]);
    expect(searchReilyHelp('how do I', context('blast'))).toEqual([]);
  });
  it.each([
    ['blast', 'change the words', 'blast.text'],
    ['blast', 'I don’t know how to add a picture', 'blast.image'],
    ['blast', 'why wont it let me type', 'blast.text'],
    ['chatterbox', 'I cant hear my sound', 'media.podcast-silent'],
    ['blast', 'how do i make my text bigger', 'blast.text-style'],
    ['blast', 'photo cropped', 'blast.image-fit'],
    ['chatterbox', 'silent episode', 'media.podcast-silent'],
    ['stinger', 'member credits', 'media.video-credits'],
    ['booth', 'mic permission blocked', 'media.booth-mic'],
    ['foley', 'import downloaded audio', 'media.foley-import'],
  ] as const)('finds %s guidance for a student asking %s', (room, query, id) => {
    expect(searchReilyHelp(query, context(room)).map(t => t.id)).toContain(id);
  });
  it('lets a student find a repair guide before a detected error occurs', () => {
    const c = context('booth');
    expect(recommendReilyHelp(c).map(t => t.id)).not.toContain('media.booth-mic');
    expect(searchReilyHelp('microphone not working', c).map(t => t.id)).toContain('media.booth-mic');
  });
});
describe('situations stay with the visible work', () => {
  it('drops previous-room focus and recovery instead of diagnosing the wrong app', () => {
    const merged = mergeReilySituation({ ...context('blast'), focus: 'booth.record', recovery: { kind: 'booth.microphone', workChanged: false } }, [{ room: 'booth', recording: true }]);
    expect(merged.focus).toBeUndefined(); expect(merged.recovery).toBeUndefined(); expect(merged.situation).toBeUndefined();
  });
  it('combines video selection with parent busy state rather than discarding either', () => {
    const merged = mergeReilySituation(context('stinger'), [{ room: 'stinger', selectedKind: 'AUDIO', selectionCount: 1 }, { room: 'stinger', activeTool: 'CUT', busy: true }]);
    expect(merged.situation).toMatchObject({ selectedKind: 'AUDIO', selectionCount: 1, activeTool: 'CUT', busy: true });
  });
  it('uses the Files overlay while it is open then restores the underlying room', () => {
    const base = { ...context('blast'), focus: 'blast.text' as const };
    const editor = { room: 'blast' as const, selectedKind: 'TEXT' };
    const overlay = { room: 'files' as const, scope: 'overlay' as const, activeTool: 'story-drive', error: true };
    const opened = mergeReilySituation(base, [editor, overlay]);
    expect(opened.room).toBe('files'); expect(opened.focus).toBeUndefined();
    expect(recommendReilyHelp(opened)[0]?.id).toBe('handoff.save-error');
    expect(mergeReilySituation(base, [editor])).toMatchObject({ room: 'blast', focus: 'blast.text', situation: { selectedKind: 'TEXT' } });
  });
});

it('cannot erase an active blocker or readonly permission by republishing idle group facts', () => {
  const busy = { room: 'desk' as const, busy: true, error: true, canEdit: false };
  const idle = { room: 'desk' as const, busy: false, error: false, canEdit: true };
  for (const sources of [[busy, idle], [idle, busy]]) expect(mergeReilySituation(context('desk'), sources).situation).toMatchObject({ busy: true, error: true, canEdit: false });
  expect(mergeReilySituation(context('desk'), [idle]).situation).toMatchObject({ busy: false, error: false, canEdit: true });
});

it('prioritizes changing words over adding a new box when typing is blocked', () => {
  expect(searchReilyHelp('why wont it let me type', context('blast'))[0]?.id).toBe('blast.text');
});
