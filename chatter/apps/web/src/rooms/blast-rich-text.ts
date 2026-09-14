const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'SPAN', 'DIV']);
const DROP_CONTENTS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET',
  'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'LINK', 'META', 'BASE', 'HEAD', 'TITLE',
  'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION', 'CANVAS',
]);
const MAX_DEPTH = 64;

/**
 * Rebuild Blast rich text from a small allowlist. Rebuilding is important:
 * mutating and unwrapping a live parsed tree can skip newly hoisted children.
 */
export function sanitizedRichText(value: string): string {
  const source = document.createElement('template');
  source.innerHTML = value;
  const clean = document.createElement('template');

  const rebuild = (from: Node, into: Node, depth: number): void => {
    for (const child of [...from.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        into.appendChild(document.createTextNode(child.textContent ?? ''));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const element = child as HTMLElement;
      const tag = element.tagName.toUpperCase();
      if (DROP_CONTENTS.has(tag)) continue;
      if (depth >= MAX_DEPTH) {
        into.appendChild(document.createTextNode(element.textContent ?? ''));
        continue;
      }
      if (!ALLOWED.has(tag)) {
        rebuild(element, into, depth + 1);
        continue;
      }

      const kept = document.createElement(tag.toLowerCase());
      if (element.style.color) kept.style.color = element.style.color;
      if (element.style.backgroundColor) kept.style.backgroundColor = element.style.backgroundColor;
      into.appendChild(kept);
      rebuild(element, kept, depth + 1);
    }
  };

  rebuild(source.content, clean.content, 0);
  return clean.innerHTML;
}
