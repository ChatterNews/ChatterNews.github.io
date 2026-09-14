import { describe, expect, it } from 'vitest';
import { chooseRecorderMime, microphoneErrorMessage, musicMicrophoneConstraints } from './microphone.js';

describe('Studio microphone setup', () => {
  it('prefers Opus in WebM when the browser supports it', () => {
    expect(chooseRecorderMime((mime) => mime === 'audio/webm;codecs=opus')).toBe('audio/webm;codecs=opus');
  });

  it('falls through to a supported Safari recording format', () => {
    expect(chooseRecorderMime((mime) => mime === 'audio/mp4')).toBe('audio/mp4');
  });

  it('allows the browser to choose when no listed format is supported', () => {
    expect(chooseRecorderMime(() => false)).toBeUndefined();
  });

  it('asks for an unprocessed mono music input without exact constraints', () => {
    expect(musicMicrophoneConstraints('usb-mic')).toEqual({
      audio: {
        deviceId: { ideal: 'usb-mic' },
        channelCount: { ideal: 1 },
        echoCancellation: { ideal: false },
        noiseSuppression: { ideal: false },
        autoGainControl: { ideal: false },
      },
    });
  });

  it('explains an embedded-browser permission refusal', () => {
    expect(microphoneErrorMessage({ name: 'NotAllowedError' }, true)).toContain('normal browser tab');
  });

  it('distinguishes a busy microphone from a denied microphone', () => {
    expect(microphoneErrorMessage({ name: 'NotReadableError' })).toContain('busy');
  });
});
