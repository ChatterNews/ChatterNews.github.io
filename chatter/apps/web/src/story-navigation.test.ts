import { describe, expect, it } from 'vitest';
import { routeStoryId, selectStoryWorkspace } from './story-navigation.js';

describe('connected story navigation', () => {
  it('reads story context from both room paths and specialist-room queries', () => {
    expect(routeStoryId('/desk/story%201', '')).toBe('story 1');
    expect(routeStoryId('/studio', '?story=story-2')).toBe('story-2');
    expect(routeStoryId('/blast', '?story=story-3&project=design-1')).toBe('story-3');
    expect(routeStoryId('/reruns/podcast/pod-1', '')).toBeUndefined();
    expect(routeStoryId('/chatterbox', '?story=story-4')).toBeUndefined();
  });

  it('opens the requested project first, then the latest project for the active story', () => {
    const projects = [
      { id: 'latest-a', storyId: 'story-a' },
      { id: 'latest-b', storyId: 'story-b' },
      { id: 'older-b', storyId: 'story-b' },
    ];
    expect(selectStoryWorkspace(projects, { storyId: 'story-b' })?.id).toBe('latest-b');
    expect(selectStoryWorkspace(projects, { storyId: 'story-b', projectId: 'older-b' })?.id).toBe('older-b');
    expect(selectStoryWorkspace(projects, { storyId: 'missing' })).toBeUndefined();
    expect(selectStoryWorkspace(projects, {})?.id).toBe('latest-a');
  });
});
