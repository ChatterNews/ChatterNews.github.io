export function isCurrentStingerSave(
  currentProjectId: string | undefined,
  currentRevision: number,
  savedProjectId: string,
  requestedRevision: number,
): boolean {
  return currentProjectId === savedProjectId && currentRevision === requestedRevision;
}
