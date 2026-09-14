import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('Chatterbox fidelity workflow', () => {
  test('closes the format shelf after starting an episode and keeps the craft purpose visible', () => {
    const source = readFileSync(new URL('./Chatterbox.tsx', import.meta.url), 'utf8');
    expect(source).toContain("newEpisodeMenu.current?.removeAttribute('open')");
    expect(source).toContain('chatterbox-segment-purpose');
  });
});
