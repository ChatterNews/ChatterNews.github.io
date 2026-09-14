import { describe, expect, test } from 'vitest';
import { countWords, prosePlainText, type ProseNode } from '@chatter/shared';
import {
  DESK_SHAPES,
  deskDelivery,
  deskOutline,
  deskRecommendedShape,
  deskShapeFromDocument,
  deskShapeTemplate,
  deskStoryCheck,
  deskTargetSeconds,
} from './desk-model.js';
import type { Story } from '@chatter/shared';

const story = (channels: string[], storyType?: string, creationRecipeId?: Story['creationRecipeId']): Story => ({ id: 's', createdAt: 1, updatedAt: 1, slug: 'S', title: 'School garden opens', channels, status: 'WORK', body: { type: 'doc', content: [] }, readTimeSec: 0, bylineIds: [], ...(creationRecipeId ? { creationRecipeId } : {}), ...(storyType ? { brief: { angle: '', storyType, audience: 'Our school community', priority: 'NORMAL', questions: [], sources: [], checklist: [], productionNotes: '' } } : {}) });

describe('Desk workflow', () => {
  test('each recipe leaves Desk for the room that actually follows it', () => {
    expect(deskDelivery(story(['pod'], undefined, 'podcast')).next).toBe('BOOTH');
    expect(deskDelivery(story(['web'], undefined, 'article')).next).toBe('REVIEW');
    expect(deskDelivery(story(['video'], undefined, 'video')).next).toBe('SHOWTIME');
    expect(deskDelivery(story(['segment'], undefined, 'show')).next).toBe('SHOWTIME');
  });
  test('five story routes create empty publishing-safe writing beats', () => {
    expect(DESK_SHAPES.map((item) => item.id)).toEqual(['UPDATE', 'PROFILE', 'EVENT', 'EXPLAINER', 'INVESTIGATION']);
    expect(new Set(DESK_SHAPES.map((item) => item.example.headline)).size).toBe(5);
    for (const shape of DESK_SHAPES) {
      const document = deskShapeTemplate(shape.id);
      expect(document.content?.map((node) => node.type === 'blockquote' ? node.content?.[0]?.attrs?.deskBeat : node.attrs?.deskBeat)).toEqual(['LEAD', 'EVIDENCE', 'QUOTE', 'CONTEXT', 'CLOSE']);
      expect(document.content?.[2]?.type).toBe('blockquote');
      expect(countWords(document)).toBe(0);
      expect(prosePlainText(document)).toBe('');
      expect(deskShapeFromDocument(document)).toBe(shape.id);
    }
  });

  test('Slate story types recommend the matching route without applying it', () => {
    expect(deskRecommendedShape(story(['web'], 'event'))).toBe('EVENT');
    expect(deskRecommendedShape(story(['web'], 'feature'))).toBe('PROFILE');
    expect(deskRecommendedShape(story(['web'], 'investigation'))).toBe('INVESTIGATION');
  });

  test('Story Check reads the real draft and does not count empty prompts as copy', () => {
    const body: ProseNode = deskShapeTemplate('UPDATE');
    body.content![0]!.content = [{ type: 'text', text: 'The garden opened Friday after a month of student work.' }];
    body.content![1]!.content = [{ type: 'text', text: 'The club planted 48 seedlings in six raised beds.' }];
    body.content![2] = { type: 'blockquote', attrs: { deskBeat: 'QUOTE', deskShape: 'UPDATE' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We wanted a place everyone could help care for.' }] }] };

    const checks = deskStoryCheck(story(['web']), body);

    expect(checks.map((check) => [check.id, check.complete])).toEqual([
      ['HEADLINE', true],
      ['LEAD', true],
      ['EVIDENCE', true],
      ['QUOTE', true],
      ['CONTEXT', false],
      ['CLOSE', false],
    ]);
  });

  test('a hand-built draft can still earn lead and quote checks before choosing a route', () => {
    const body: ProseNode = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'The school garden opened Friday.' }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We grew it together.' }] }] },
    ] };
    const checks = deskStoryCheck(story(['web']), body);
    expect(checks.find((check) => check.id === 'LEAD')?.complete).toBe(true);
    expect(checks.find((check) => check.id === 'QUOTE')?.complete).toBe(true);
    expect(deskOutline(body)).toEqual([]);
  });
  test('social writing has a shorter target than a full spoken package', () => {
    expect(deskTargetSeconds(story(['social'])).max).toBeLessThan(deskTargetSeconds(story(['video'])).max);
  });
});
