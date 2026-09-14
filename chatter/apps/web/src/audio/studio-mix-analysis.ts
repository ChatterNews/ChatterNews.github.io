import type { GarageMixReading } from '@chatter/shared';

export function analyzePcmChannels(channels: readonly Float32Array[], sampleRate: number): GarageMixReading {
  const frames = channels[0]?.length ?? 0;
  if (!frames || !channels.length) return { peak: 0, rms: 0, activeRms: 0, rmsWindows: [], lowEnergyRatio: 0, clippedFraction: 0 };
  const alpha = 1 - Math.exp(-2 * Math.PI * 180 / Math.max(1, sampleRate));
  const lowState = new Array(channels.length).fill(0);
  const windowFrames = Math.max(1, Math.round(sampleRate * .1));
  const windows: number[] = [];
  let peak = 0;
  let squares = 0;
  let lowSquares = 0;
  let clipped = 0;
  let count = 0;
  let windowSquares = 0;
  let windowCount = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels.length; channel++) {
      const sample = channels[channel]![frame] ?? 0;
      const absolute = Math.abs(sample);
      peak = Math.max(peak, absolute);
      squares += sample * sample;
      windowSquares += sample * sample;
      windowCount += 1;
      lowState[channel] += alpha * (sample - lowState[channel]);
      lowSquares += lowState[channel] * lowState[channel];
      if (absolute >= .985) clipped += 1;
      count += 1;
    }
    if ((frame + 1) % windowFrames === 0 || frame === frames - 1) {
      windows.push(Math.sqrt(windowSquares / Math.max(1, windowCount)));
      windowSquares = 0;
      windowCount = 0;
    }
  }
  const rms = Math.sqrt(squares / count);
  const lowRms = Math.sqrt(lowSquares / count);
  return {
    peak,
    rms,
    activeRms: activeWindowRms(windows),
    rmsWindows: windows,
    lowEnergyRatio: rms > 0 ? Math.min(1, lowRms / rms) : 0,
    clippedFraction: clipped / count,
  };
}

function activeWindowRms(windows: number[]): number {
  const audible = windows.filter((value) => value > .0001).sort((a, b) => a - b);
  if (!audible.length) return 0;
  return audible[Math.min(audible.length - 1, Math.floor(audible.length * .75))]!;
}

async function yieldToUi(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function analyzePcmChannelsResponsive(channels: readonly Float32Array[], sampleRate: number): Promise<GarageMixReading> {
  const frames = channels[0]?.length ?? 0;
  if (!frames || !channels.length) return { peak: 0, rms: 0, activeRms: 0, rmsWindows: [], lowEnergyRatio: 0, clippedFraction: 0 };
  const alpha = 1 - Math.exp(-2 * Math.PI * 180 / Math.max(1, sampleRate));
  const lowState = new Array(channels.length).fill(0);
  const windowFrames = Math.max(1, Math.round(sampleRate * .1));
  const windows: number[] = [];
  let peak = 0, squares = 0, lowSquares = 0, clipped = 0, count = 0, windowSquares = 0, windowCount = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels.length; channel++) {
      const sample = channels[channel]![frame] ?? 0;
      const absolute = Math.abs(sample);
      peak = Math.max(peak, absolute);
      squares += sample * sample;
      windowSquares += sample * sample;
      windowCount += 1;
      lowState[channel] += alpha * (sample - lowState[channel]);
      lowSquares += lowState[channel] * lowState[channel];
      if (absolute >= .985) clipped += 1;
      count += 1;
    }
    if ((frame + 1) % windowFrames === 0 || frame === frames - 1) {
      windows.push(Math.sqrt(windowSquares / Math.max(1, windowCount)));
      windowSquares = 0;
      windowCount = 0;
    }
    if (frame > 0 && frame % 250_000 === 0) await yieldToUi();
  }
  const rms = Math.sqrt(squares / count);
  const lowRms = Math.sqrt(lowSquares / count);
  return { peak, rms, activeRms: activeWindowRms(windows), rmsWindows: windows, lowEnergyRatio: rms > 0 ? Math.min(1, lowRms / rms) : 0, clippedFraction: clipped / count };
}

export function summarizeWaveformChannels(channels: readonly Float32Array[], bins = 96): number[] {
  const frames = channels[0]?.length ?? 0;
  if (!frames || !channels.length || bins <= 0) return [];
  return Array.from({ length: bins }, (_, bin) => {
    const from = Math.floor(bin / bins * frames);
    const to = Math.max(from + 1, Math.floor((bin + 1) / bins * frames));
    let peak = 0;
    for (const channel of channels) {
      for (let frame = from; frame < Math.min(to, channel.length); frame++) peak = Math.max(peak, Math.abs(channel[frame]!));
    }
    return peak;
  });
}

