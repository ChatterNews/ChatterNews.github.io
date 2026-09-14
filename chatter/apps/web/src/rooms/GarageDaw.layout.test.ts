import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./GarageDaw.css', import.meta.url), 'utf8');

describe('Studio arrangement layout', () => {
  it('lets the track stack grow vertically while keeping horizontal timeline scrolling', () => {
    const arrangementRule = css.match(/\.arrangement-scroll\{([^}]*)\}/)?.[1] ?? '';

    expect(arrangementRule).toContain('overflow-x:auto');
    expect(arrangementRule).toContain('overflow-y:visible');
    expect(arrangementRule).not.toContain('max-height');
  });

  it('uses wrapping transport rows instead of a horizontal control-bar scrollbar', () => {
    const transportRule = css.match(/\.daw-transport\{([^}]*)\}/)?.[1] ?? '';
    const rowRule = css.match(/\.daw-transport-row\{([^}]*)\}/)?.[1] ?? '';

    expect(transportRule).toContain('flex-direction:column');
    expect(transportRule).not.toContain('overflow-x:auto');
    expect(rowRule).toContain('flex-wrap:wrap');
  });
});
