import { motionFrameState, type MotionBindings, type MotionFrameElement, type MotionPackage, type MotionScene } from '@chatter/shared';
import { WebmWriter } from './webm.js';
import { chooseWebmCodec } from './video-codec.js';

const FPS = 30;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}

function wrap(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(candidate).width <= width) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

function paintShape(ctx: CanvasRenderingContext2D, item: MotionFrameElement) {
  ctx.beginPath();
  if (item.shape === 'ELLIPSE') ctx.ellipse(item.width / 2, item.height / 2, item.width / 2, item.height / 2, 0, 0, Math.PI * 2);
  else if (item.shape === 'TRIANGLE') { ctx.moveTo(item.width / 2, 0); ctx.lineTo(item.width, item.height); ctx.lineTo(0, item.height); ctx.closePath(); }
  else if (item.shape === 'LINE') { ctx.moveTo(0, item.height / 2); ctx.lineTo(item.width, item.height / 2); }
  else roundedRect(ctx, 0, 0, item.width, item.height, item.radius);
  ctx.fillStyle = item.fill;
  if (item.shape !== 'LINE') ctx.fill();
  if (item.strokeWidth || item.shape === 'LINE') { ctx.strokeStyle = item.stroke === 'transparent' ? item.fill : item.stroke; ctx.lineWidth = item.strokeWidth || Math.max(4, item.height); ctx.stroke(); }
}

function paintText(ctx: CanvasRenderingContext2D, item: MotionFrameElement) {
  ctx.font = `${item.fontWeight} ${item.fontSize}px ${item.fontFamily}, system-ui, sans-serif`;
  ctx.textAlign = item.align;
  ctx.textBaseline = 'top';
  const x = item.align === 'center' ? item.width / 2 : item.align === 'right' ? item.width : 0;
  const lines = wrap(ctx, item.visibleText, item.width);
  lines.slice(0, Math.max(1, Math.floor(item.height / (item.fontSize * item.lineHeight)))).forEach((line, index) => {
    const y = index * item.fontSize * item.lineHeight;
    if (item.shadowBlur || item.shadowX || item.shadowY) {
      ctx.shadowColor = item.shadowColor ?? '#000000'; ctx.shadowBlur = item.shadowBlur ?? 0;
      ctx.shadowOffsetX = item.shadowX ?? 0; ctx.shadowOffsetY = item.shadowY ?? 0;
    }
    ctx.fillStyle = item.fill; ctx.fillText(line, x, y, item.width);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  });
}

export function paintMotionFrame(ctx: CanvasRenderingContext2D, project: MotionPackage, scene: MotionScene, atMs: number, bindings: MotionBindings, images: Map<string, CanvasImageSource> = new Map(), clear = true): void {
  if (clear) ctx.clearRect(0, 0, project.width, project.height);
  if (scene.background !== 'transparent') {
    if (scene.backgroundSecondary) {
      const gradient = ctx.createLinearGradient(0, 0, project.width, project.height);
      gradient.addColorStop(0, scene.background); gradient.addColorStop(1, scene.backgroundSecondary); ctx.fillStyle = gradient;
    } else ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, project.width, project.height);
  }
  for (const source of scene.elements) {
    const item = motionFrameState(source, atMs, scene, bindings);
    if (item.frameOpacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = item.frameOpacity;
    ctx.translate(item.frameX + item.width / 2, item.frameY + item.height / 2);
    ctx.rotate(item.frameRotation * Math.PI / 180); ctx.scale(item.frameScale, item.frameScale);
    ctx.translate(-item.width / 2, -item.height / 2);
    if (item.frameReveal < 1) { ctx.beginPath(); ctx.rect(0, 0, item.width * item.frameReveal, item.height); ctx.clip(); }
    if (item.kind === 'TEXT') paintText(ctx, item);
    else if (item.kind === 'SHAPE') paintShape(ctx, item);
    else if (item.imageAssetId && images.has(item.imageAssetId)) ctx.drawImage(images.get(item.imageAssetId)!, 0, 0, item.width, item.height);
    ctx.restore();
  }
}

export function canRenderMotionVideo(): boolean { return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof OffscreenCanvas !== 'undefined'; }

export async function renderMotionScene(options: { project: MotionPackage; scene: MotionScene; bindings: MotionBindings; images?: Map<string, CanvasImageSource>; onProgress?: (fraction: number) => void }): Promise<Blob> {
  if (!canRenderMotionVideo()) throw new Error('This browser cannot export motion video. You can keep editing; use a current browser with video encoding support to export it.');
  const { project, scene, bindings } = options;
  const { config, webmCodec } = await chooseWebmCodec({ width: project.width, height: project.height, bitrate: project.format === 'WIDE' ? 5_000_000 : 4_000_000, framerate: FPS });
  const canvas = new OffscreenCanvas(project.width, project.height);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  if (!ctx) throw new Error('This device could not open the graphic drawing surface.');
  const writer = new WebmWriter({ width: project.width, height: project.height, frameRate: FPS, codec: webmCodec });
  let encoderError: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk) => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); writer.addFrame({ data, type: chunk.type, timestamp: chunk.timestamp }); },
    error: (error) => { encoderError = error; },
  });
  try {
    encoder.configure(config);
    const total = Math.max(1, Math.ceil(scene.durationMs / 1000 * FPS));
    for (let frame = 0; frame < total; frame++) {
      if (encoderError) throw encoderError;
      paintMotionFrame(ctx, project, scene, frame / FPS * 1000, bindings, options.images);
      const videoFrame = new VideoFrame(canvas, { timestamp: Math.round(frame / FPS * 1_000_000), duration: Math.round(1_000_000 / FPS) });
      try { encoder.encode(videoFrame, { keyFrame: frame % (FPS * 2) === 0 }); }
      finally { videoFrame.close(); }
      // Bound pending full-resolution frames on phones and tablets.
      if ((frame + 1) % 15 === 0) { await encoder.flush(); options.onProgress?.((frame + 1) / total); }
    }
    await encoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  options.onProgress?.(1);
  return new Blob([writer.finish() as BlobPart], { type: 'video/webm' });
}
