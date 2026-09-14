import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { StoryReleaseCard } from '@chatter/shared';
import { GreenLightReleaseCard } from './GreenLightReleaseCard.js';

const lane = (patch: Partial<StoryReleaseCard['lanes'][number]>): StoryReleaseCard['lanes'][number] => ({
  id: 'WORDS', label: 'Words', room: 'DESK', icon: 'Aa', status: 'OPEN', detail: 'Check the current draft.', route: '/desk/story-1', actionLabel: 'Open story', exceptionAllowed: true, ...patch,
});

describe('Green Light release card', () => {
  test('shows the release path, exact fixes, and no permission bypass', () => {
    const card: StoryReleaseCard = { storyId: 'story-1', ready: false, openCount: 2, lanes: [
      lane({ id: 'PERMISSIONS', label: 'Permissions', room: 'FRONT DESK', icon: '✓', detail: 'Family release is missing.', exceptionAllowed: false }),
      lane({}),
      lane({ id: 'SOUND', label: 'Sound', room: 'BOOTH / STUDIO', icon: '◖))', status: 'NOT_NEEDED', detail: 'No recorded sound in this release.' }),
    ] };
    const html = renderToStaticMarkup(createElement(GreenLightReleaseCard, { card, adviser: true, busy: false, onNavigate: () => undefined, onApproveException: () => undefined, onClearException: () => undefined }));
    expect(html).toContain('RELEASE BOARD');
    expect(html).toContain('2 stops before release');
    expect(html).toContain('Family release is missing.');
    expect(html.match(/Approve exception/g)).toHaveLength(1);
    expect(html).toContain('Not used');
  });

  test('keeps an adviser exception and its reason visible to the whole crew', () => {
    const card: StoryReleaseCard = { storyId: 'story-1', ready: true, openCount: 0, lanes: [lane({ status: 'EXCEPTION', exception: { actor: 'teacher', at: 20, reason: 'The principal confirmed the number after deadline.' } })] };
    const html = renderToStaticMarkup(createElement(GreenLightReleaseCard, { card, adviser: true, busy: false, onNavigate: () => undefined, onApproveException: () => undefined, onClearException: () => undefined }));
    expect(html).toContain('Adviser exception');
    expect(html).toContain('The principal confirmed the number after deadline.');
    expect(html).toContain('Remove exception');
    expect(html).toContain('Release path clear');
  });
});
