import type { WebmWriterOptions } from './webm.js';

type Probe = (config: VideoEncoderConfig) => Promise<{ supported?: boolean }>;
type ExportFormat = Pick<VideoEncoderConfig, 'width' | 'height' | 'bitrate' | 'framerate'>;

/** Probe the actual dimensions and bitrate: an exposed API alone does not promise an encoder. */
export async function chooseWebmCodec(format: ExportFormat, probe: Probe = (config) => VideoEncoder.isConfigSupported(config)):
Promise<{ config: VideoEncoderConfig; webmCodec: NonNullable<WebmWriterOptions['codec']> }> {
  for (const [codec, webmCodec] of [['vp09.00.10.08', 'V_VP9'], ['vp8', 'V_VP8']] as const) {
    const config = { ...format, codec };
    try {
      if ((await probe(config)).supported) return { config, webmCodec };
    } catch {
      // Older implementations may reject an unknown codec instead of reporting unsupported.
    }
  }
  throw new Error('This device cannot encode this graphic as WebM. You can keep editing; use a device with VP8 or VP9 video encoding to export it.');
}
