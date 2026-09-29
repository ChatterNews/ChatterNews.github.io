import { describe, expect, it } from 'vitest';
import { REILY_MEDIA_HELP } from './reily-help-media.js';
import type { ReilyHelpContext } from './reily-help-types.js';

const recommends = (id: string, context: ReilyHelpContext) => REILY_MEDIA_HELP.find(topic => topic.id === `media.${id}`)!.when?.(context) ?? false;

describe('practical media help', () => {
  it('covers the five current media rooms with concise ordered procedures', () => {
    expect(new Set(REILY_MEDIA_HELP.map(topic => topic.room))).toEqual(new Set(['booth', 'chatterbox', 'foley', 'stinger', 'showtime']));
    expect(REILY_MEDIA_HELP.length).toBeGreaterThanOrEqual(40);
    expect(new Set(REILY_MEDIA_HELP.map(topic => topic.id)).size).toBe(REILY_MEDIA_HELP.length);
    for (const topic of REILY_MEDIA_HELP) {
      expect(topic.steps.length).toBeGreaterThanOrEqual(2);
      expect(topic.steps.length).toBeLessThanOrEqual(4);
    }
  });
  it('does not recommend a video edit procedure inside the graphic designer', () => {
    const context: ReilyHelpContext = { room: 'stinger', role: 'STUDENT', situation: { room: 'stinger', activeTool: 'graphics:TEXT', projectSelected: true, hasContent: false } };
    expect(recommends('video-start', context)).toBe(false);
    expect(recommends('video-trim', context)).toBe(false);
    context.situation!.activeTool = 'CUT';
    context.situation!.selectedKind = 'VIDEO';
    expect(recommends('video-start', context)).toBe(true);
    expect(recommends('video-trim', context)).toBe(true);
  });
  it('adapts the video inspector advice to the selected kind', () => {
    const context: ReilyHelpContext = { room: 'stinger', role: 'STUDENT', situation: { room: 'stinger', activeTool: 'CUT', hasContent: true, selectionCount: 0 } };
    expect(recommends('video-select', context)).toBe(true);
    context.situation!.selectionCount = 1;
    context.situation!.selectedKind = 'AUDIO';
    expect(recommends('video-sound', context)).toBe(true);
    expect(recommends('video-framing', context)).toBe(false);
    context.situation!.selectedKind = 'VIDEO';
    expect(recommends('video-framing', context)).toBe(true);
    context.situation!.selectedKind = 'CREDITS';
    expect(recommends('video-credits', context)).toBe(true);
    expect(recommends('video-trim', context)).toBe(false);
    context.situation!.selectedKind = 'GRAPHIC';
    expect(recommends('video-text', context)).toBe(true);
    expect(recommends('video-credits', context)).toBe(false);
  });
  it('separates a microphone failure from a captured recording needing recovery', () => {
    const context: ReilyHelpContext = { room: 'booth', role: 'STUDENT', recovery: { kind: 'booth.microphone', workChanged: false } };
    expect(recommends('booth-mic', context)).toBe(true);
    expect(recommends('booth-recover', context)).toBe(false);
    context.recovery = undefined;
    context.situation = { room: 'booth', activeTool: 'RECOVER' };
    expect(recommends('booth-mic', context)).toBe(false);
    expect(recommends('booth-recover', context)).toBe(true);
  });
  it('offers clip-selection help only in Cut with no selected clip', () => {
    const context: ReilyHelpContext = { room: 'chatterbox', role: 'STUDENT', situation: { room: 'chatterbox', activeTool: 'CUT', selectionCount: 0 } };
    expect(recommends('podcast-select', context)).toBe(true);
    context.situation!.selectionCount = 1;
    expect(recommends('podcast-select', context)).toBe(false);
    context.situation!.activeTool = 'PACKAGE';
    context.situation!.selectionCount = 0;
    expect(recommends('podcast-select', context)).toBe(false);
  });
  it('prioritizes the right Foley tool and recovery state', () => {
    const context: ReilyHelpContext = { room: 'foley', role: 'STUDENT', situation: { room: 'foley', activeTool: 'FINISH' } };
    expect(recommends('foley-send', context)).toBe(true);
    expect(recommends('foley-recover', context)).toBe(false);
    context.situation!.activeTool = 'RECOVER';
    expect(recommends('foley-send', context)).toBe(false);
    expect(recommends('foley-recover', context)).toBe(true);
  });
  it('all recommendation predicates tolerate an unopened project', () => {
    for (const topic of REILY_MEDIA_HELP) expect(() => topic.when?.({ room: topic.room === 'any' ? 'home' : topic.room, role: 'STUDENT' })).not.toThrow();
  });
});
