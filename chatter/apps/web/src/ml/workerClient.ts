/**
 * Talking to the two model workers.
 *
 * Rooms never see this: the Booth holds a `Transcriber` and the Gate holds a
 * `Classifier`, both of which are plain interfaces. Swapping in a server-side
 * model later changes nothing above this file.
 */
import type { Transcriber, TranscriptSegment } from '@chatter/shared';
import type { Classifier } from '@chatter/shared';
import { detectDevice, type Backend } from './backend.js';

interface Pending { resolve: (value: any) => void; reject: (error: Error) => void }

/**
 * Whisper wants mono 16 kHz float samples, not a webm container.
 * OfflineAudioContext does the decode and the resample in one go.
 */
async function decodeToMono16k(bytes: Uint8Array): Promise<Float32Array> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const decoded = await new AudioContext().decodeAudioData(buffer);
  if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
    return new Float32Array(decoded.getChannelData(0));
  }

  const target = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const source = target.createBufferSource();
  source.buffer = decoded;
  source.connect(target.destination);
  source.start();
  return new Float32Array((await target.startRendering()).getChannelData(0));
}

/** One request/response channel over a worker, keyed by message id. */
class WorkerChannel {
  private worker: Worker;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  onProgress?: (percent: number) => void;

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent) => {
      const { id, type } = event.data;
      if (type === 'loading') {
        this.onProgress?.(event.data.progress ?? 0);
        return;
      }
      const waiting = this.pending.get(id);
      if (!waiting) return;
      this.pending.delete(id);
      if (type === 'error') waiting.reject(new Error(event.data.message));
      else waiting.resolve(event.data);
    };
  }

  send(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, id }, transfer);
    });
  }

  terminate(): void {
    this.worker.terminate();
    for (const waiting of this.pending.values()) {
      waiting.reject(new Error('Model worker closed'));
    }
    this.pending.clear();
  }
}

/** Whisper, in a worker. Implements the SPEC S5 Transcriber interface. */
export class WhisperInTab implements Transcriber {
  readonly backend: 'webgpu' | 'wasm';
  private channel: WorkerChannel;
  private memoryGB?: number;

  constructor(backend: Backend, memoryGB?: number) {
    this.backend = backend;
    this.memoryGB = memoryGB;
    this.channel = new WorkerChannel(
      new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' }),
    );
  }

  set onProgress(fn: (percent: number) => void) { this.channel.onProgress = fn; }

  async transcribe(bytes: Uint8Array, _mime: string): Promise<{ text: string; segments: TranscriptSegment[] }> {
    // Decoding happens here, not in the worker: the Web Audio API is simply
    // absent from a worker's global scope, so a decode there hangs forever.
    const samples = await decodeToMono16k(bytes);
    const result = await this.channel.send(
      { type: 'transcribe', samples: samples.buffer, backend: this.backend, memoryGB: this.memoryGB },
      [samples.buffer],
    );
    return { text: result.text, segments: result.segments };
  }

  dispose(): void { this.channel.terminate(); }
}

/**
 * The picture checker, in a worker.
 *
 * `ready` is false until the model has actually answered once, and the Gate
 * quarantines while it is false. That is the fail-closed rule from SPEC S9,
 * and it is why this reports readiness rather than assuming it.
 */
export class SafetyClassifier implements Classifier {
  private channel: WorkerChannel;
  private loaded = false;
  private backend: Backend;

  constructor(backend: Backend) {
    this.backend = backend;
    this.channel = new WorkerChannel(
      new Worker(new URL('./safety.worker.ts', import.meta.url), { type: 'module' }),
    );
  }

  get ready(): boolean { return this.loaded; }
  set onProgress(fn: (percent: number) => void) { this.channel.onProgress = fn; }

  async load(): Promise<void> {
    await this.channel.send({ type: 'load', backend: this.backend });
    this.loaded = true;
  }

  async classify(bytes: Uint8Array, mime: string): Promise<number> {
    const copy = bytes.slice();
    const result = await this.channel.send(
      { type: 'classify', bytes: copy.buffer, mime, backend: this.backend },
      [copy.buffer],
    );
    return result.score;
  }

  dispose(): void { this.channel.terminate(); }
}

let devicePromise: ReturnType<typeof detectDevice> | undefined;
function device() { return devicePromise ??= detectDevice(); }

export async function makeTranscriber(): Promise<{
  transcriber: WhisperInTab;
  backend: Backend;
  model: string;
}> {
  const found = await device();
  return {
    transcriber: new WhisperInTab(found.backend, found.memoryGB),
    backend: found.backend,
    model: found.model,
  };
}

export async function makeSafetyClassifier(): Promise<{
  classifier: SafetyClassifier;
  backend: Backend;
  model: string;
}> {
  const found = await device();
  return {
    classifier: new SafetyClassifier(found.backend),
    backend: found.backend,
    model: found.model,
  };
}
