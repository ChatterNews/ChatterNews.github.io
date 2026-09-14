export interface ShowtimeCameraResult {
  stream: MediaStream;
  cameraTrack: MediaStreamTrack;
}

export interface ShowtimeCaptureOptions {
  mediaDevices: Pick<MediaDevices, 'getUserMedia'>;
  cameraId?: string;
  microphoneId?: string;
  width: number;
  height: number;
}

/**
 * Opens the camera by itself. Some school-machine drivers become unstable
 * when a browser negotiates camera, microphone, processing and HD modes in a
 * single permission request. Preferred quality is applied only after a basic
 * picture is stable and is never allowed to break it.
 */
export async function captureShowtimeCamera(options: ShowtimeCaptureOptions): Promise<ShowtimeCameraResult> {
  const camera = await options.mediaDevices.getUserMedia({
    video: options.cameraId ? { deviceId: { ideal: options.cameraId } } : true,
    audio: false,
  });
  const cameraTrack = camera.getVideoTracks()[0];
  if (!cameraTrack) {
    camera.getTracks().forEach((track) => track.stop());
    throw new Error('No camera picture was available.');
  }

  try {
    await cameraTrack.applyConstraints?.({
      width: { ideal: options.width },
      height: { ideal: options.height },
      frameRate: { ideal: 30, max: 30 },
    });
  } catch {
    // Keep the native camera mode. A stable picture matters more than forcing HD.
  }

  return { stream: camera, cameraTrack };
}

/** Opens the microphone only after the camera permission flow has settled. */
export async function captureShowtimeMicrophone(options: Pick<ShowtimeCaptureOptions, 'mediaDevices' | 'microphoneId'>): Promise<MediaStreamTrack> {
  const microphone = await options.mediaDevices.getUserMedia({
    video: false,
    audio: options.microphoneId ? { deviceId: { ideal: options.microphoneId } } : true,
  });
  const track = microphone.getAudioTracks()[0];
  if (!track) throw new Error('No microphone sound was available.');
  try {
    await track.applyConstraints?.({ echoCancellation: true, noiseSuppression: true });
  } catch {
    // The microphone's native mode remains usable.
  }
  return track;
}

export function stopShowtimeStream(stream?: MediaStream): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function captureErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access is blocked. Allow the camera for this page, then try again.';
  if (name === 'NotFoundError') return 'No camera was found. Plug one in or choose a different camera.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera could not start. Close any other app using it, then try again.';
  if (name === 'OverconstrainedError') return 'That camera mode is unavailable. Choose Browser default and try again.';
  return error instanceof Error && error.message ? error.message : 'The camera could not start.';
}
