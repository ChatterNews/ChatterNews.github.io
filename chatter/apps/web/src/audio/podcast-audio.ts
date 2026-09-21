import type { PodcastClip, PodcastProject, PodcastVoicePreset } from '@chatter/shared';
import { quieterMicCurves, VOICE_LEVEL_HZ } from './voice-reduction.js';
import type { TakeAudio } from './take-audio.js';

export interface PodcastSource { bytes: Uint8Array; mime: string }
export interface PodcastRenderResult { audio: TakeAudio; estimatedLufs: number; truePeakDb: number; appliedGainDb: number }

export function keptPodcastRanges(clip: PodcastClip): Array<{ start: number; end: number }> {
  const omitted = clip.omittedRanges
    .map((range) => ({ start: Math.max(clip.trimInSec, range.start), end: Math.min(clip.trimOutSec, range.end) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged: typeof omitted = [];
  for (const range of omitted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  const kept: Array<{ start: number; end: number }> = []; let cursor = clip.trimInSec;
  for (const range of merged) { if (range.start > cursor) kept.push({ start: cursor, end: range.start }); cursor = Math.max(cursor, range.end); }
  if (cursor < clip.trimOutSec) kept.push({ start: cursor, end: clip.trimOutSec });
  return kept;
}
function dbGain(db: number) { return Math.pow(10, db / 20); }
function peakDb(value: number) { return value > 0 ? 20 * Math.log10(value) : -96; }

function wireVoicePalette(context: OfflineAudioContext, input: AudioNode, preset: PodcastVoicePreset, amount: number): AudioNode {
  if (preset === 'NATURAL' || amount <= 0) return input;
  const mix = Math.max(0, Math.min(1, amount)); const wet = context.createGain(); const dry = context.createGain(); const sum = context.createGain();
  dry.gain.value = 1 - mix * .72; wet.gain.value = .72 + mix * .28; input.connect(dry); dry.connect(sum);
  const highpass = context.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = preset === 'WARM' ? 65 : preset === 'CHARACTER' ? 180 : 82; highpass.Q.value = .7; input.connect(highpass);
  let tail: AudioNode = highpass;
  if (preset === 'CHARACTER') { const lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 4300; tail.connect(lowpass); tail = lowpass; }
  else {
    const tone = context.createBiquadFilter(); tone.type = preset === 'WARM' ? 'lowshelf' : 'peaking'; tone.frequency.value = preset === 'WARM' ? 180 : preset === 'BRIGHT' ? 3400 : preset === 'CLOSE' ? 900 : 2600; tone.Q.value = preset === 'WARM' ? .7 : 1.1; tone.gain.value = (preset === 'CLEAN' ? 2 : preset === 'CLOSE' ? 1.5 : 4) * mix; tail.connect(tone); tail = tone;
  }
  const compressor = context.createDynamicsCompressor(); compressor.threshold.value = preset === 'CLOSE' ? -30 : -24; compressor.knee.value = 12; compressor.ratio.value = preset === 'CHARACTER' ? 7 : preset === 'CLOSE' ? 5 : 3; compressor.attack.value = .008; compressor.release.value = .16; tail.connect(compressor); compressor.connect(wet); wet.connect(sum); return sum;
}

function voiceWindows(project: PodcastProject): Array<{ start: number; end: number }> {
  const voiceTracks = new Set(project.tracks.filter((track) => track.kind === 'VOICE' && !track.muted).map((track) => track.id));
  return project.clips.filter((clip) => voiceTracks.has(clip.trackId) && !clip.muted).map((clip) => ({ start: clip.startSec, end: clip.startSec + keptPodcastRanges(clip).reduce((sum, range) => sum + range.end - range.start, 0) }));
}

async function decode(context: BaseAudioContext, bytes: Uint8Array): Promise<AudioBuffer> {
  return context.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
}

/** Render every non-destructive edit, palette choice and automatic music duck into one WAV-ready mix. */
export async function renderPodcastMix(project: PodcastProject, sources: Map<string, PodcastSource>, onProgress?: (progress: number) => void): Promise<PodcastRenderResult> {
  const duration = Math.max(1, project.clips.reduce((end, clip) => Math.max(end, clip.startSec + keptPodcastRanges(clip).reduce((sum, range) => sum + range.end - range.start, 0)), 0));
  if (duration > 60 * 60) throw new Error('This cut is longer than one hour. Export it as two parts so the school computer does not run out of memory.');
  const sampleRate = 44_100; const context = new OfflineAudioContext(2, Math.ceil((duration + .25) * sampleRate), sampleRate); const master = context.createGain(); master.connect(context.destination);
  const decoded = new Map<string, AudioBuffer>(); const unique = [...new Set(project.clips.map((clip) => clip.assetId))];
  for (let index = 0; index < unique.length; index++) { const id = unique[index]!; const source = sources.get(id); if (!source) continue; decoded.set(id, await decode(context, source.bytes)); onProgress?.((index + 1) / Math.max(1, unique.length) * .25); }
  const anySolo = project.tracks.some((track) => track.solo);
  const eligible = project.clips.filter(clip => {
    const track = project.tracks.find(t => t.id === clip.trackId);
    return !project.voiceReductionBypassed && clip.reduceWhenQuiet && track?.kind === 'VOICE' && !track.muted && !clip.muted && (!anySolo || track.solo) && decoded.has(clip.assetId);
  });
  const curves = quieterMicCurves(eligible.map(clip => {
    const buffer = decoded.get(clip.assetId)!;
    const levels = new Float32Array(Math.ceil(duration * VOICE_LEVEL_HZ) + 1);
    let timeline = clip.startSec;
    for (const range of keptPodcastRanges(clip)) {
      for (let sourceTime = range.start; sourceTime < range.end; sourceTime += 1 / VOICE_LEVEL_HZ) {
        const from = Math.floor(sourceTime * buffer.sampleRate), to = Math.min(buffer.length, Math.floor(Math.min(range.end, sourceTime + 1 / VOICE_LEVEL_HZ) * buffer.sampleRate));
        let sum = 0, count = 0;
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const samples = buffer.getChannelData(c);
          for (let i = from; i < to; i += 4) { sum += samples[i]! ** 2; count++; }
        }
        const at = Math.floor((timeline + sourceTime - range.start) * VOICE_LEVEL_HZ);
        levels[at] = Math.max(levels[at] ?? 0, Math.sqrt(sum / Math.max(1, count)));
      }
      timeline += range.end - range.start;
    }
    return { id: clip.id, levels };
  }));
  const speaking = voiceWindows(project); let scheduled = 0;
  for (const clip of project.clips) {
    const track = project.tracks.find((item) => item.id === clip.trackId); const buffer = decoded.get(clip.assetId);
    if (!track || !buffer || clip.muted || track.muted || anySolo && !track.solo) continue;
    let offset = clip.startSec; const ranges = keptPodcastRanges(clip);
    for (const range of ranges) {
      const length = range.end - range.start; if (length <= .001) continue;
      const source = context.createBufferSource(); source.buffer = buffer; const clipGain = context.createGain(); const base = dbGain(clip.gainDb + track.volumeDb);
      clipGain.gain.setValueAtTime(0, offset); clipGain.gain.linearRampToValueAtTime(base, offset + Math.min(clip.fadeInSec, length / 2)); clipGain.gain.setValueAtTime(base, Math.max(offset, offset + length - Math.min(clip.fadeOutSec, length / 2))); clipGain.gain.linearRampToValueAtTime(0, offset + length);
      if (track.duckUnderVoice) for (const window of speaking) { const from = Math.max(offset, window.start); const to = Math.min(offset + length, window.end); if (to > from) { clipGain.gain.setValueAtTime(base, Math.max(offset, from - .18)); clipGain.gain.linearRampToValueAtTime(base * .24, from); clipGain.gain.setValueAtTime(base * .24, to); clipGain.gain.linearRampToValueAtTime(base, Math.min(offset + length, to + .28)); } }
      source.connect(clipGain);
      const reduction = context.createGain(); clipGain.connect(reduction);
      const curve = curves.get(clip.id);
      if (curve) {
        reduction.gain.setValueAtTime(curve[Math.floor(offset * VOICE_LEVEL_HZ)] ?? 1, offset);
        for (let i = Math.ceil(offset * VOICE_LEVEL_HZ); i / VOICE_LEVEL_HZ < offset + length; i++) reduction.gain.linearRampToValueAtTime(curve[i] ?? 1, i / VOICE_LEVEL_HZ);
      }
      let tail: AudioNode = reduction; if (track.kind === 'VOICE') tail = wireVoicePalette(context, tail, track.voicePreset, track.effectAmount);
      const pan = context.createStereoPanner(); pan.pan.value = track.pan; tail.connect(pan); pan.connect(master); source.start(offset, range.start, Math.min(length, Math.max(0, buffer.duration - range.start))); offset += length; scheduled++;
    }
  }
  if (!scheduled) throw new Error('The cut has no playable audio. Unmute a clip or add a recording.');
  onProgress?.(.35); const rendered = await context.startRendering(); onProgress?.(.82);
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, index) => rendered.getChannelData(index).slice()); let sum = 0; let count = 0; let peak = 0;
  for (const channel of channels) for (const sample of channel) { sum += sample * sample; count++; peak = Math.max(peak, Math.abs(sample)); }
  const estimated = count ? 20 * Math.log10(Math.max(1e-8, Math.sqrt(sum / count))) : -96; const wanted = project.targetLufs - estimated; const peakLimit = project.truePeakDb - peakDb(peak); const gainDb = Math.max(-18, Math.min(18, wanted, peakLimit)); const gain = dbGain(gainDb);
  let finalPeak = 0; let finalSum = 0;
  for (const channel of channels) for (let index = 0; index < channel.length; index++) { const sample = Math.max(-1, Math.min(1, channel[index]! * gain)); channel[index] = sample; finalPeak = Math.max(finalPeak, Math.abs(sample)); finalSum += sample * sample; }
  const finalLufs = 20 * Math.log10(Math.max(1e-8, Math.sqrt(finalSum / Math.max(1, count)))); onProgress?.(1);
  return { audio: { sampleRate, channels, duration: rendered.duration }, estimatedLufs: finalLufs, truePeakDb: peakDb(finalPeak), appliedGainDb: gainDb };
}
