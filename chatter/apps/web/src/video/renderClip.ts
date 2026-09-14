/**
 * Rendering a vertical captioned clip.
 *
 * SPEC S7: WebCodecs for everything. It is a browser API and carries NO
 * licence obligation - unlike ffmpeg.wasm, which becomes GPL depending on how
 * it was built.
 *
 * Captions come from the Transcript, which already exists by the time anyone
 * opens Stinger, so this is a render rather than an editing session.
 */
import { captionAt, captionLines, type TranscriptSegment, type TemplateData } from '@chatter/shared';
import { WebmWriter } from './webm.js';

export const VERTICAL = { width: 1080, height: 1920 };
const FPS = 30;

export interface RenderOptions {
  segments: readonly TranscriptSegment[];
  template: TemplateData;
  start: number;
  end: number;
  onProgress?: (fraction: number) => void;
}

/** Is the browser able to encode video at all? */
export function canRenderVideo(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/** Paint one frame: the show's ground, the template's words, the caption. */
export function paintFrame(
  ctx: CanvasRenderingContext2D,
  options: { at: number; segments: readonly TranscriptSegment[]; template: TemplateData },
): void {
  const { width, height } = VERTICAL;

  ctx.fillStyle = '#2B1B4D';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#FFD21E';
  ctx.fillRect(0, height * 0.13, width, 14);
  ctx.fillRect(0, height * 0.87, width, 14);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFF6E4';
  ctx.font = '700 64px Nunito, system-ui, sans-serif';
  options.template.lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, height * 0.24 + i * 78);
  });

  const spoken = captionAt(options.segments, options.at);
  if (!spoken) return;

  const lines = captionLines(spoken.text, 18);
  ctx.font = '800 92px Nunito, system-ui, sans-serif';

  const blockTop = height / 2 - (lines.length - 1) * 55;

  lines.forEach((line, i) => {
    const y = blockTop + i * 110;
    // Outlined, so it stays readable over whatever is behind it.
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#1A1626';
    ctx.strokeText(line, width / 2, y);
    ctx.fillStyle = '#FFF6E4';
    ctx.fillText(line, width / 2, y);
  });
}

/**
 * Encode the clip, and write it into a real WebM file.
 *
 * The encoder hands back VP9 chunks; `WebmWriter` puts the container around
 * them as they arrive. Anything that plays a .webm will play this.
 */
export async function renderClip(options: RenderOptions): Promise<Blob> {
  if (!canRenderVideo()) {
    throw new Error('This browser cannot make video files.');
  }

  const canvas = new OffscreenCanvas(VERTICAL.width, VERTICAL.height);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

  const writer = new WebmWriter({ width: VERTICAL.width, height: VERTICAL.height, frameRate: FPS });
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      writer.addFrame({ data: bytes, type: chunk.type, timestamp: chunk.timestamp });
    },
    error: (error) => { throw error; },
  });

  encoder.configure({
    codec: 'vp09.00.10.08',
    width: VERTICAL.width,
    height: VERTICAL.height,
    bitrate: 4_000_000,
    framerate: FPS,
  });

  const total = Math.max(1, Math.round((options.end - options.start) * FPS));

  for (let frame = 0; frame < total; frame++) {
    const at = options.start + frame / FPS;
    paintFrame(ctx, { at, segments: options.segments, template: options.template });

    const videoFrame = new VideoFrame(canvas as unknown as CanvasImageSource, {
      timestamp: Math.round((frame / FPS) * 1_000_000),
      duration: Math.round(1_000_000 / FPS),
    });

    encoder.encode(videoFrame, { keyFrame: frame % (FPS * 2) === 0 });
    videoFrame.close();

    if (frame % FPS === 0) options.onProgress?.(frame / total);
  }

  // Flush BEFORE finalising: the last frames are still inside the encoder, and
  // a finalised file cannot take them afterwards.
  await encoder.flush();
  encoder.close();
  options.onProgress?.(1);

  return new Blob([writer.finish() as BlobPart], { type: 'video/webm' });
}
