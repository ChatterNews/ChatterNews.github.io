import {
  normalizeShowtimeProject, showtimeActiveClips, showtimeClipEnd,
  showtimeClipStart, showtimeDuration, type ShowtimeClip, type ShowtimeProject, type ShowtimeTitle,
} from '@chatter/shared';

export interface ShowtimeSource {
  bytes: Uint8Array;
  mime: string;
}

const RECORDER_MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export function chooseVideoRecorderMime(supports: (mime: string) => boolean = (mime) => MediaRecorder.isTypeSupported(mime)): string {
  return RECORDER_MIMES.find(supports) ?? '';
}

export function canRenderShowtime(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
}

export function drawVideoCover(context: CanvasRenderingContext2D, source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, opacity = 1): void {
  const scale = Math.max(width / sourceWidth, height / sourceHeight); const drawnWidth = sourceWidth * scale; const drawnHeight = sourceHeight * scale;
  context.save(); context.globalAlpha = opacity; context.drawImage(source, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight); context.restore();
}

export function paintShowtimeTitle(context: CanvasRenderingContext2D, title: ShowtimeTitle, width: number, height: number): void {
  const middle = title.position === 'TOP' ? height * .14 : title.position === 'MIDDLE' ? height * .5 : height * .82;
  const boxWidth = Math.min(width * .88, Math.max(width * .38, title.text.length * width * .024)); const boxHeight = title.subtext ? height * .15 : height * .1; const left = (width - boxWidth) / 2; const top = middle - boxHeight / 2;
  context.save(); context.fillStyle = title.background; context.beginPath(); context.roundRect(left, top, boxWidth, boxHeight, Math.max(8, height * .018)); context.fill();
  context.fillStyle = title.color; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = `900 ${Math.round(height * .052)}px Nunito, system-ui, sans-serif`; context.fillText(title.text, width / 2, title.subtext ? middle - height * .025 : middle, boxWidth * .9);
  if (title.subtext) { context.font = `800 ${Math.round(height * .025)}px Nunito, system-ui, sans-serif`; context.fillText(title.subtext, width / 2, middle + height * .038, boxWidth * .9); }
  context.restore();
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => { const done = () => { cleanup(); resolve(); }; const fail = () => { cleanup(); reject(new Error('A source video could not be opened.')); }; const cleanup = () => { target.removeEventListener(event, done); target.removeEventListener('error', fail); }; target.addEventListener(event, done, { once: true }); target.addEventListener('error', fail, { once: true }); });
}

export function showtimeRenderStack(project: ShowtimeProject, atSequenceSec: number): ShowtimeClip[] {
  const normalized = normalizeShowtimeProject(project); const tracks = new Map(normalized.tracks?.map((track) => [track.id, track]));
  return showtimeActiveClips(normalized, atSequenceSec).filter((clip) => clip.mediaKind !== 'AUDIO' && !tracks.get(clip.trackId ?? 'v1')?.hidden)
    .sort((a, b) => {
      const roleA = tracks.get(a.trackId ?? 'v1')?.role; const roleB = tracks.get(b.trackId ?? 'v1')?.role;
      if (roleA === 'PRIMARY' && roleB !== 'PRIMARY') return -1; if (roleB === 'PRIMARY' && roleA !== 'PRIMARY') return 1;
      return (tracks.get(b.trackId ?? 'v1')?.order ?? 0) - (tracks.get(a.trackId ?? 'v1')?.order ?? 0);
    });
}

export function showtimeGainAt(project: ShowtimeProject, clip: ShowtimeClip, atSequenceSec: number): number {
  const track = project.tracks?.find((item) => item.id === (clip.trackId ?? 'v1')); if (clip.muted || track?.muted) return 0;
  const start = showtimeClipStart(project, clip); const end = showtimeClipEnd(project, clip); const local = atSequenceSec - start;
  if (local < 0 || atSequenceSec >= end) return 0;
  const fadeIn = clip.fadeInSec ? Math.min(1, local / clip.fadeInSec) : 1; const fadeOut = clip.fadeOutSec ? Math.min(1, (end - atSequenceSec) / clip.fadeOutSec) : 1;
  return Math.max(0, Math.min(1.5, clip.volume * (track?.volume ?? 1) * fadeIn * fadeOut));
}

function drawShowtimeClip(context: CanvasRenderingContext2D, video: HTMLVideoElement, clip: ShowtimeClip, width: number, height: number, opacity = 1): void {
  const sourceWidth = video.videoWidth || width; const sourceHeight = video.videoHeight || height;
  const base = clip.fit === 'CONTAIN' ? Math.min(width / sourceWidth, height / sourceHeight) : Math.max(width / sourceWidth, height / sourceHeight);
  const scale = base * (clip.scale ?? 1); const drawnWidth = sourceWidth * scale; const drawnHeight = sourceHeight * scale;
  const x = (width - drawnWidth) / 2 + (clip.positionX ?? 0) * width * .5; const y = (height - drawnHeight) / 2 + (clip.positionY ?? 0) * height * .5;
  context.save(); context.globalAlpha = (clip.opacity ?? 1) * opacity; context.drawImage(video, x, y, drawnWidth, drawnHeight); context.restore();
}

