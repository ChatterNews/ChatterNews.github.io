import { describe, expect, test } from 'vitest';
import { createStoryCode, groupIdentity, normalizeStoryCode, validateGroupRevision } from './group-story.js';
import type { GroupRevision } from './types.js';

describe('offline story codes', () => {
  test('retains the version-one wire identity for a known valid code', () => {
    expect(groupIdentity('0000-0000-0101')).toBe('orbit-group:v1:000000000101');
  });
  test('normalizes presentation without changing the permanent group identity', () => {
    const code = createStoryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
    expect(normalizeStoryCode(` \n${code.toLowerCase().replaceAll('-', ' ')}\t`)).toBe(code);
    expect(groupIdentity(code.toLowerCase().replaceAll('-', ' '))).toBe(groupIdentity(code));
    expect(groupIdentity(code)).toMatch(/^orbit-group:v1:/);
  });
  test('rejects every single-symbol substitution, ambiguous letters and malformed input', () => {
    const compact = createStoryCode().replaceAll('-', '');
    for (let i = 0; i < compact.length; i++) {
      for (const symbol of '0123456789ABCDEFGHJKMNPQRSTVWXYZ') {
        if (symbol !== compact[i]) expect(() => normalizeStoryCode(compact.slice(0, i) + symbol + compact.slice(i + 1))).toThrow(/code/i);
      }
    }
    for (const input of ['', 'O000-0000-0000', 'I000-0000-0000', 'L000-0000-0000', 'U000-0000-0000', '0000_0000_0000', '0'.repeat(129)]) {
      expect(() => normalizeStoryCode(input)).toThrow();
    }
  });
});

describe('received group revision validation', () => {
  const valid = (): GroupRevision => ({
    id: 'revision', createdAt: 1, updatedAt: 1, groupCode: createStoryCode(),
    contributionId: 'piece', kind: 'piece', authorId: 'child', authorName: 'Maya',
    title: 'My perspective', storyTitle: 'Lunch', snapshotHash: `sha256:${'a'.repeat(64)}`,
    contentHash: `sha256:${'b'.repeat(64)}`, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
  });
  test('accepts a bounded document and rejects malformed metadata before receiving work', () => {
    expect(() => validateGroupRevision(valid())).not.toThrow();
    const invalid: Record<string, unknown>[] = [
      { groupCode: 'bad-code' }, { snapshotHash: 'sha256:bad' }, { contentHash: 'http://example.com' },
      { kind: 'joined' }, { authorName: '' }, { authorId: 'a'.repeat(257) }, { title: 'a'.repeat(513) },
      { createdAt: Infinity }, { updatedAt: -1 }, { body: { type: 'paragraph' } },
      { body: { type: 'doc', content: [null] } }, { body: { type: 'doc', content: 'text' } },
      { body: { type: 'doc', attrs: { callback: () => {} } } }, { role: 'ADVISER' },
    ];
    for (const patch of invalid) expect(() => validateGroupRevision({ ...valid(), ...patch } as GroupRevision)).toThrow();
    const cyclic = valid(); cyclic.body.content = [cyclic.body];
    expect(() => validateGroupRevision(cyclic)).toThrow();
  });
});
