import { describe, expect, test } from 'vitest';
import { chooseBackend, chooseWhisperModel, plainLanguageFor } from './backend.js';

describe('chooseBackend', () => {
  test('uses WebGPU when the device has it', () => {
    expect(chooseBackend({ hasWebGPU: true })).toBe('webgpu');
  });

  test('falls back to WASM rather than failing', () => {
    expect(chooseBackend({ hasWebGPU: false })).toBe('wasm');
  });
});

describe('chooseWhisperModel', () => {
  test('keeps mobile transcription within the bundled small-model profile', () => {
    expect(chooseWhisperModel({ backend: 'webgpu', memoryGB: 8 }, true)).toContain('whisper-tiny');
    expect(chooseWhisperModel({ backend: 'wasm' }, true)).toContain('whisper-tiny');
  });
  test('uses whisper-base on a device with WebGPU', () => {
    expect(chooseWhisperModel({ backend: 'webgpu', memoryGB: 8 })).toContain('whisper-base');
  });

  test('drops to whisper-tiny on the WASM path, which is slow', () => {
    expect(chooseWhisperModel({ backend: 'wasm', memoryGB: 8 })).toContain('whisper-tiny');
  });

  test('drops to whisper-tiny on a low-memory Chromebook even with WebGPU', () => {
    expect(chooseWhisperModel({ backend: 'webgpu', memoryGB: 2 })).toContain('whisper-tiny');
  });

  test('assumes a small device when the browser will not say how much memory it has', () => {
    expect(chooseWhisperModel({ backend: 'webgpu' })).toContain('whisper-tiny');
  });
});

describe('plainLanguageFor', () => {
  test('says nothing alarming on the fast path', () => {
    expect(plainLanguageFor('webgpu')).toMatch(/quick|fast/i);
  });

  test('warns plainly on the slow path instead of leaving it a mystery', () => {
    const said = plainLanguageFor('wasm');
    expect(said).toMatch(/slow/i);
    expect(said).not.toMatch(/WASM|WebGPU|backend/i);
  });
});
