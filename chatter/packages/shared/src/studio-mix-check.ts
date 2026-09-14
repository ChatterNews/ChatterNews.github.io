import { audibleTracks, type AudioTrack, type GarageProject, type GarageTrackKind } from './garage.js';

export interface GarageMixReading {
  peak: number;
  rms: number;
  activeRms?: number;
  rmsWindows?: number[];
  lowEnergyRatio: number;
  clippedFraction: number;
  trackRms?: Record<string, number>;
  trackPeaks?: Record<string, number>;
  trackClippedFractions?: Record<string, number>;
  trackRmsWindows?: Record<string, number[]>;
}

export type GarageMixCheckId = 'CLIPPING' | 'VOICE_BALANCE' | 'LOW_END';
export type GarageMixCheckStatus = 'PASS' | 'FIX' | 'CHECK' | 'NOT_NEEDED';

export interface GarageMixCheckItem {
  id: GarageMixCheckId;
  label: string;
  status: GarageMixCheckStatus;
  detail: string;
  trackId?: string;
  suggestedTrackKind?: GarageTrackKind;
  meter?: number;
}

function hasMaterial(track: AudioTrack): boolean {
  return track.clips.some((clip) => clip.trimEndSec > clip.trimStartSec);
}

function loudest(tracks: AudioTrack[], reading?: GarageMixReading): AudioTrack | undefined {
  return [...tracks].sort((a, b) => (reading?.trackRms?.[b.id] ?? 0) - (reading?.trackRms?.[a.id] ?? 0))[0];
}

function hottest(tracks: AudioTrack[], reading?: GarageMixReading): AudioTrack | undefined {
  return [...tracks].sort((a, b) => {
    const clipped = (reading?.trackClippedFractions?.[b.id] ?? 0) - (reading?.trackClippedFractions?.[a.id] ?? 0);
    if (clipped) return clipped;
    const peak = (reading?.trackPeaks?.[b.id] ?? 0) - (reading?.trackPeaks?.[a.id] ?? 0);
    if (peak) return peak;
    return (reading?.trackRms?.[b.id] ?? 0) - (reading?.trackRms?.[a.id] ?? 0);
  })[0];
}

function percentile(values: number[], position = .75): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * position))]!;
}

function voiceOverlapLevels(
  reading: GarageMixReading | undefined, voiceId: string, musicId: string,
): { voice: number; music: number } | undefined {
  const voiceWindows = reading?.trackRmsWindows?.[voiceId];
  const musicWindows = reading?.trackRmsWindows?.[musicId];
  if (!voiceWindows?.length || !musicWindows?.length) return undefined;
  const voiceReference = reading?.trackRms?.[voiceId] ?? percentile(voiceWindows.filter((value) => value > .0001));
  const threshold = Math.max(.0001, voiceReference * .15);
  const activeIndices = voiceWindows
    .map((value, index) => ({ value, index }))
    .filter(({ value, index }) => value >= threshold && index < musicWindows.length);
  if (!activeIndices.length) return undefined;
  return {
    voice: percentile(activeIndices.map(({ value }) => value)),
    music: percentile(activeIndices.map(({ index }) => musicWindows[index] ?? 0)),
  };
}

export function checkGarageMix(project: GarageProject, reading?: GarageMixReading): GarageMixCheckItem[] {
  const audible = audibleTracks(project).filter(hasMaterial);
  const voices = audible.filter((track) => track.contentRole === 'VOICE' || (track.kind === 'AUDIO' && !track.contentRole));
  const music = audible.filter((track) => track.contentRole === 'MUSIC' || (!track.contentRole && track.kind !== 'AUDIO'));
  const hottestTrack = hottest(audible, reading);

  const clipping: GarageMixCheckItem = !reading
    ? { id: 'CLIPPING', label: 'Headroom', status: 'CHECK', detail: 'Run Mix Check to measure the loudest moment.' }
    : reading.peak >= .985 || reading.clippedFraction >= .0001
      ? {
        id: 'CLIPPING', label: 'Headroom', status: 'FIX', trackId: hottestTrack?.id,
        detail: `The loudest moment reaches ${Math.round(reading.peak * 100)}%. Turn the loudest track down until the red clears.`,
        meter: reading.peak,
      }
      : {
        id: 'CLIPPING', label: 'Headroom', status: 'PASS',
        detail: `${Math.max(0, Math.round((1 - reading.peak) * 100))}% of peak room remains.`, meter: reading.peak,
      };

  let voiceBalance: GarageMixCheckItem;
  if (!voices.length) {
    voiceBalance = { id: 'VOICE_BALANCE', label: 'Voice', status: 'NOT_NEEDED', detail: 'No voice track is in this mix.' };
  } else if (!music.length) {
    voiceBalance = { id: 'VOICE_BALANCE', label: 'Voice', status: 'PASS', detail: 'The voice is not competing with a music track.' };
  } else {
    const voice = loudest(voices, reading)!;
    const bed = loudest(music, reading)!;
    const overlap = voiceOverlapLevels(reading, voice.id, bed.id);
    const voiceRms = overlap?.voice ?? reading?.trackRms?.[voice.id];
    const musicRms = overlap?.music ?? reading?.trackRms?.[bed.id];
    voiceBalance = voiceRms === undefined || musicRms === undefined
      ? { id: 'VOICE_BALANCE', label: 'Voice', status: 'CHECK', trackId: voice.id, detail: 'Play the loudest section once and make sure every word stays clear.' }
      : voiceRms < musicRms * .8
      ? {
        id: 'VOICE_BALANCE', label: 'Voice', status: 'FIX', trackId: voice.id,
        detail: `${voice.name} sits under ${bed.name}. Bring the voice up or pull the music back.`,
        meter: voiceRms / Math.max(.0001, musicRms),
      }
      : {
        id: 'VOICE_BALANCE', label: 'Voice', status: 'PASS', trackId: voice.id,
        detail: `${voice.name} has room above the music. Listen once for every word.`, meter: 1,
      };
  }

  let lowEnd: GarageMixCheckItem;
  if (!music.length) {
    lowEnd = { id: 'LOW_END', label: 'Low end', status: 'NOT_NEEDED', detail: 'This is a voice-only mix.' };
  } else if (!reading) {
    lowEnd = { id: 'LOW_END', label: 'Low end', status: 'CHECK', detail: 'Run Mix Check to hear whether the bottom feels supported.' };
  } else if (reading.lowEnergyRatio < .06) {
    lowEnd = {
      id: 'LOW_END', label: 'Low end', status: 'FIX', suggestedTrackKind: 'BASS',
      detail: 'The mix is light below the melody. Try a bass part or a kick with more weight.', meter: reading.lowEnergyRatio,
    };
  } else {
    lowEnd = {
      id: 'LOW_END', label: 'Low end', status: 'PASS',
      detail: 'The mix has a steady floor without swallowing the rest.', meter: reading.lowEnergyRatio,
    };
  }

  return [clipping, voiceBalance, lowEnd];
}
