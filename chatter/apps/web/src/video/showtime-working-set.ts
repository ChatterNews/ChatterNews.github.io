import type { ShowtimeProject } from '@chatter/shared';

function assetIdFromLiveSource(source: string): string | undefined {
  return source.startsWith('ASSET:') ? source.slice('ASSET:'.length) : undefined;
}

/** The only media whose bytes the open Showtime project can currently use. */
export function showtimeWorkingAssetIds(
  project: Pick<ShowtimeProject, 'clips'> | undefined,
  selectedAssetId: string | undefined,
  previewSource: string,
  programSource: string,
): Set<string> {
  const ids = new Set(project?.clips.map((clip) => clip.assetId) ?? []);
  if (selectedAssetId) ids.add(selectedAssetId);
  const previewId = assetIdFromLiveSource(previewSource);
  const programId = assetIdFromLiveSource(programSource);
  if (previewId) ids.add(previewId);
  if (programId) ids.add(programId);
  return ids;
}
