import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const blastSource = readFileSync(new URL('./Blast.tsx', import.meta.url), 'utf8');
const stingerSource = readFileSync(new URL('./Stinger.tsx', import.meta.url), 'utf8');
const tactileCss = readFileSync(new URL('../styles/TactilePass.css', import.meta.url), 'utf8');

describe('room fidelity regressions', () => {
  test('Stinger edits the same resolved words that are visible on the canvas', () => {
    expect(stingerSource).toContain('text: resolveMotionText(selectedSource, bindings)');
    expect(stingerSource).not.toContain("stories.find((item) => item.id === (project?.storyId ?? routeStoryId)) ?? stories[0]");
  });

  test('Blast previews keep the real page ratio and every visible layer', () => {
    expect(blastSource).toContain('aspectRatio: `${recipe.width} / ${recipe.height}`');
    expect(blastSource).not.toContain('.slice(0, 14)');
  });

  test('the tactile Blast rail explicitly uses dark readable labels', () => {
    const railRule = tactileCss.match(/\.blast-rail button\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(railRule).toContain('color:#211a2a');
    expect(railRule).toContain('font-weight:900');
  });

  test('the Published Archive subtitle stays dark on its light tactile header', () => {
    const subtitleRule = tactileCss.match(/\.reruns-room \.reruns-hero p\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(subtitleRule).toContain('color:#2b2340');
  });
});
