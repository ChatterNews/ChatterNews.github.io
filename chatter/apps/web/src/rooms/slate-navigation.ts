export function slateDossierPath(storyId?: string): string {
  return storyId ? `/slate/${storyId}` : '/slate';
}
