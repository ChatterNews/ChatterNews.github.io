// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ignoreMediaShortcut } from './media-shortcuts.js';

function shortcut(target: Element, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true, ...init });
  let ignored = false;
  target.addEventListener('keydown', e => { ignored = ignoreMediaShortcut(e as KeyboardEvent); }, { once: true });
  target.dispatchEvent(event);
  return ignored;
}
describe('media editing keyboard ownership', () => {
  it.each(['button', 'summary', 'input', 'textarea', 'a'])('does not steal Space or edit keys from %s', tag => {
    expect(shortcut(document.createElement(tag))).toBe(true);
    expect(shortcut(document.createElement(tag), { key: 'Delete' })).toBe(true);
  });
  it('protects nested editable text and all Reily help descendants', () => {
    const editor = document.createElement('div'); editor.contentEditable = 'true'; editor.setAttribute('contenteditable', 'true');
    editor.innerHTML = '<span>Words</span>';
    expect(shortcut(editor.firstElementChild!, { key: 's' })).toBe(true);
    const help = document.createElement('aside'); help.setAttribute('data-reily-local-help', ''); help.innerHTML = '<div tabindex="0">Steps</div>';
    expect(shortcut(help.firstElementChild!, { key: 'Backspace' })).toBe(true);
  });
  it('keeps unmodified canvas shortcuts available and respects already-handled events', () => {
    const canvas = document.createElement('canvas');
    expect(shortcut(canvas, { key: 's' })).toBe(false);
    expect(shortcut(canvas, { key: 's', repeat: true })).toBe(true);
    canvas.addEventListener('keydown', e => e.preventDefault(), { once: true });
    expect(shortcut(canvas, { key: 'Escape' })).toBe(true);
  });
});
