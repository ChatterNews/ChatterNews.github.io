import { videoProjectAssetIds, type ShowtimeProject } from '@chatter/shared';

function assetIdFromLiveSource(source: string): string | undefined {
  return source.startsWith('ASSET:') ? source.slice('ASSET:'.length) : undefined;
}

/** The only media whose bytes the open Showtime project can currently use. */
export function showtimeWorkingAssetIds(
  project: Pick<ShowtimeProject, 'clips'> & Partial<Pick<ShowtimeProject, 'titles'>> | undefined,
  selectedAssetId: string | undefined,
  previewSource: string,
  programSource: string,
): Set<string> {
  const ids = new Set(project ? videoProjectAssetIds({ clips: project.clips, titles: project.titles ?? [] }) : []);
  if (selectedAssetId) ids.add(selectedAssetId);
  const previewId = assetIdFromLiveSource(previewSource);
  const programId = assetIdFromLiveSource(programSource);
  if (previewId) ids.add(previewId);
  if (programId) ids.add(programId);
  return ids;
}
