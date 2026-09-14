import type { Episode, ProseNode, Story, User } from '@chatter/shared';

export type BlastStoryPieceKind = 'HEADLINE' | 'ANGLE' | 'BYLINE' | 'FULL_STORY' | 'PARAGRAPH' | 'QUOTE' | 'DETAIL';

export interface BlastStoryPiece {
  id: string;
  kind: BlastStoryPieceKind;
  label: string;
  text: string;
}

export interface BlastStorySource {
  id: string;
  storyId: string;
  title: string;
  state: 'IN_PROGRESS' | 'PUBLISHED';
  date: number;
  channel: string;
  pieces: BlastStoryPiece[];
  searchText: string;
}

function nodeText(node: ProseNode): string {
  if (node.type === 'hardBreak') return '\n';
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map(nodeText).join('');
}

export function proseBlocks(doc: ProseNode): string[] {
  const blocks: string[] = [];
  const visit = (node: ProseNode) => {
    if (['paragraph', 'heading', 'blockquote', 'codeBlock'].includes(node.type)) {
      const text = nodeText(node).trim();
      if (text) blocks.push(text);
      return;
    }
    if (node.type === 'listItem') {
      const text = nodeText(node).trim();
      if (text) blocks.push(text);
      return;
    }
    node.content?.forEach(visit);
  };
  visit(doc);
  return blocks;
}

function bylinesFor(story: Story, users: Map<string, string>): string[] {
  return story.bylineIds.map((id) => users.get(id) ?? id).filter(Boolean);
}

function piecesForStory(story: Story, users: Map<string, string>): BlastStoryPiece[] {
  const blocks = proseBlocks(story.body);
  const bylines = bylinesFor(story, users);
  const pieces: BlastStoryPiece[] = [
    { id: `${story.id}:headline`, kind: 'HEADLINE', label: 'Headline', text: story.title },
  ];
  if (bylines.length) pieces.push({ id: `${story.id}:byline`, kind: 'BYLINE', label: 'Byline', text: `By ${bylines.join(', ')}` });
  if (story.brief?.angle.trim()) pieces.push({ id: `${story.id}:angle`, kind: 'ANGLE', label: 'Angle / deck', text: story.brief.angle.trim() });
  if (blocks.length) {
    const full = [story.title, bylines.length ? `By ${bylines.join(', ')}` : '', story.brief?.angle.trim() ?? '', blocks.join('\n\n')].filter(Boolean).join('\n\n');
    pieces.push({ id: `${story.id}:full`, kind: 'FULL_STORY', label: 'Complete story copy', text: full });
    blocks.forEach((text, index) => pieces.push({ id: `${story.id}:paragraph:${index}`, kind: 'PARAGRAPH', label: `Story block ${index + 1}`, text }));
  }
  story.brief?.sources.forEach((source, sourceIndex) => {
    if (source.quotes.trim()) {
      const credit = [source.name, source.role].filter(Boolean).join(', ');
      pieces.push({
        id: `${story.id}:quote:${source.id || sourceIndex}`,
        kind: 'QUOTE',
        label: `Quote${source.name ? ` · ${source.name}` : ''}`,
        text: `“${source.quotes.trim().replace(/^[“"]|[”"]$/g, '')}”${credit ? `\n— ${credit}` : ''}`,
      });
    }
    if (source.notes.trim()) {
      const sourceLabel = [source.name, source.role].filter(Boolean).join(', ');
      pieces.push({
        id: `${story.id}:detail:${source.id || sourceIndex}`,
        kind: 'DETAIL',
        label: `Reporting detail${source.name ? ` · ${source.name}` : ''}`,
        text: `${sourceLabel ? `${sourceLabel}: ` : ''}${source.notes.trim()}`,
      });
    }
  });
  return pieces;
}

function piecesForPublished(id: string, title: string, body: ProseNode, bylines: string[], angle?: string): BlastStoryPiece[] {
  const blocks = proseBlocks(body);
  const pieces: BlastStoryPiece[] = [{ id: `${id}:headline`, kind: 'HEADLINE', label: 'Headline', text: title }];
  if (bylines.length) pieces.push({ id: `${id}:byline`, kind: 'BYLINE', label: 'Byline', text: `By ${bylines.join(', ')}` });
  if (angle?.trim()) pieces.push({ id: `${id}:angle`, kind: 'ANGLE', label: 'Angle / deck', text: angle.trim() });
  if (blocks.length) {
    pieces.push({ id: `${id}:full`, kind: 'FULL_STORY', label: 'Complete story copy', text: [title, bylines.length ? `By ${bylines.join(', ')}` : '', angle?.trim() ?? '', blocks.join('\n\n')].filter(Boolean).join('\n\n') });
    blocks.forEach((text, index) => pieces.push({ id: `${id}:paragraph:${index}`, kind: 'PARAGRAPH', label: `Story block ${index + 1}`, text }));
  }
  return pieces;
}

export function blastStorySources(stories: Story[], episodes: Episode[], users: User[]): BlastStorySource[] {
  const userNames = new Map(users.map((user) => [user.id, user.penName]));
  const publishedStoryIds = new Set<string>();
  const published = episodes.flatMap((episode) => (episode.stories ?? []).map((snapshot) => {
    publishedStoryIds.add(snapshot.storyId);
    const id = `published:${episode.id}:${snapshot.storyId}`;
    const pieces = piecesForPublished(id, snapshot.title, snapshot.body, snapshot.bylines, snapshot.angle);
    return {
      id,
      storyId: snapshot.storyId,
      title: snapshot.title,
      state: 'PUBLISHED' as const,
      date: episode.publishedAt,
      channel: episode.channel,
      pieces,
      searchText: [snapshot.title, snapshot.angle, snapshot.bylines.join(' '), ...pieces.map((piece) => piece.text)].filter(Boolean).join(' ').toLowerCase(),
    };
  }));
  const current = stories.filter((story) => !publishedStoryIds.has(story.id)).map((story) => {
    const pieces = piecesForStory(story, userNames);
    return {
      id: `story:${story.id}`,
      storyId: story.id,
      title: story.title,
      state: story.status === 'DONE' ? 'PUBLISHED' as const : 'IN_PROGRESS' as const,
      date: story.updatedAt,
      channel: story.channels.join(' + ') || 'format open',
      pieces,
      searchText: [story.title, story.brief?.angle, ...pieces.map((piece) => piece.text)].filter(Boolean).join(' ').toLowerCase(),
    };
  });
  return [...published, ...current].sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
}
