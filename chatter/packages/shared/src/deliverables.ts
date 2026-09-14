import type { Store } from './store.js';
import type { Deliverable, DeliverableKind, DeliverableRoom, DeliverableStage } from './types.js';

export interface SaveDeliverableInput {
  bytes: Uint8Array;
  title: string;
  fileName: string;
  kind: DeliverableKind;
  room: DeliverableRoom;
  stage?: DeliverableStage;
  mime: string;
  storyId?: string;
  authorId?: string;
  sourceAssetId?: string;
  sourceProjectId?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  pageCount?: number;
}

export async function saveDeliverable(store: Store, input: SaveDeliverableInput): Promise<Deliverable> {
  if (!input.bytes.byteLength) throw new Error('The output file is empty. Make it again before saving.');
  const blobHash = await store.blobs.put(input.bytes);
  const existing = (await store.deliverables.list()).find((item) => item.blobHash === blobHash && item.storyId === input.storyId && item.room === input.room && item.fileName === input.fileName);
  if (existing) return store.deliverables.update(existing.id, {
    title: input.title, stage: input.stage ?? existing.stage,
    ...(input.authorId ? { authorId: input.authorId } : {}),
    ...(input.sourceAssetId ? { sourceAssetId: input.sourceAssetId } : {}),
    ...(input.sourceProjectId ? { sourceProjectId: input.sourceProjectId } : {}),
  });
  const { bytes, ...record } = input;
  return store.deliverables.create({
    ...record,
    stage: input.stage ?? 'WORKING',
    bytes: bytes.byteLength,
    blobHash,
  });
}

export async function deliverableBytes(store: Store, item: Pick<Deliverable, 'blobHash'>): Promise<Uint8Array> {
  const bytes = await store.blobs.get(item.blobHash);
  if (!bytes) throw new Error('This file is missing. Restore the story drive copy or make the export again.');
  return bytes;
}

export function deliverableTypeLabel(kind: DeliverableKind): string {
  return ({ AUDIO: 'Audio', IMAGE: 'Image', VIDEO: 'Video', DOCUMENT: 'Document', DESIGN: 'Design', PACKAGE: 'Package' })[kind];
}
