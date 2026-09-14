import { describe, expect, it } from 'vitest';
import type { Episode, Story, User } from '@chatter/shared';
import { blastStorySources, proseBlocks } from './blast-story-text.js';

const now = 1_800_000_000_000;
const student: User = { id: 'student-1', createdAt: now, updatedAt: now, name: 'Maya Rivera', penName: 'Maya R.', role: 'STUDENT', active: true };
const story: Story = {
  id: 'story-1', createdAt: now, updatedAt: now, slug: 'garden', title: 'Garden grows after school', channels: ['web'], status: 'WORK', readTimeSec: 20, bylineIds: [student.id],
  body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A patch of green' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Students planted twelve tomato vines.' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Water on Tuesdays' }] }] }] },
  ] },
  brief: {
    angle: 'The new garden turns science lessons into after-school work.', audience: 'School', priority: 'NORMAL', questions: [], checklist: [], productionNotes: '',
    sources: [{ id: 'source-1', name: 'Ana Cho', role: 'Garden captain', reference: 'ana@example.test', notes: 'The first harvest is planned for October.', quotes: 'We wanted a place everyone could help.', state: 'CONFIRMED' }],
  },
};

describe('Blast story text library', () => {
  it('turns document blocks into reusable pieces', () => {
    expect(proseBlocks(story.body)).toEqual(['A patch of green', 'Students planted twelve tomato vines.', 'Water on Tuesdays']);
    const [source] = blastStorySources([story], [], [student]);
    expect(source?.pieces.map((piece) => piece.kind)).toEqual(['HEADLINE', 'BYLINE', 'ANGLE', 'FULL_STORY', 'PARAGRAPH', 'PARAGRAPH', 'PARAGRAPH', 'QUOTE', 'DETAIL']);
    expect(source?.pieces.find((piece) => piece.kind === 'QUOTE')?.text).toBe('“We wanted a place everyone could help.”\n— Ana Cho, Garden captain');
    expect(source?.searchText).not.toContain('ana@example.test');
  });

  it('uses the frozen published copy instead of duplicating the working row', () => {
    const episode: Episode = {
      id: 'episode-1', createdAt: now, updatedAt: now, title: 'October edition', channel: 'web', publishedAt: now + 1, storyIds: [story.id],
      stories: [{ storyId: story.id, title: 'The garden has its first harvest', slug: story.slug, channels: ['web'], body: story.body, readTimeSec: 20, bylines: ['Maya R.'], angle: 'What grew and who helped.' }],
    };
    const sources = blastStorySources([{ ...story, status: 'DONE' }], [episode], [student]);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ state: 'PUBLISHED', title: 'The garden has its first harvest', date: now + 1 });
    expect(sources[0]?.pieces.find((piece) => piece.kind === 'FULL_STORY')?.text).toContain('What grew and who helped.');
  });

  it('keeps every published edition available when a story appears more than once', () => {
    const episodes: Episode[] = [1, 2].map((edition) => ({
      id: `episode-${edition}`, createdAt: now, updatedAt: now, title: `Edition ${edition}`, channel: 'web', publishedAt: now + edition, storyIds: [story.id],
      stories: [{ storyId: story.id, title: `Garden update ${edition}`, slug: story.slug, channels: ['web'], body: story.body, readTimeSec: 20, bylines: ['Maya R.'] }],
    }));
    expect(blastStorySources([story], episodes, [student]).map((source) => source.title)).toEqual(['Garden update 2', 'Garden update 1']);
  });
});
