export const MEDIA_BIN_RETURN_KEY = 'chatter.mediaBin.returnTo';

export function newsroomLocation(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function mediaBinDestination(currentPath: string, returnPath: string | null, storyId?: string) {
  if (!currentPath.startsWith('/files')) return storyId ? `/files?story=${encodeURIComponent(storyId)}` : '/files';
  if (!returnPath || returnPath.startsWith('/files')) return '/';
  return returnPath;
}
