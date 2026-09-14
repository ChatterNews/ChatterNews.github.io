import { describe, expect, test, vi } from 'vitest';
import { chooseWebmCodec } from './video-codec.js';
import { WebmWriter } from './webm.js';

const format = { width: 1080, height: 1920, bitrate: 4_000_000, framerate: 30 };

describe('graphic video encoder selection', () => {
  test('prefers VP9 only when the complete export configuration is supported', async () => {
    const probe = vi.fn(async () => ({ supported: true }));
    const choice = await chooseWebmCodec(format, probe);
    expect(probe).toHaveBeenCalledExactlyOnceWith({ ...format, codec: 'vp09.00.10.08' });
    expect(choice).toEqual({ config: { ...format, codec: 'vp09.00.10.08' }, webmCodec: 'V_VP9' });
  });

  test('falls back to VP8 and labels the actual WebM track as VP8', async () => {
    const probe = vi.fn(async (config: VideoEncoderConfig) => ({ supported: config.codec === 'vp8' }));
    const choice = await chooseWebmCodec(format, probe);
    expect(probe.mock.calls.map(([config]) => config.codec)).toEqual(['vp09.00.10.08', 'vp8']);
    const writer = new WebmWriter({ ...format, frameRate: format.framerate, codec: choice.webmCodec });
    writer.addFrame({ data: new Uint8Array([1, 2, 3]), type: 'key', timestamp: 0 });
    const container = new TextDecoder().decode(writer.finish());
    expect(container).toContain('V_VP8');
    expect(container).not.toContain('V_VP9');
  });

  test('a rejected codec probe can still fall back to VP8', async () => {
    const probe = vi.fn(async (config: VideoEncoderConfig) => {
      if (config.codec !== 'vp8') throw new DOMException('Unknown codec', 'NotSupportedError');
      return { supported: true };
    });
    expect((await chooseWebmCodec(format, probe)).webmCodec).toBe('V_VP8');
  });

  test('explains an unsupported device without constructing an encoder', async () => {
    await expect(chooseWebmCodec(format, async () => ({ supported: false })))
      .rejects.toThrow('This device cannot encode this graphic as WebM');
  });
});
