export const RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/ogg;codecs=opus',
] as const;

export function chooseRecorderMime(
  isTypeSupported: (mime: string) => boolean,
): string | undefined {
  return RECORDER_MIME_TYPES.find((mime) => isTypeSupported(mime));
}

/** Prefer an unprocessed mono signal for music, while keeping constraints soft. */
export function musicMicrophoneConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: {
      ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
      channelCount: { ideal: 1 },
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false },
    },
  };
}

export function microphoneErrorMessage(error: unknown, embedded = false): string {
  const name = typeof error === 'object' && error && 'name' in error
    ? String((error as { name: unknown }).name)
    : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return embedded
      ? 'This embedded preview cannot use the microphone. Open Chatter in a normal browser tab, then allow the microphone from the address-bar controls.'
      : 'Microphone permission is blocked. Use the address-bar controls to allow it for Chatter, then press Check microphone.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found. Connect a headset or microphone, then press Check microphone.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The microphone is busy in another app. Close the other recorder or meeting, then try again.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'That microphone cannot use the requested recording settings. Choose another input and try again.';
  }
  if (name === 'AbortError') return 'The microphone did not start. Unplug it, reconnect it, and try again.';
  return 'The browser could not start the microphone. Check its site permission and the computer’s microphone privacy setting.';
}

