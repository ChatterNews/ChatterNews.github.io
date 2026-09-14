import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('Blast podcast cover return', () => {
  test('opens the requested cover project and exports it back to Chatterbox', () => {
    const source = readFileSync(new URL('./Blast.tsx', import.meta.url), 'utf8');
    expect(source).toContain("searchParams.get('project')");
    expect(source).toContain("searchParams.get('podcastCover')");
    expect(source).toContain('Use as episode cover');
    expect(source).toContain("artworkMode: 'EPISODE'");
    expect(source).toContain("navigate('/chatterbox')");
  });
});