export function detectTransientSlices(
  channels: readonly Float32Array[], sampleRate: number, maximumSlices = 16,
): number[] {
  const frames = channels[0]?.length ?? 0;
  if (!frames || !channels.length) return [0, 1];
  const hop = Math.max(64, Math.round(sampleRate * .012));
  const energy: number[] = [];
  for (let from = 0; from < frames; from += hop) {
    let squares = 0;
    let count = 0;
    for (const channel of channels) {
      for (let frame = from; frame < Math.min(frames, from + hop, channel.length); frame++) {
        squares += channel[frame]! * channel[frame]!;
        count += 1;
      }
    }
    energy.push(Math.sqrt(squares / Math.max(1, count)));
  }
  return transientPointsFromEnergy(energy, hop, frames, sampleRate, maximumSlices);
}

export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const context = new AudioContext({ sampleRate: 48_000 });
  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await context.close();
  }
}

export async function analyzeMixBlob(blob: Blob): Promise<GarageMixReading> {
  const buffer = await decodeAudioBlob(blob);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  return channels[0]!.length < 500_000
    ? analyzePcmChannels(channels, buffer.sampleRate)
    : analyzePcmChannelsResponsive(channels, buffer.sampleRate);
}

export async function summarizeAudioBlob(blob: Blob, bins = 96): Promise<{ durationSec: number; waveform: number[]; transientPoints: number[] }> {
  const buffer = await decodeAudioBlob(blob);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  const frames = channels[0]?.length ?? 0;
  const waveform: number[] = [];
  for (let bin = 0; bin < bins; bin++) {
    const from = Math.floor(bin / bins * frames);
    const to = Math.max(from + 1, Math.floor((bin + 1) / bins * frames));
    let peak = 0;
    for (const channel of channels) {
      for (let frame = from; frame < Math.min(to, channel.length); frame++) peak = Math.max(peak, Math.abs(channel[frame]!));
    }
    waveform.push(peak);
    if (bin > 0 && bin % 8 === 0) await yieldToUi();
  }
  const hop = Math.max(64, Math.round(buffer.sampleRate * .012));
  const energy: number[] = [];
  for (let from = 0; from < frames; from += hop) {
    let squares = 0, count = 0;
    for (const channel of channels) for (let frame = from; frame < Math.min(frames, from + hop, channel.length); frame++) {
      squares += channel[frame]! * channel[frame]!;
      count += 1;
    }
    energy.push(Math.sqrt(squares / Math.max(1, count)));
    if (energy.length % 512 === 0) await yieldToUi();
  }
  return {
    durationSec: buffer.duration,
    waveform,
    transientPoints: transientPointsFromEnergy(energy, hop, frames, buffer.sampleRate),
  };
}

function transientPointsFromEnergy(energy: number[], hop: number, frames: number, sampleRate: number, maximumSlices = 16): number[] {
  if (!frames || !energy.length) return [0, 1];
  const flux = energy.map((value, index) => Math.max(0, value - (energy[index - 1] ?? value)));
  const maxFlux = flux.reduce((maximum, value) => Math.max(maximum, value), 0);
  if (maxFlux <= 1e-5) return [0, 1];
  const mean = flux.reduce((total, value) => total + value, 0) / Math.max(1, flux.length);
  const deviation = Math.sqrt(flux.reduce((total, value) => total + (value - mean) ** 2, 0) / Math.max(1, flux.length));
  const threshold = mean + deviation * .75;
  const minimumGap = Math.max(1, Math.round(.065 * sampleRate / hop));
  const candidates = flux.map((strength, index) => ({ strength, index }))
    .filter(({ strength, index }) => strength > 1e-5 && strength >= threshold && strength >= (flux[index - 1] ?? 0) && strength >= (flux[index + 1] ?? 0))
    .sort((a, b) => b.strength - a.strength);
  const chosen: number[] = [];
  for (const candidate of candidates) {
    if (chosen.every((index) => Math.abs(index - candidate.index) >= minimumGap)) chosen.push(candidate.index);
    if (chosen.length >= Math.max(1, maximumSlices - 1)) break;
  }
  return [0, ...chosen.sort((a, b) => a - b).map((index) => Math.min(.995, index * hop / frames)), 1]
    .filter((point, index, points) => index === 0 || point - points[index - 1]! >= .005);
}