/** Real-time render preserves source audio while the canvas supplies edits, titles, and transitions. */
export async function renderShowtimeSequence(options: { project: ShowtimeProject; sources: Map<string, ShowtimeSource>; onProgress?: (fraction: number) => void }): Promise<Blob> {
  if (!canRenderShowtime()) throw new Error('This browser cannot render a Showtime video. Use a current Chrome or Edge.');
  const project = normalizeShowtimeProject(options.project); const totalDuration = showtimeDuration(project); if (!project.clips.length || totalDuration <= 0) throw new Error('Add a shot to the timeline before exporting.');
  const canvas = document.createElement('canvas'); canvas.width = project.width; canvas.height = project.height; const context = canvas.getContext('2d'); if (!context) throw new Error('The video canvas could not start.');
  const audio = new AudioContext(); const destination = audio.createMediaStreamDestination(); const urls = new Map<string, string>();
  const media = new Map<string, { element: HTMLMediaElement; video?: HTMLVideoElement; gain: GainNode }>();
  const stream = canvas.captureStream(30); destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  const mimeType = chooseVideoRecorderMime(); const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: project.format === 'WIDE' ? 5_000_000 : 4_000_000, audioBitsPerSecond: 160_000 } : undefined); const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error('The browser stopped the video render.')); });
  try {
    for (const clip of project.clips) {
      const source = options.sources.get(clip.assetId); if (!source) throw new Error(`${clip.name} is missing from this computer.`);
      let url = urls.get(clip.assetId); if (!url) { url = URL.createObjectURL(new Blob([source.bytes as unknown as BlobPart], { type: source.mime })); urls.set(clip.assetId, url); }
      const element = clip.mediaKind === 'AUDIO' ? document.createElement('audio') : document.createElement('video'); element.preload = 'auto'; element.src = url;
      if (element instanceof HTMLVideoElement) element.playsInline = true; await once(element, 'loadedmetadata'); element.playbackRate = clip.speed;
      if (clip.trimInSec > .005) { element.currentTime = clip.trimInSec; await once(element, 'seeked'); }
      const gain = audio.createGain(); gain.gain.value = 0; audio.createMediaElementSource(element).connect(gain).connect(destination); media.set(clip.id, { element, ...(element instanceof HTMLVideoElement ? { video: element } : {}), gain });
    }

    await audio.resume(); recorder.start(250); const began = performance.now();
    await new Promise<void>((resolve) => {
      const paint = (now: number) => {
        const at = Math.min(totalDuration, (now - began) / 1000); context.fillStyle = '#09070d'; context.fillRect(0, 0, project.width, project.height);
        for (const clip of project.clips) {
          const item = media.get(clip.id); if (!item) continue; const active = at >= showtimeClipStart(project, clip) && at < showtimeClipEnd(project, clip);
          if (!active) { item.gain.gain.value = 0; item.element.pause(); continue; }
          const wanted = clip.trimInSec + (at - showtimeClipStart(project, clip)) * clip.speed; if (Math.abs(item.element.currentTime - wanted) > .22) item.element.currentTime = wanted;
          item.element.playbackRate = clip.speed; item.gain.gain.value = showtimeGainAt(project, clip, at); if (item.element.paused) void item.element.play().catch(() => undefined);
        }

        for (const clip of showtimeRenderStack(project, at)) {
          const video = media.get(clip.id)?.video; if (!video || video.readyState < 2) continue; const local = at - showtimeClipStart(project, clip); let opacity = 1;
          if (clip.trackId === 'v1' && clip.transition !== 'CUT' && clip.transitionSec > 0 && local < clip.transitionSec) {
            const progress = Math.max(0, Math.min(1, local / clip.transitionSec)); opacity = clip.transition === 'DIP_BLACK' ? Math.max(0, (progress - .5) * 2) : progress;
          }
          drawShowtimeClip(context, video, clip, project.width, project.height, opacity);
        }
        project.titles.filter((title) => at >= title.startSec && at <= title.endSec).forEach((title) => paintShowtimeTitle(context, title, project.width, project.height)); options.onProgress?.(Math.min(1, at / totalDuration));
        if (at >= totalDuration) { for (const item of media.values()) item.element.pause(); resolve(); } else requestAnimationFrame(paint);
      };
      requestAnimationFrame(paint);
    });
    recorder.stop(); await stopped; options.onProgress?.(1); return new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
  } finally {
    if (recorder.state !== 'inactive') recorder.stop(); for (const item of media.values()) { item.element.pause(); item.element.removeAttribute('src'); item.gain.disconnect(); }
    stream.getTracks().forEach((track) => track.stop()); await audio.close().catch(() => undefined); for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}

export interface ShowtimeVideoMetadata { duration: number; width: number; height: number }

export async function videoBlobMetadata(blob: Blob): Promise<ShowtimeVideoMetadata> {
  const video = document.createElement('video'); const url = URL.createObjectURL(blob); video.preload = 'metadata'; video.src = url;
  try { await once(video, 'loadedmetadata'); return { duration: Number.isFinite(video.duration) ? video.duration : 0, width: video.videoWidth, height: video.videoHeight }; } finally { video.removeAttribute('src'); URL.revokeObjectURL(url); }
}

export async function videoBlobDuration(blob: Blob): Promise<number> { return (await videoBlobMetadata(blob)).duration; }
