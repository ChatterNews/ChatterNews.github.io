import { describe, expect, it } from 'vitest';
import { MemoryStore } from './store-memory.js';
import type { PublishedStorySnapshot } from './types.js';
import {
  editionReflectionKey,
  followUpStoryDraft,
  reflectionProgress,
  saveEditionReflection,
} from './reruns.js';

const snapshot: PublishedStorySnapshot = {
  storyId: 'solar-race',
  title: 'Solar race',
  slug: 'solar-race',
  channels: ['web', 'social'],
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The fourth car completed six laps.' }] }] },
  readTimeSec: 18,
  bylines: ['Aisha M.'],
  angle: 'The rebuilt solar cars completed more laps than last year.',
};

describe('Reruns edition reflections', () => {
  it('stores a crew reflection beside the frozen edition without changing its snapshot', async () => {
    const store = new MemoryStore('reruns-reflection'); await store.open();
    const episode = await store.episodes.create({ title: snapshot.title, publishedAt: 10, channel: 'web', storyIds: [snapshot.storyId], stories: [structuredClone(snapshot)] });
    const reflection = {
      worked: 'The lap-count graphic made the result easy to see.',
      audience: 'Families asked how the cars were charged.',
      change: 'Show the charging setup in the next report.',
    };

    const updated = await saveEditionReflection(store, episode.id, editionReflectionKey({ storyId: snapshot.storyId }), reflection, 'aisha');

    expect(updated.reflections?.['story:solar-race']).toMatchObject({ ...reflection, authorId: 'aisha' });
    expect(updated.reflections?.['story:solar-race']?.updatedAt).toBeGreaterThan(0);
    expect(updated.stories).toEqual([snapshot]);
    expect(reflectionProgress(reflection)).toBe(3);
  });

  it('uses distinct keys for a story and a podcast package', () => {
    expect(editionReflectionKey({ storyId: 'solar-race' })).toBe('story:solar-race');
    expect(editionReflectionKey({ podcastProjectId: 'episode-seven' })).toBe('podcast:episode-seven');
  });

  it('turns the crew’s next-time note into context for a linked Slate pitch', () => {
    const draft = followUpStoryDraft(snapshot, {
      worked: 'The lap graphic was clear.',
      audience: 'Students wanted to know who built each car.',
      change: 'Put student builders at the center of the next report.',
    }, 'aisha');

    expect(draft).toMatchObject({
      title: 'Follow-up: Solar race',
      channels: ['web', 'social'],
      status: 'PITCH',
      ownerId: 'aisha',
      bylineIds: ['aisha'],
      followUpOfId: 'solar-race',
      brief: {
        storyType: 'news',
        angle: '',
        angleCheck: { affected: '', verification: '' },
      },
    });
    expect(draft.brief.productionNotes).toContain('Continues the published edition “Solar race”.');
    expect(draft.brief.productionNotes).toContain('Crew replay note: Put student builders at the center of the next report.');
    expect(draft.brief.questions.map((item) => item.text)).toEqual([
      'What has changed since the first edition?',
      'Who is affected now?',
      'What can we check this time?',
    ]);
  });
});
