import type { GarageSamplerSettings } from '@chatter/shared';

export interface SamplerVoicePlan {
  note: number;
  pitchCents: number;
  start: number;
  end: number;
  attackSec: number;
  releaseSec: number;
  gate: 0 | 1 | 2;
}

export function samplerVoicePlan(settings: GarageSamplerSettings): SamplerVoicePlan[] {
  const gate = settings.mode === 'GATE' ? 1 : settings.mode === 'LOOP' ? 2 : 0;
  const attackSec = .001 * Math.pow(5_000, settings.attack);
  const releaseSec = .001 * Math.pow(5_000, settings.release);
  if (settings.layout === 'SLICE') {
    const window = settings.end - settings.start;
    return settings.slicePoints.slice(0, -1).map((point, index) => ({
      note: 36 + index,
      pitchCents: settings.tune * 100,
      start: settings.start + point * window,
      end: settings.start + settings.slicePoints[index + 1]! * window,
      attackSec,
      releaseSec,
      gate,
    }));
  }
  const firstNote = Math.max(0, Math.ceil(settings.rootNote - 12 - settings.tune));
  const lastNote = Math.min(127, Math.floor(settings.rootNote + 12 - settings.tune));
  return Array.from({ length: lastNote - firstNote + 1 }, (_, offset) => {
    const note = firstNote + offset;
    return {
      note,
      pitchCents: (note - settings.rootNote + settings.tune) * 100,
      start: settings.start,
      end: settings.end,
      attackSec,
      releaseSec,
      gate,
    };
  });
}

export function samplerFilterFrequency(amount: number): number {
  const normalized = Math.max(0, Math.min(1, amount));
  return Math.round(180 * Math.pow(20_000 / 180, normalized));
}
