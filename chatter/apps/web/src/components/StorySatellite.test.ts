import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import type { Story } from '@chatter/shared';
import { StorySatellite } from './StorySatellite.js';

const posterStory: Story = {
  id: 'poster-story', createdAt: 1, updatedAt: 1, slug: 'poster-story',
  title: 'Book fair', channels: ['social'], creationRecipeId: 'poster',
  status: 'WORK', body: { type: 'doc', content: [] }, readTimeSec: 0, bylineIds: [],
};

function markup(story?: Story) {
  return renderToStaticMarkup(createElement(MemoryRouter, {},
    createElement(StorySatellite, { story, onPick: () => undefined })));
}

describe('Spiral Stage story satellite', () => {
  test('keeps the whole recipe visible with a current step and next-room action', () => {
    const html = markup(posterStory);

    expect(html).toContain('aria-label="Story route progress"');
    expect(html).toContain('Poster or social post');
    expect(html).toContain('Book fair');
    expect(html).toContain('data-recipe-progress=');
    expect(html.match(/data-guide-step=/g)).toHaveLength(6);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('aria-label="Design: current step"');
    expect(html).toContain('aria-label="Idea: complete"');
    expect(html).toContain('data-recommended-room="blast"');
    expect(html).toContain('Next room');
    expect(html).toContain('Open Blast');
  });

  test('does not hide a second copy of the progress route behind an overflow menu', () => {
    const html = markup(posterStory);

    expect(html).not.toContain('Open the full story route');
    expect(html).not.toContain('story-guide-more');
  });

  test('does not hang an empty story prompt above the room', () => {
    const html = markup();

    expect(html).toBe('');
  });

  test('keeps Export current and recommends the Media Bin after review', () => {
    const html = markup({ ...posterStory, workflowStepId: 'export', status: 'REVIEW' });
    expect(html).toContain('aria-label="Export: current step"');
    expect(html).toContain('data-recommended-room="files"');
    expect(html).toContain('Open Media Bin');
  });
});
