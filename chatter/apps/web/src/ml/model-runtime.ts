import ortWasmUrl from '../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';

export const SAFETY_MODEL = 'onnx-community/nsfw_image_detection-ONNX';
export const SAFETY_DTYPE = 'q4' as const;
export const ORT_WASM_PATHS = { wasm: ortWasmUrl } as const;

interface RuntimeEnvironment {
  allowRemoteModels: boolean;
  allowLocalModels?: boolean;
  localModelPath?: string;
  remoteHost?: string;
  remotePathTemplate?: string;
  backends: { onnx: { wasm: { wasmPaths?: string | { wasm: string } } } };
}

/** Configure this worker's Transformers runtime without pulling it into App. */
export function configureModelRuntime(
  runtime: RuntimeEnvironment,
  modelHost = import.meta.env.VITE_MODEL_HOST as string | undefined,
): { servedLocally: boolean; from: string } {
  // Importing the URL lets Vite emit one hashed, same-origin copy. A manual
  // public copy would make every portable build carry the 21 MB binary twice.
  runtime.backends.onnx.wasm.wasmPaths = ORT_WASM_PATHS;

  if (import.meta.env.VITE_ORBIT_WEB === 'true') {
    if (!modelHost || modelHost !== `${import.meta.env.BASE_URL}models`) throw new Error('Orbit website models must use this prepared app’s local model folder.');
    runtime.allowRemoteModels = false;
    runtime.allowLocalModels = true;
    runtime.localModelPath = `${modelHost}/`;
    return { servedLocally: true, from: modelHost };
  }

  if (modelHost) {
    runtime.allowRemoteModels = true;
    runtime.remoteHost = modelHost.endsWith('/') ? modelHost.slice(0, -1) : modelHost;
    runtime.remotePathTemplate = '{model}';
    return { servedLocally: true, from: runtime.remoteHost };
  }

  return { servedLocally: false, from: runtime.remoteHost ?? 'the Hugging Face CDN' };
}
