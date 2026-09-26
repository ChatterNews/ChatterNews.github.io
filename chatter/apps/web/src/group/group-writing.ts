import type { ProseNode } from '@chatter/shared';

/** Copy writing structure without importing a source's media URLs or local IDs. */
export function groupWritingContent(node: ProseNode): ProseNode[] {
  if (node.type === 'text') return node.text ? [{ type: 'text', text: node.text, ...(node.marks ? { marks: node.marks.filter(mark => ['bold', 'italic', 'strike', 'code'].includes(mark.type)).map(mark => ({ type: mark.type })) } : {}) }] : [];
  if (node.type === 'image') return [];
  const content = (node.content ?? []).flatMap(groupWritingContent);
  if (node.type === 'doc') return content;
  if (!['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'hardBreak', 'horizontalRule'].includes(node.type)) return content;
  return [{ type: node.type, ...(content.length ? { content } : {}), ...(node.type === 'heading' ? { attrs: { level: Math.min(6, Math.max(1, Number(node.attrs?.level) || 2)) } } : {}) }];
}
