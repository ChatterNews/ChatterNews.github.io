/**
 * Which model, on which backend, for this particular machine.
 *
 * SPEC S9, Tier 0: "Devices without WebGPU fall back to WASM and get slow.
 * Detect this, drop to whisper-tiny, and say so in plain language rather than
 * hanging."
 */

export type Backend = 'webgpu' | 'wasm';

/** A device needs real memory before it is handed the bigger model. */
const BASE_MODEL_MIN_GB = 4;

export const WHISPER_BASE = 'onnx-community/whisper-base';
export const WHISPER_TINY = 'onnx-community/whisper-tiny';

export function chooseBackend(device: { hasWebGPU: boolean }): Backend {
  return device.hasWebGPU ? 'webgpu' : 'wasm';
}

/**
 * whisper-base is ~50 MB and wants a GPU. Anything less capable gets tiny,
 * which is worse at names but finishes.
 */
export function chooseWhisperModel(device: { backend: Backend; memoryGB?: number }, mobile = import.meta.env.VITE_ORBIT_MOBILE === 'true'): string {
  if (mobile) return WHISPER_TINY;
  if (device.backend !== 'webgpu') return WHISPER_TINY;
  // navigator.deviceMemory is absent on some browsers; assume the small device.
  if ((device.memoryGB ?? 0) < BASE_MODEL_MIN_GB) return WHISPER_TINY;
  return WHISPER_BASE;
}

/** What a teacher reads. No jargon, and never a silent wait. */
export function plainLanguageFor(backend: Backend): string {
  return backend === 'webgpu'
    ? 'This computer can do the typing-out quickly.'
    : 'This computer does the typing-out the slow way, so give it a minute after each take. It still works.';
}

/** Ask the actual browser what it has. */
export async function detectDevice(): Promise<{ backend: Backend; model: string; memoryGB?: number }> {
  const hasWebGPU = typeof navigator !== 'undefined'
    && 'gpu' in navigator
    && !!(await (navigator as any).gpu?.requestAdapter?.().catch(() => null));

  const backend = chooseBackend({ hasWebGPU });
  const memoryGB = (navigator as any).deviceMemory as number | undefined;
  return { backend, model: chooseWhisperModel({ backend, memoryGB }), memoryGB };
}
