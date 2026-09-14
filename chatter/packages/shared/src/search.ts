/**
 * Reruns. SPEC S6: full-text search across Story.body AND Transcript.text.
 *
 * The second half is the point. A kid remembers that somebody said a thing;
 * they do not remember which week it aired or who wrote the script.
 */
import type { Store } from './store.js';
import type { Story, Take, Transcript, ProseNode } from './types.js';

export type MatchedIn = 'the title' | 'what you wrote' | 'what somebody said';

export interface Hit {
  storyId: string;
  title: string;
  where: MatchedIn;
  /** The words either side of the match, so a kid sees why it matched. */
  snippet: string;
}

/** All the text in a TipTap document, flattened. */
export function plainText(node: ProseNode): string {
  const parts: string[] = [];
  const walk = (n: ProseNode) => {
    if (n.text) parts.push(n.text);
    n.content?.forEach(walk);
  };
  walk(node);
  return parts.join(' ');
}

function snippetAround(text: string, needle: string, width = 60): string {
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return text.slice(0, width);
  const from = Math.max(0, at - width / 2);
  const to = Math.min(text.length, at + needle.length + width / 2);
  return (from > 0 ? '…' : '') + text.slice(from, to).trim() + (to < text.length ? '…' : '');
}

/**
 * Search stories and the tape. One hit per story: matching in three places is
 * not three results, it is one story that is clearly the right one.
 */
export async function searchEverything(store: Store, query: string): Promise<Hit[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const [stories, takes, transcripts] = await Promise.all([
    store.stories.list() as Promise<Story[]>,
    store.takes.list() as Promise<Take[]>,
    store.transcripts.list() as Promise<Transcript[]>,
  ]);

  const hits = new Map<string, Hit>();

  for (const story of stories) {
    if (story.title.toLowerCase().includes(needle)) {
      hits.set(story.id, {
        storyId: story.id, title: story.title,
        where: 'the title', snippet: story.title,
      });
      continue;
    }

    const written = plainText(story.body);
    if (written.toLowerCase().includes(needle)) {
      hits.set(story.id, {
        storyId: story.id, title: story.title,
        where: 'what you wrote', snippet: snippetAround(written, needle),
      });
    }
  }

  for (const transcript of transcripts) {
    if (!transcript.text.toLowerCase().includes(needle)) continue;

    const take = takes.find((t) => t.assetId === transcript.assetId);
    if (!take || hits.has(take.storyId)) continue;

    const story = stories.find((s) => s.id === take.storyId);
    if (!story) continue;

    hits.set(story.id, {
      storyId: story.id, title: story.title,
      where: 'what somebody said', snippet: snippetAround(transcript.text, needle),
    });
  }

  return [...hits.values()];
}
