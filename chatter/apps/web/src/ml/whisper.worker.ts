/**
 * Whisper, in the tab. SPEC S1: whisper-base ONNX via Transformers.js on
 * WebGPU, falling back to whisper-tiny on weak devices.
 *
 * A worker so a long transcription never freezes the room the kid is in.
 * Audio never leaves this machine.
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { chooseWhisperModel, type Backend } from './backend.js';
import { configureModelRuntime } from './model-runtime.js';

configureModelRuntime(env as any);

let asr: AutomaticSpeechRecognitionPipeline | undefined;
let loadedWith: string | undefined;

async function load(backend: Backend, memoryGB?: number) {
  const model = chooseWhisperModel({ backend, memoryGB });
  if (asr && loadedWith === model) return { model };

  // `pipeline` is heavily overloaded; naming the options separately keeps
  // TypeScript from trying to represent every task's union at once.
  const options = {
    device: backend === 'webgpu' ? 'webgpu' : 'wasm',
    dtype: backend === 'webgpu' ? 'fp16' : 'q8',
    progress_callback: (p: any) => {
      if (p.status === 'progress') {
        self.postMessage({ type: 'loading', file: p.file, progress: Math.round(p.progress ?? 0) });
      }
    },
  };
  asr = await (pipeline as any)('automatic-speech-recognition', model, options) as AutomaticSpeechRecognitionPipeline;

  loadedWith = model;
  return { model };
}

self.onmessage = async (event: MessageEvent) => {
  const { id, type, samples, backend, memoryGB } = event.data;

  try {
    if (type === 'load') {
      const { model } = await load(backend, memoryGB);
      self.postMessage({ id, type: 'ready', model });
      return;
    }

    if (type === 'transcribe') {
      const { model } = await load(backend, memoryGB);

      // Samples arrive already decoded to mono 16 kHz: the Web Audio API is
      // not available inside a worker, so the room decodes before sending.
      const output: any = await asr!(new Float32Array(samples), {
        return_timestamps: true,
        chunk_length_s: 30,
      });

      const segments = (output.chunks ?? []).map((c: any) => ({
        start: c.timestamp?.[0] ?? 0,
        end: c.timestamp?.[1] ?? 0,
        text: (c.text ?? '').trim(),
      }));

      self.postMessage({ id, type: 'done', text: (output.text ?? '').trim(), segments, model });
      return;
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: (error as Error).message });
  }
};
