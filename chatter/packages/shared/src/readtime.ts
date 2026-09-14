/** Words a middle-schooler reads aloud in a minute. SPEC S3. */
export const WORDS_PER_MINUTE = 150;

export interface ProseNode {
  type: string;
  text?: string;
  content?: ProseNode[];
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

/** Words in a TipTap/ProseMirror document. */
export function countWords(doc: ProseNode): number {
  let words = 0;
  const walk = (node: ProseNode): void => {
    if (typeof node.text === 'string') {
      const trimmed = node.text.trim();
      if (trimmed) words += trimmed.split(/\s+/).length;
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return words;
}

/** Seconds it takes to read `words` aloud. SPEC S3: words / 150 * 60. */
export function readTimeSec(words: number): number {
  return Math.round((words / WORDS_PER_MINUTE) * 60);
}

/** Plain reading copy for exports, previews, and accessible fallbacks. */
export function prosePlainText(doc: ProseNode): string {
  const blocks: string[] = [];
  const text = (node: ProseNode): string => node.type === 'hardBreak' ? '\n' : typeof node.text === 'string' ? node.text : (node.content ?? []).map(text).join('');
  const visit = (node: ProseNode) => {
    if (['paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock'].includes(node.type)) { const value = text(node).trim(); if (value) blocks.push(value); return; }
    node.content?.forEach(visit);
  };
  visit(doc);
  return blocks.join('\n\n');
}
