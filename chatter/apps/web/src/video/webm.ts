/**
 * The WebM container around the encoded frames.
 *
 * WebCodecs gives us encoded VP8 or VP9 chunks and stops there - it has no opinion
 * about files. Writing those chunks straight to a Blob produces real bytes
 * that no player will open, which is what Stinger used to do. This wraps them
 * in the container a phone, a browser and a projector all expect.
 *
 * webm-muxer is MIT and pure TypeScript, so it stays clear of the ffmpeg.wasm
 * licence trap in SPEC S7 - no GPL, no WASM build flags to audit.
 */
import { ArrayBufferTarget, Muxer } from 'webm-muxer';

/** The four bytes at the head of every EBML document, WebM included. */
export const EBML_MAGIC = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);

export interface EncodedFrame {
  data: Uint8Array;
  type: 'key' | 'delta';
  /** Microseconds from the start of the clip, as WebCodecs reports it. */
  timestamp: number;
}

export interface WebmWriterOptions {
  width: number;
  height: number;
  frameRate: number;
  codec?: 'V_VP9' | 'V_VP8';
}

/**
 * Collects encoded frames and closes them into one WebM file.
 *
 * Frames go in as they leave the encoder, so nothing waits for the whole clip
 * to exist twice over.
 */
export class WebmWriter {
  private readonly muxer: Muxer<ArrayBufferTarget>;
  private finished = false;

  constructor(options: WebmWriterOptions) {
    this.muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: options.codec ?? 'V_VP9',
        width: options.width,
        height: options.height,
        frameRate: options.frameRate,
      },
    });
  }

  addFrame(frame: EncodedFrame): void {
    if (this.finished) throw new Error('This clip is already written; start a new WebmWriter.');
    this.muxer.addVideoChunkRaw(frame.data, frame.type, frame.timestamp);
  }

  /**
   * Finalise the file. Once only - finalising twice would append a second set
   * of closing elements and quietly produce a file players truncate.
   */
  finish(): Uint8Array {
    if (this.finished) throw new Error('This clip is already written; start a new WebmWriter.');
    this.muxer.finalize();
    this.finished = true;
    return new Uint8Array(this.muxer.target.buffer);
  }
}
