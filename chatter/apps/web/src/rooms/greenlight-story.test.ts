import { describe, expect, test } from 'vitest';
import type { Story } from '@chatter/shared';
import { greenLightStoryPresentation } from './greenlight-story.js';

const story = (creationRecipeId: Story['creationRecipeId'], channels: string[]): Story => ({
  id: `story-${creationRecipeId}`, createdAt: 1, updatedAt: 1, slug: `story-${creationRecipeId}`,
  title: `${creationRecipeId} project`, creationRecipeId, channels, status: 'REVIEW', workflowStepId: 'check',
  body: { type: 'doc', content: [] }, readTimeSec: 0, bylineIds: [],
});

describe('Green Light medium presentation', () => {
  test('keeps written stories in the reader-and-Desk workflow', () => {
    expect(greenLightStoryPresentation(story('article', ['web']))).toMatchObject({
      previewLabel: 'READER PREVIEW', needsDeskDraft: true, productionRoom: 'Desk', genericPublishingReceipt: true,
      productionRoute: '/desk/story-article',
    });
  });

  test.each([
    ['poster', ['social'], 'Blast', '/blast?story=story-poster', true, false],
    ['podcast', ['pod'], 'Chatterbox', '/chatterbox?story=story-podcast', false, false],
    ['video', ['video'], 'Showtime', '/showtime/story-video', true, true],
    ['show', ['segment'], 'Showtime', '/showtime/story-show', true, true],
  ] as const)('reviews the actual %s medium instead of substituting a reader preview', (creationRecipeId, channels, productionRoom, productionRoute, genericPublishingReceipt, needsDeskDraft) => {
    const presentation = greenLightStoryPresentation(story(creationRecipeId, [...channels]));
    expect(presentation).toMatchObject({ needsDeskDraft, productionRoom, productionRoute, genericPublishingReceipt });
    if (!needsDeskDraft) expect(presentation.emptyMessage).not.toMatch(/write|Desk/i);
  });
});
