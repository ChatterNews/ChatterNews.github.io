import { describe, expect, test, vi } from 'vitest';
import { captureShowtimeCamera, captureShowtimeMicrophone } from './showtime-capture.js';

function track(kind: 'video' | 'audio') {
  return { kind, stop: vi.fn(), applyConstraints: vi.fn(async () => undefined), getSettings: () => ({ deviceId: `${kind}-device` }) } as unknown as MediaStreamTrack;
}

function stream(video: MediaStreamTrack[] = [], audio: MediaStreamTrack[] = []) {
  const tracks = [...video, ...audio];
  return {
    getVideoTracks: () => video,
    getAudioTracks: () => audio,
    getTracks: () => tracks,
    addTrack: (item: MediaStreamTrack) => { audio.push(item); tracks.push(item); },
  } as unknown as MediaStream;
}

describe('Showtime device capture', () => {
  test('opens and tunes the camera without touching the microphone', async () => {
    const cameraTrack = track('video'); const camera = stream([cameraTrack]);
    const getUserMedia = vi.fn().mockResolvedValueOnce(camera);
    const result = await captureShowtimeCamera({ mediaDevices: { getUserMedia } as Pick<MediaDevices, 'getUserMedia'>, width: 1280, height: 720 });
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(result.stream.getTracks()).toEqual([cameraTrack]);
    expect(cameraTrack.applyConstraints).toHaveBeenCalledWith({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } });
  });

  test('opens and tunes the microphone in its own request', async () => {
    const microphoneTrack = track('audio'); const getUserMedia = vi.fn().mockResolvedValueOnce(stream([], [microphoneTrack]));
    const result = await captureShowtimeMicrophone({ mediaDevices: { getUserMedia } as Pick<MediaDevices, 'getUserMedia'> });
    expect(getUserMedia).toHaveBeenCalledWith({ video: false, audio: true });
    expect(result).toBe(microphoneTrack);
    expect(microphoneTrack.applyConstraints).toHaveBeenCalledWith({ echoCancellation: true, noiseSuppression: true });
  });

  test('uses preferred device IDs without making them mandatory', async () => {
    const cameraRequest = vi.fn().mockResolvedValueOnce(stream([track('video')]));
    const microphoneRequest = vi.fn().mockResolvedValueOnce(stream([], [track('audio')]));
    await captureShowtimeCamera({ mediaDevices: { getUserMedia: cameraRequest } as Pick<MediaDevices, 'getUserMedia'>, cameraId: 'cam', width: 900, height: 900 });
    await captureShowtimeMicrophone({ mediaDevices: { getUserMedia: microphoneRequest } as Pick<MediaDevices, 'getUserMedia'>, microphoneId: 'mic' });
    expect(cameraRequest).toHaveBeenCalledWith({ video: { deviceId: { ideal: 'cam' } }, audio: false });
    expect(microphoneRequest).toHaveBeenCalledWith({ video: false, audio: { deviceId: { ideal: 'mic' } } });
  });
});
