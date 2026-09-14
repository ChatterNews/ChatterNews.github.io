/**
 * The picture checker. SPEC S1 and S4 stage 4: an on-device image classifier,
 * scoring 0..1, running in this tab. No cloud inference, no per-image bills,
 * no student image leaving the machine it was made on.
 */
import { env, pipeline, RawImage, type ImageClassificationPipeline } from '@huggingface/transformers';
import { configureModelRuntime, SAFETY_DTYPE, SAFETY_MODEL } from './model-runtime.js';

/**
 * An NSFW image classifier. It is the one thing on this list that is a real
 * safety control rather than a convenience. It loads on the first picture,
 * and the Gate refuses to approve anything until it answers.
 */
configureModelRuntime(env as any);

let classifier: ImageClassificationPipeline | undefined;

async function load(backend: 'webgpu' | 'wasm') {
  if (classifier) return;
  const options = {
    device: backend === 'webgpu' ? 'webgpu' : 'wasm',
    progress_callback: (p: any) => {
      if (p.status === 'progress') {
        self.postMessage({ type: 'loading', progress: Math.round(p.progress ?? 0) });
      }
    },
  };
  classifier = await (pipeline as any)('image-classification', SAFETY_MODEL, {
    ...options,
    dtype: SAFETY_DTYPE,
  }) as ImageClassificationPipeline;
}

self.onmessage = async (event: MessageEvent) => {
  const { id, type, bytes, mime, backend } = event.data;

  try {
    if (type === 'load') {
      await load(backend);
      self.postMessage({ id, type: 'ready' });
      return;
    }

    if (type === 'classify') {
      await load(backend);
      const image = await RawImage.fromBlob(new Blob([new Uint8Array(bytes)], { type: mime }));
      const results: any[] = await classifier!(image);

      // Score is "how unsafe", so find the unsafe label rather than trusting
      // the order the model happens to return.
      const unsafe = results.find((r) =>
        /nsfw|porn|sexy|hentai|explicit/i.test(r.label));

      self.postMessage({ id, type: 'score', score: unsafe ? unsafe.score : 0 });
      return;
    }
  } catch (error) {
    // Never answer with a score we did not compute: the Gate fails closed on
    // an error, which quarantines rather than approves.
    self.postMessage({ id, type: 'error', message: (error as Error).message });
  }
};
