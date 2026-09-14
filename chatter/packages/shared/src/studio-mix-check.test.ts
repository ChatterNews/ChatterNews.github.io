import { describe, expect, test } from 'vitest';
import { addAudioClip, addTrack, emptyProject, setTrackGain } from './garage.js';
import { checkGarageMix } from './studio-mix-check.js';

function withClip(project: ReturnType<typeof emptyProject>, trackIndex: number, source: 'RECORDING' | 'INSTRUMENT') {
  const track = project.tracks[trackIndex]!;
  return addAudioClip(project, track.id, {
    engineId: `clip-${trackIndex}`, name: `Clip ${trackIndex}`, source,
    startSec: 0, sourceDurationSec: 8,
  });
}

describe('Studio Mix Check', () => {
  test('marks clipping from measured mix audio and points to the hottest peak', () => {
    let project = addTrack(addTrack(emptyProject('song'), 'Voice'), 'Music', 'music', 'KEYS');
    project = withClip(project, 0, 'RECORDING');
    project = withClip(project, 1, 'INSTRUMENT');
    project = setTrackGain(project, project.tracks[1]!.id, 1);

    const clipping = checkGarageMix(project, {
      peak: .999, rms: .22, lowEnergyRatio: .18, clippedFraction: .002,
      trackRms: { [project.tracks[0]!.id]: .3, [project.tracks[1]!.id]: .08 },
      trackPeaks: { [project.tracks[0]!.id]: .75, [project.tracks[1]!.id]: .999 },
      trackClippedFractions: { [project.tracks[0]!.id]: 0, [project.tracks[1]!.id]: .002 },
    }).find((item) => item.id === 'CLIPPING');

    expect(clipping).toMatchObject({ status: 'FIX', trackId: project.tracks[1]!.id });
    expect(clipping?.detail).toMatch(/turn.*down/i);
  });

  test('finds a voice buried under music before export', () => {
    let project = addTrack(addTrack(emptyProject('song'), 'Host'), 'Beat', 'beat', 'DRUMS');
    project = withClip(project, 0, 'RECORDING');
    project = withClip(project, 1, 'INSTRUMENT');
    project = setTrackGain(project, project.tracks[0]!.id, .25);
    project = setTrackGain(project, project.tracks[1]!.id, .9);

    const voice = checkGarageMix(project, {
      peak: .72, rms: .16, lowEnergyRatio: .22, clippedFraction: 0,
      trackRms: { [project.tracks[0]!.id]: .08, [project.tracks[1]!.id]: .2 },
    }).find((item) => item.id === 'VOICE_BALANCE');

    expect(voice).toMatchObject({ status: 'FIX', trackId: project.tracks[0]!.id });
    expect(voice?.detail).toMatch(/voice/i);
  });

  test('compares the music bed only during windows where the voice is active', () => {
    let project = addTrack(addTrack(emptyProject('song'), 'Host'), 'Intro music', 'music', 'KEYS');
    project = withClip(project, 0, 'RECORDING');
    project = withClip(project, 1, 'INSTRUMENT');
    const hostId = project.tracks[0]!.id;
    const musicId = project.tracks[1]!.id;

    const voice = checkGarageMix(project, {
      peak: .8, rms: .2, lowEnergyRatio: .2, clippedFraction: 0,
      trackRms: { [hostId]: .3, [musicId]: .5 },
      trackRmsWindows: {
        [hostId]: [0, 0, .3, .3],
        [musicId]: [.7, .7, .05, .05],
      },
    }).find((item) => item.id === 'VOICE_BALANCE');

    expect(voice).toMatchObject({ status: 'PASS', trackId: hostId });
  });

  test('uses measured low-frequency energy for a music mix', () => {
    let project = addTrack(emptyProject('song'), 'Keys', 'keys', 'KEYS');
    project = withClip(project, 0, 'INSTRUMENT');

    const lowEnd = checkGarageMix(project, {
      peak: .7, rms: .18, lowEnergyRatio: .025, clippedFraction: 0,
    }).find((item) => item.id === 'LOW_END');

    expect(lowEnd).toMatchObject({ status: 'FIX', suggestedTrackKind: 'BASS' });
  });

  test('asks for a measured pass when the mix has not been heard yet', () => {
    let project = addTrack(emptyProject('song'), 'Keys', 'keys', 'KEYS');
    project = withClip(project, 0, 'INSTRUMENT');
    expect(checkGarageMix(project).map((item) => item.status)).toContain('CHECK');
  });
});
