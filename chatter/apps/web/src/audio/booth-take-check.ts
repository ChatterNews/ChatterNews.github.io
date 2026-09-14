import type { BoothPerformanceMode } from '@chatter/shared';
import type { TakeAudio } from './take-audio.js';

export interface BoothPerformanceModeGuide {
  id: BoothPerformanceMode;
  label: string;
  shortLabel: string;
  use: string;
  direction: string;
  cues: readonly [string, string, string];
  pace: readonly [number, number];
  maxPauseSec: number;
  slateLine: string;
}

export const BOOTH_PERFORMANCE_MODES: readonly BoothPerformanceModeGuide[] = [
  {
    id: 'NEWS_READ', label: 'News read', shortLabel: 'NEWS', use: 'Headlines, anchors, and reported scripts',
    direction: 'Clear, steady, and direct. Let important names and numbers land.',
    cues: ['Look up at sentence ends', 'Stress the key fact', 'Pause between ideas'], pace: [115, 170], maxPauseSec: 1.6,
    slateLine: 'Story title, your name, then “news read.”',
  },
  {
    id: 'INTERVIEW_ANSWER', label: 'Interview answer', shortLabel: 'INTERVIEW', use: 'Answers, reactions, and eyewitness clips',
    direction: 'Answer first, then give one concrete detail. Sound like yourself.',
    cues: ['Restate the question', 'Give one example', 'Finish the thought'], pace: [90, 190], maxPauseSec: 2.5,
    slateLine: 'Story title, your name, then “interview answer.”',
  },
  {
    id: 'NARRATION', label: 'Narration', shortLabel: 'NARRATION', use: 'Voice-over, explainers, and scene setting',
    direction: 'Paint the picture without rushing it. Leave room for the images.',
    cues: ['Name what we cannot see', 'Change pace with the scene', 'End cleanly'], pace: [90, 155], maxPauseSec: 2,
    slateLine: 'Story title, your name, then “narration.”',
  },
  {
    id: 'PODCAST_CONVERSATION', label: 'Podcast conversation', shortLabel: 'PODCAST', use: 'Chatterbox chats, roundtables, and co-host links',
    direction: 'Stay close to the mic, respond to the other person, and keep the energy natural.',
    cues: ['Leave space for replies', 'React before moving on', 'Keep one mic distance'], pace: [85, 200], maxPauseSec: 3,
    slateLine: 'Show or segment title, your name, then “podcast.”',
  },
] as const;

export interface BoothAudioAnalysis {
  durationSec: number;
  peakDb: number;
  clippedSamples: number;
  sampleCount: number;
  noiseFloorDb: number;
  longestInteriorSilenceSec: number;
}

export interface BoothTakeCheck {
  id: 'LEVEL' | 'ROOM' | 'FLOW' | 'PACE' | 'SLATE';
  label: string;
  status: 'PASS' | 'REVIEW' | 'WAITING';
  reading: string;
  action: string;
}

const toDb = (value: number) => value > 0 ? 20 * Math.log10(value) : -120;
const signed = (value: number) => value > 0 ? `+${value}` : String(value);

export function analyzeBoothAudio(audio: TakeAudio): BoothAudioAnalysis {
  const frames = audio.channels[0]?.length ?? 0;
  if (!frames || !audio.channels.length || !audio.sampleRate) return { durationSec: 0, peakDb: -120, clippedSamples: 0, sampleCount: 0, noiseFloorDb: -120, longestInteriorSilenceSec: 0 };
  const windowFrames = Math.max(1, Math.round(audio.sampleRate * 0.05));
  const windows: number[] = [];
  let peak = 0; let clippedSamples = 0; let sampleCount = 0;
  for (let from = 0; from < frames; from += windowFrames) {
    const to = Math.min(frames, from + windowFrames); let sum = 0; let count = 0;
    for (const channel of audio.channels) for (let index = from; index < to; index++) {
      const sample = Math.abs(channel[index] ?? 0); peak = Math.max(peak, sample); if (sample >= 0.995) clippedSamples += 1;
      sum += sample * sample; count += 1; sampleCount += 1;
    }
    windows.push(Math.sqrt(sum / Math.max(1, count)));
  }

  const edgeCount = Math.max(1, Math.round(0.5 / (windowFrames / audio.sampleRate)));
  const edgeWindows = [...windows.slice(0, edgeCount), ...windows.slice(-edgeCount)].sort((a, b) => a - b);
  const noiseFloor = edgeWindows[Math.floor(edgeWindows.length / 2)] ?? 0;
  const silent = windows.map((rms) => toDb(rms) <= -45);
  let longest = 0; let run = 0;
  for (let index = 0; index < silent.length; index++) {
    if (silent[index]) run += 1;
    else { if (index - run > 0) longest = Math.max(longest, run); run = 0; }
  }
  // Clean handles at the beginning and end are useful and do not count as a stalled read.
  return {
    durationSec: frames / audio.sampleRate,
    peakDb: toDb(peak), clippedSamples, sampleCount, noiseFloorDb: toDb(noiseFloor),
    longestInteriorSilenceSec: longest * windowFrames / audio.sampleRate,
  };
}

