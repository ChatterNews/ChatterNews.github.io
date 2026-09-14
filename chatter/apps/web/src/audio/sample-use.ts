import type { Gate, GateStatus, Store } from '@chatter/shared';
import type { SampleLibraryEntry } from './sample-library.js';

export interface IngestShelfSampleInput {
  gate: Gate;
  store: Store;
  entry: SampleLibraryEntry;
  storyId?: string;
  actorId?: string;
}

export interface IngestedShelfSample {
  assetId: string;
  status: GateStatus;
  file: File;
  bytes: Uint8Array;
}

export async function ingestShelfSample({
  gate, store, entry, storyId, actorId,
}: IngestShelfSampleInput): Promise<IngestedShelfSample> {
  const file = await entry.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await gate.ingest({
    source: 'upload',
    bytes,
    meta: {
      kind: 'AUDIO',
      mime: file.type || entry.mime || 'application/octet-stream',
      origin: 'UPLOAD',
      ...(storyId ? { storyId } : {}),
      ...(actorId ? { actor: actorId } : {}),
    },
  });
  if (!result.assetId) {
    throw new Error(`The Gate could not save ${entry.name}${result.reason ? `: ${result.reason}` : '.'}`);
  }

  if (storyId) {
    const credits = await store.credits.list();
    if (!credits.some((credit) => credit.assetId === result.assetId && credit.storyId === storyId)) {
      await store.credits.create({ assetId: result.assetId, storyId, usedIn: 'story' });
    }
  }

  return { assetId: result.assetId, status: result.status, file, bytes };
}
