const PATH_STORY_ROOMS = new Set(['slate', 'desk', 'booth', 'greenlight', 'stinger', 'showtime', 'reruns']);
const QUERY_STORY_ROOMS = new Set(['crew', 'studio', 'blast', 'files']);

export function routeStoryId(pathname: string, search: string): string | undefined {
  const [, room = '', rawId] = pathname.split('/');
  if (PATH_STORY_ROOMS.has(room) && rawId && !(room === 'reruns' && rawId === 'podcast')) {
    try { return decodeURIComponent(rawId); } catch { return rawId; }
  }
  if (!QUERY_STORY_ROOMS.has(room)) return undefined;
  return new URLSearchParams(search).get('story') ?? undefined;
}

export function selectStoryWorkspace<T extends { id: string; storyId?: string }>(
  projects: T[],
  requested: { storyId?: string; projectId?: string | null },
): T | undefined {
  const exact = requested.projectId ? projects.find((item) => item.id === requested.projectId) : undefined;
  if (exact) return exact;
  if (requested.storyId) return projects.find((item) => item.storyId === requested.storyId);
  return projects[0];
}