export function buildBoothTakeCheck({ analysis, mode, transcriptText, slated }: { analysis: BoothAudioAnalysis; mode: BoothPerformanceMode; transcriptText?: string; slated: boolean }): BoothTakeCheck[] {
  const guide = BOOTH_PERFORMANCE_MODES.find((item) => item.id === mode) ?? BOOTH_PERFORMANCE_MODES[0]!;
  const clipping = analysis.clippedSamples > 0 || analysis.peakDb >= -0.05;
  const tooQuiet = analysis.peakDb < -24;
  const roomNoisy = analysis.noiseFloorDb > -38;
  const longPause = analysis.longestInteriorSilenceSec > guide.maxPauseSec;
  const words = transcriptText?.trim().match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const wpm = analysis.durationSec > 0 ? Math.round(words / analysis.durationSec * 60) : 0;
  const paceReady = words > 0;
  const paceOff = paceReady && (wpm < guide.pace[0] || wpm > guide.pace[1]);

  return [
    {
      id: 'LEVEL', label: 'Level', status: clipping || tooQuiet ? 'REVIEW' : 'PASS',
      reading: clipping ? `${analysis.clippedSamples.toLocaleString()} clipped samples` : `${signed(Math.round(analysis.peakDb))} dB peak`,
      action: clipping ? 'Lower the mic input or move back, then record again. Editing cannot repair clipped words.' : tooQuiet ? 'Move closer to the mic or raise the input before another take.' : 'The loudest words have useful headroom.',
    },
    {
      id: 'ROOM', label: 'Room', status: roomNoisy ? 'REVIEW' : 'PASS', reading: `${signed(Math.round(analysis.noiseFloorDb))} dB quiet floor`,
      action: roomNoisy ? 'Listen to the first and last half-second. Move away from fans or close the door before another take.' : 'The clean handles sound quiet enough for an edit.',
    },
    {
      id: 'FLOW', label: 'Flow', status: longPause ? 'REVIEW' : 'PASS', reading: `${analysis.longestInteriorSilenceSec.toFixed(1)}s longest pause`,
      action: longPause ? `Listen around the long gap. Trim it, mark a pickup, or read that section again.` : `No interior pause runs longer than ${guide.maxPauseSec}s.`,
    },
    {
      id: 'PACE', label: 'Pace', status: !paceReady ? 'WAITING' : paceOff ? 'REVIEW' : 'PASS', reading: paceReady ? `${wpm} words per minute` : 'Transcript needed',
      action: !paceReady ? `Add or generate a transcript to compare this take with the ${guide.pace[0]}–${guide.pace[1]} wpm ${guide.label.toLowerCase()} range.` : paceOff ? `Try the next read inside ${guide.pace[0]}–${guide.pace[1]} wpm, without flattening your delivery.` : `This sits inside the ${guide.label.toLowerCase()} range.`,
    },
    {
      id: 'SLATE', label: 'Slate', status: slated ? 'PASS' : 'REVIEW', reading: slated ? 'Marked as spoken' : 'Not marked',
      action: slated ? 'The take can be identified even before it is renamed.' : `Before the next take, say: ${guide.slateLine}`,
    },
  ];
}
