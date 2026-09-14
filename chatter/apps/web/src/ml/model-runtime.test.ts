import { describe, expect, test } from 'vitest';
import {
  SAFETY_DTYPE,
  SAFETY_MODEL,
  configureModelRuntime,
} from './model-runtime.js';

describe('Chromebook model runtime', () => {
  test('uses the quantized Transformers.js safety model', () => {
    expect(SAFETY_MODEL).toBe('onnx-community/nsfw_image_detection-ONNX');
    expect(SAFETY_DTYPE).toBe('q4');
  });

  test('points ONNX runtime files at the same-origin build output', () => {
    const fakeEnv = {
      allowRemoteModels: true,
      remoteHost: 'https://huggingface.co',
      remotePathTemplate: '{model}/resolve/main/',
      backends: { onnx: { wasm: { wasmPaths: undefined as string | { wasm: string } | undefined } } },
    };

    configureModelRuntime(fakeEnv);

    expect(fakeEnv.backends.onnx.wasm.wasmPaths).toEqual({
      wasm: expect.stringMatching(/ort-wasm-simd-threaded\.jsep.*\.wasm/),
    });
  });
});
