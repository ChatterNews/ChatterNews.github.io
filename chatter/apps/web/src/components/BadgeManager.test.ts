import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { User } from '@chatter/shared';
import { BadgeManager } from './BadgeManager.js';

const adviser = {
  id: 'adviser-1', name: 'Ms. Rivera', penName: 'Ms. Rivera', role: 'ADVISER', active: true,
} as User;
const student = {
  id: 'student-1', name: 'Maya R.', penName: 'Maya R.', role: 'STUDENT', active: true,
} as User;

describe('badge management', () => {
  test('an adviser sees staff and student badges with a remove action for each', () => {
    const html = renderToStaticMarkup(createElement(BadgeManager, {
      advisers: [adviser],
      students: [student],
      currentAdviserId: adviser.id,
      onClose() {},
      onRemove: async () => true,
    }));

    expect(html).toContain('Adviser badges');
    expect(html).toContain('Student badges');
    expect(html).toContain('Ms. Rivera');
    expect(html).toContain('Maya R.');
    expect(html.match(/Remove badge/g)).toHaveLength(2);
    expect(html).toContain('<div class="badge-manager-racks" aria-label="Badge racks">');
  });
});
