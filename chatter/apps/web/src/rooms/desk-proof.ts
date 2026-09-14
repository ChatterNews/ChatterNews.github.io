import { type ProseNode, type StorySource } from '@chatter/shared';

export function sourceQuoteContent(source: StorySource): ProseNode[] {
  const quote = source.quotes.trim();
  return [
    { type: 'blockquote', attrs: { proofSourceId: source.id }, content: [{ type: 'paragraph', content: [{ type: 'text', text: quote }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: `— ${source.name || 'Source'}` }] },
  ];
}
