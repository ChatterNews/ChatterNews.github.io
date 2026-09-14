import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { BlastHistoryControls } from './BlastHistoryControls.js';

describe('Blast history controls', () => {
  test('Undo and Redo stay labeled and communicate when each action is unavailable', () => {
    const html = renderToStaticMarkup(createElement(BlastHistoryControls, {
      canUndo: true,
      canRedo: false,
      onUndo() {},
      onRedo() {},
    }));

    expect(html).toContain('Undo');
    expect(html).toContain('Redo');
    expect(html).toContain('aria-label="Undo');
    expect(html).toContain('aria-label="Redo');
    expect(html).toContain('disabled');
  });
});
