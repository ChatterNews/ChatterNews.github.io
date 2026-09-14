import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('browser security policy', () => {
  test('ships a restrictive baseline without blocking local media work', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("frame-src 'self' blob:");
    expect(policy).toContain("media-src 'self' data: blob:");
  });
});
