/** Compact, device-independent evidence. No recordings or features leave this browser. */
export interface SpeechFeatures { frames: Float32Array; hz: number }
export interface SyncAnchor { sourceSec: number; referenceSec: number; score: number; margin: number }
export interface ConversationMatch {
  status: 'READY' | 'CHECK'; offsetSec: number; confidence: number;
  driftSec: number; anchors: SyncAnchor[]; reason: string;
}
const FRAME_HZ = 50;

/** Speech-band energy, with a local mean removed to tolerate different mic gains. */
export function speechFeatures(channels: Float32Array[], rate: number): SpeechFeatures {
  const length = Math.min(...channels.map(c => c.length));
  if (!channels.length || !Number.isFinite(rate) || rate < 1000 || !Number.isFinite(length)) return { frames: new Float32Array(), hz: FRAME_HZ };
  const frames = new Float32Array(Math.floor(length / rate * FRAME_HZ));
  const low = new Float64Array(channels.length), high = new Float64Array(channels.length);
  const a = 1 - Math.exp(-2 * Math.PI * 180 / rate), b = 1 - Math.exp(-2 * Math.PI * 3200 / rate);
  let n = 0, energy = 0, count = 0;
  for (let i = 0; i < length && n < frames.length; i++) {
    for (let c = 0; c < channels.length; c++) {
      const sample = Number.isFinite(channels[c]![i]) ? channels[c]![i]! : 0;
      low[c] = low[c]! + a * (sample - low[c]!); high[c] = high[c]! + b * (sample - high[c]!);
      energy += (high[c]! - low[c]!) ** 2; count++;
    }
    if (i + 1 >= (n + 1) * rate / FRAME_HZ) { frames[n++] = Math.log1p(100 * Math.sqrt(energy / Math.max(1, count))); energy = 0; count = 0; }
  }
  const prefix = new Float64Array(frames.length + 1);
  frames.forEach((x, i) => { prefix[i + 1] = prefix[i]! + x; });
  for (let i = 0; i < frames.length; i++) {
    const start = Math.max(0, i - 25), end = Math.min(frames.length, i + 26);
    frames[i] = frames[i]! - (prefix[end]! - prefix[start]!) / (end - start);
  }
  return { frames, hz: FRAME_HZ };
}

function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; }
  }
  for (let width = 2; width <= n; width *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / width, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < n; start += width) {
      let ur = 1, ui = 0;
      for (let j = 0; j < width / 2; j++) {
        const x = start + j, y = x + width / 2;
        const vr = re[y]! * ur - im[y]! * ui, vi = re[y]! * ui + im[y]! * ur;
        re[y] = re[x]! - vr; im[y] = im[x]! - vi; re[x] = re[x]! + vr; im[x] = im[x]! + vi;
        const next = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] = re[i]! / n; im[i] = im[i]! / n; }
}

/** Normalized cross-correlation via FFT: linear in recording length apart from log N. */
function locate(reference: Float32Array, template: Float32Array, hz: number) {
  const m = template.length;
  let mean = 0; for (const v of template) mean += v / m;
  let power = 0; for (const v of template) power += (v - mean) ** 2;
  if (power / m < .0004 || reference.length < m) return undefined;
  let size = 1; while (size < reference.length + m) size *= 2;
  const re = new Float64Array(size), im = new Float64Array(size), tr = new Float64Array(size), ti = new Float64Array(size);
  re.set(reference);
  for (let i = 0; i < m; i++) tr[m - 1 - i] = template[i]! - mean;
  fft(re, im); fft(tr, ti);
  for (let i = 0; i < size; i++) { const real = re[i]! * tr[i]! - im[i]! * ti[i]!; im[i] = re[i]! * ti[i]! + im[i]! * tr[i]!; re[i] = real; }
  fft(re, im, true);
  const scores = new Float64Array(reference.length - m + 1);
  let sum = 0, square = 0, best = -1, at = 0;
  for (let i = 0; i < reference.length; i++) {
    sum += reference[i]!; square += reference[i]! ** 2;
    if (i >= m) { sum -= reference[i - m]!; square -= reference[i - m]! ** 2; }
    if (i < m - 1) continue;
    const variance = Math.max(0, square - sum * sum / m), start = i - m + 1;
    const score = variance / m < .0004 ? 0 : Math.max(-1, Math.min(1, re[i]! / Math.sqrt(power * variance)));
    scores[start] = score;
    if (score > best) { best = score; at = start; }
  }
  let runnerUp = 0;
  for (let i = 0; i < scores.length; i++) if (Math.abs(i - at) > hz) runnerUp = Math.max(runnerUp, scores[i]!);
  return { at, score: best, margin: best - runnerUp };
}

export function matchConversation(reference: SpeechFeatures, source: SpeechFeatures): ConversationMatch {
  const check = (reason: string, anchors: SyncAnchor[] = [], driftSec = 0): ConversationMatch => ({ status: 'CHECK', reason, anchors, driftSec, offsetSec: 0, confidence: 0 });
  if (reference.hz !== source.hz || source.hz !== FRAME_HZ) return check('These recordings could not be compared.');
  if (reference.frames.length > 3600 * FRAME_HZ || source.frames.length > 3600 * FRAME_HZ) return check('Compare recordings of at most one hour.');
  if (Math.min(reference.frames.length, source.frames.length) < 18 * FRAME_HZ) return check('Use at least 18 seconds of shared conversation, or align a shared clap manually.');
  const width = 6 * FRAME_HZ, anchors: SyncAnchor[] = [];
  for (let i = 0; i < 5; i++) {
    const start = Math.round((source.frames.length - width) * (.05 + i * .225));
    const result = locate(reference.frames, source.frames.slice(start, start + width), FRAME_HZ);
    if (result && result.score >= .6 && result.margin >= .08) anchors.push({ sourceSec: (start + width / 2) / FRAME_HZ, referenceSec: (result.at + width / 2) / FRAME_HZ, score: result.score, margin: result.margin });
  }
  if (anchors.length < 3) return check('Not enough distinctive shared sound. Use the shared-clap controls or choose a clearer reference.', anchors);
  const x = anchors.reduce((s, p) => s + p.sourceSec, 0) / anchors.length;
  const y = anchors.reduce((s, p) => s + p.referenceSec - p.sourceSec, 0) / anchors.length;
  const xx = anchors.reduce((s, p) => s + (p.sourceSec - x) ** 2, 0);
  const slope = anchors.reduce((s, p) => s + (p.sourceSec - x) * (p.referenceSec - p.sourceSec - y), 0) / xx;
  const residual = Math.max(...anchors.map(p => Math.abs(p.referenceSec - p.sourceSec - y - slope * (p.sourceSec - x))));
  const span = anchors.at(-1)!.sourceSec - anchors[0]!.sourceSec;
  const drift = slope * span;
  if (span < 10 || residual > .06) return check('The matches disagree. The recording may contain a pause, edit, or repeated sound; align it manually.', anchors, drift);
  if (Math.abs(drift) > .08) return check('Timing changes across this recording. Split it into shorter sections and use shared cues; automatic alignment would leave drift.', anchors, drift);
  return { status: 'READY', offsetSec: y, confidence: anchors.reduce((s, p) => s + p.score, 0) / anchors.length, driftSec: drift, anchors, reason: `${anchors.length} matching sections agree. Listen near the beginning and end before keeping this alignment.` };
}
