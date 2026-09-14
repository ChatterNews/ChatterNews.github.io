/**
 * Draining the transcript queue. SPEC S5 Transcriber, S6 Booth.
 *
 * The room code must not care which backend is running - WebGPU, WASM, or one
 * day a server - so everything here talks to the interface, never the model.
 */
import type { Store } from './store.js';
import type { JobQueue } from './jobs.js';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcriber {
  transcribe(bytes: Uint8Array, mime: string): Promise<{ text: string; segments: TranscriptSegment[] }>;
  readonly backend: 'webgpu' | 'wasm' | 'server';
}

/**
 * Run one waiting transcribe job. Returns whether work was actually done, so a
 * caller can loop until it goes quiet.
 */
export async function runNextTranscribeJob(
  store: Store,
  jobs: JobQueue,
  transcriber: Transcriber,
): Promise<boolean> {
  const job = await jobs.claim();
  if (!job) return false;

  const { assetId } = job.payload as { assetId: string };

  try {
    // Doing it twice is not an error, it just is not work.
    const already = (await store.transcripts.list()).find((t: any) => t.assetId === assetId);
    if (already) {
      await jobs.complete(job.id);
      return true;
    }

    const asset = await store.assets.get(assetId);
    if (!asset) throw new Error(`no asset ${assetId}`);

    const bytes = await store.blobs.get(asset.sha256);
    if (!bytes) {
      // Cached audio is evictable; the take may live on another device.
      throw new Error('the audio for this take is not on this device');
    }

    const { text, segments } = await transcriber.transcribe(bytes, asset.mime);
    await store.transcripts.create({ assetId, text, segments });
    await jobs.complete(job.id);

    await store.events.append({
      action: 'transcript.done',
      target: assetId,
      payload: { backend: transcriber.backend, words: text.split(/\s+/).filter(Boolean).length },
    });

    return true;
  } catch (error) {
    await jobs.fail(job.id, (error as Error).message);
    return false;
  }
}
