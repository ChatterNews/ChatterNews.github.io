import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const blastSource = readFileSync(new URL('./BlastStart.tsx', import.meta.url), 'utf8');
const stingerSource = readFileSync(new URL('./Stinger.tsx', import.meta.url), 'utf8');
const tactileCss = readFileSync(new URL('../styles/TactilePass.css', import.meta.url), 'utf8');

// Keep the readability contract when the interface palette changes.
function contrastOnPaper(rule: string): number {
  const hex = rule.match(/(?:^|[;\s])color:\s*#([\da-f]{6})\b/i)?.[1];
  if (!hex) throw new Error('Expected an explicit six-digit label color');
  const luminance = (value: string) => {
    const channels = value.match(/../g)!.map(channel => {
      const s = parseInt(channel, 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  return (luminance('fffbf0') + 0.05) / (luminance(hex) + 0.05);
}

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
    expect(contrastOnPaper(railRule)).toBeGreaterThanOrEqual(7);
    expect(railRule).toContain('font-weight:900');
  });

  test('the Published Archive subtitle stays dark on its light tactile header', () => {
    const subtitleRule = tactileCss.match(/\.reruns-room \.reruns-hero p\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(contrastOnPaper(subtitleRule)).toBeGreaterThanOrEqual(7);
  });
});
