import { describe, expect, test } from 'vitest';
import { connectShowtimeClip, createShowtimeProject, makeShowtimeClip } from '@chatter/shared';
import { chooseVideoRecorderMime, showtimeGainAt, showtimeRenderStack } from './renderShowtime.js';

describe('Showtime browser export choices', () => {
  test('prefers VP9 with Opus and falls back cleanly', () => {
    expect(chooseVideoRecorderMime(() => true)).toBe('video/webm;codecs=vp9,opus');
    expect(chooseVideoRecorderMime((mime) => mime === 'video/webm')).toBe('video/webm');
    expect(chooseVideoRecorderMime(() => false)).toBe('');
  });

  test('orders the primary picture below connected B-roll for compositing', () => {
    const project = createShowtimeProject();
    const primary = makeShowtimeClip({ assetId: 'a', name: 'Story', durationSec: 5 });
    const overlay = makeShowtimeClip({ assetId: 'b', name: 'B-roll', durationSec: 2 });
    project.clips = [primary];
    const connected = connectShowtimeClip(project, overlay, 'v2', 1);
    expect(showtimeRenderStack(connected, 2).map((clip) => clip.name)).toEqual(['Story', 'B-roll']);
  });

  test('applies clip and track volume with fade handles', () => {
    const project = createShowtimeProject();
    const voice = makeShowtimeClip({ assetId: 'a', name: 'Voice', durationSec: 4, mediaKind: 'AUDIO' });
    voice.trackId = 'a1'; voice.startSec = 2; voice.volume = .8; voice.fadeInSec = 2;
    project.clips = [voice];
    const track = project.tracks?.find((item) => item.id === 'a1')!; track.volume = .5;
    expect(showtimeGainAt(project, voice, 3)).toBeCloseTo(.2);
    track.muted = true;
    expect(showtimeGainAt(project, voice, 3)).toBe(0);
  });
});
