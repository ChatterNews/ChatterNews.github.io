import { afterEach, expect, test, vi } from 'vitest';
import { configureModelRuntime } from './model-runtime.js';
afterEach(() => vi.unstubAllEnvs());
function runtime() { return { allowRemoteModels: true, allowLocalModels: false, localModelPath: '', remoteHost: 'https://huggingface.co', backends: { onnx: { wasm: {} } } }; }
test('website model configuration cannot silently fall back to a remote model host', () => {
  vi.stubEnv('VITE_ORBIT_WEB', 'true'); vi.stubEnv('BASE_URL', '/r/web-1/');
  const env = runtime();
  configureModelRuntime(env, '/r/web-1/models');
  expect(env.allowRemoteModels).toBe(false); expect(env.allowLocalModels).toBe(true);
  expect(env.localModelPath).toBe('/r/web-1/models/');
});
test.each([undefined, 'https://huggingface.co', '//elsewhere/models', '/other/models'])('website refuses a missing or wrong model location: %s', (host) => {
  vi.stubEnv('VITE_ORBIT_WEB', 'true'); vi.stubEnv('BASE_URL', '/r/web-1/'); vi.stubEnv('VITE_MODEL_HOST', host);
  expect(() => configureModelRuntime(runtime(), host)).toThrow(/model/i);
});
