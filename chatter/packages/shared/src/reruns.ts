import { newId } from './ids.js';
import type { Store } from './store.js';
import type { EditionReflection, PublishedStorySnapshot, StoryBrief } from './types.js';

export type ReflectionDraft = Pick<EditionReflection, 'worked' | 'audience' | 'change'>;

export function editionReflectionKey(input: { storyId?: string; podcastProjectId?: string }): string {
  if (input.storyId?.trim()) return `story:${input.storyId.trim()}`;
  if (input.podcastProjectId?.trim()) return `podcast:${input.podcastProjectId.trim()}`;
  throw new Error('Choose a published story or podcast before adding replay notes.');
}

export function reflectionProgress(reflection: ReflectionDraft): number {
  return [reflection.worked, reflection.audience, reflection.change].filter((value) => value.trim()).length;
}

export async function saveEditionReflection(
  store: Store,
  episodeId: string,
  key: string,
  reflection: ReflectionDraft,
  authorId?: string,
) {
  const episode = await store.episodes.get(episodeId);
  if (!episode) throw new Error('That published edition is no longer in the archive.');
  const next = { ...(episode.reflections ?? {}) };
  const trimmed = {
    worked: reflection.worked.trim(),
    audience: reflection.audience.trim(),
    change: reflection.change.trim(),
  };
  if (reflectionProgress(trimmed) === 0) delete next[key];
  else next[key] = { ...trimmed, ...(authorId ? { authorId } : {}), updatedAt: Date.now() };
  return store.episodes.update(episode.id, { reflections: next });
}

export function followUpStoryDraft(snapshot: PublishedStorySnapshot, reflection?: ReflectionDraft, ownerId?: string): {
  title: string;
  channels: string[];
  status: 'PITCH';
  ownerId?: string;
  bylineIds: string[];
  followUpOfId: string;
  brief: StoryBrief;
} {
  const change = reflection?.change.trim();
  const productionNotes = [
    `Continues the published edition “${snapshot.title}”.`,
    ...(change ? [`Crew replay note: ${change}`] : []),
  ].join('\n');
  return {
    title: `Follow-up: ${snapshot.title}`,
    channels: [...snapshot.channels],
    status: 'PITCH',
    ...(ownerId ? { ownerId } : {}),
    bylineIds: ownerId ? [ownerId] : [],
    followUpOfId: snapshot.storyId,
    brief: {
      angle: '',
      storyType: 'news',
      angleCheck: { affected: '', verification: '' },
      audience: 'Our school community',
      priority: 'NORMAL',
      questions: [
        'What has changed since the first edition?',
        'Who is affected now?',
        'What can we check this time?',
      ].map((text) => ({ id: newId(), text, answered: false })),
      sources: [],
      checklist: [],
      productionNotes,
    },
  };
}
