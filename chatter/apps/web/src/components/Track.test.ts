import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, test } from 'vitest';
import type { Story } from '@chatter/shared';
import { Track } from './Track.js';

const story = (recipe: Story['creationRecipeId']): Story => ({
  id: `story-${recipe}`, createdAt: 1, updatedAt: 1, slug: `story-${recipe}`,
  title: `${recipe} story`, channels: recipe === 'podcast' ? ['pod'] : ['social'],
  creationRecipeId: recipe, status: 'WORK', body: { type: 'doc', content: [] },
  readTimeSec: 0, bylineIds: [],
});

function markup(value: Story) {
  return renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(Track, { story: value })));
}

test('the persistent track follows the thing the crew chose to create', () => {
  const podcast = markup(story('podcast'));
  expect(podcast).toContain('Podcast episode');
  expect(podcast).toContain('Record');
  expect(podcast).toContain('Edit');
  expect(podcast).toContain('Open Booth');

  const poster = markup(story('poster'));
  expect(poster).toContain('Poster or social post');
  expect(poster).toContain('Design');
  expect(poster).not.toContain('Record');
  expect(poster).toContain('Open Blast');
});

test('a held story keeps the adviser decision visible inside its recipe', () => {
  const held = { ...story('poster'), status: 'HELD' as const };
  expect(markup(held)).toContain('Waiting on an adviser decision');
  expect(markup(held)).toContain('See what is held');
});

test.each([
  ['report', 'Open project notes'],
  ['export', 'Open Media Bin'],
] as const)('shows the explicitly saved %s bead as the current step', (workflowStepId, action) => {
  const html = markup({ ...story('poster'), workflowStepId });
  expect(html).toContain(`data-current-step="${workflowStepId}"`);
  expect(html).toContain(action);
});
