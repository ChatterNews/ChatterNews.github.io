import { expect, test } from 'vitest';
import { createMotionPackage } from './stinger.js';
import { makeVideoGraphic, remapVideoGraphics, isVideoGraphic, videoProjectAssetIds } from './video-graphics.js';
import { createShowtimeProject, insertShowtimePrimary, rippleDeleteShowtimeClip, makeShowtimeClip } from './showtime.js';

test('placing a graphic captures its words, timing and media without changing the kit', () => {
  const kit = createMotionPackage('bulletin', { title: 'School news' });
  const scene = kit.scenes[0]!;
  scene.audioAssetId = 'cue';
  const text = scene.elements.find(element => element.kind === 'TEXT')!;
  text.binding = 'STORY_TITLE'; text.text = 'Old title';
  const placed = makeVideoGraphic(kit, scene.id, 3, { storyTitle: 'New report' });
  expect(placed.startSec).toBe(3);
  expect(placed.endSec).toBe(3 + scene.durationMs / 1000);
  expect(placed.motion!.scenes[0]!.audioAssetId).toBeUndefined();
  expect(placed.motion!.scenes[0]!.elements.find(element => element.id === text.id)?.text).toBe('New report');
  text.text = 'Changed original';
  expect(placed.motion!.scenes[0]!.elements.find(element => element.id === text.id)?.text).toBe('New report');
});

test('graphic images travel with the video and remap on portable import', () => {
  const kit = createMotionPackage('bulletin', { title: 'School news' });
  kit.scenes[0]!.elements[0]!.imageAssetId = 'picture-old';
  const title = makeVideoGraphic(kit, kit.scenes[0]!.id, 4);
  const project = { ...createShowtimeProject(), titles: [title] };
  expect(videoProjectAssetIds(project)).toContain('picture-old');
  project.titles = remapVideoGraphics(project.titles, new Map([['picture-old', 'picture-new']]));
  expect(videoProjectAssetIds(project)).toEqual(['picture-new']);
  expect(title.motion!.scenes[0]!.elements[0]!.imageAssetId).toBe('picture-old');
});

test('inserting footage moves the complete editable graphic with the title track', () => {
  const kit = createMotionPackage('bulletin', { title: 'News' });
  const title = makeVideoGraphic(kit, kit.scenes[0]!.id, 4);
  const project = { ...createShowtimeProject(), titles: [title] };
  const next = insertShowtimePrimary(project, makeShowtimeClip({ assetId: 'shot', name: 'Shot', durationSec: 2 }), 0);
  expect(next.titles[0]!.startSec).toBe(6);
  expect(next.titles[0]!.motion).toEqual(title.motion);
});

test('portable graphics reject broken geometry and missing animation data', () => {
  const kit = createMotionPackage('bulletin', { title: 'News' });
  const title = makeVideoGraphic(kit, kit.scenes[0]!.id, 0);
  expect(isVideoGraphic(title.motion)).toBe(true);
  expect(isVideoGraphic({ ...title.motion, width: 0 })).toBe(false);
  expect(isVideoGraphic({ ...title.motion, scenes: [{}] })).toBe(false);
});

test('ripple deleting earlier footage carries a later graphic back with the story', () => {
  const kit = createMotionPackage('bulletin', { title: 'News' });
  const clip = makeShowtimeClip({ assetId: 'shot', name: 'Shot', durationSec: 2 });
  const title = makeVideoGraphic(kit, kit.scenes[0]!.id, 3);
  const project = { ...createShowtimeProject(), clips: [clip], titles: [title] };
  const next = rippleDeleteShowtimeClip(project, clip.id);
  expect(next.titles[0]!.startSec).toBe(1);
  expect(next.titles[0]!.endSec - next.titles[0]!.startSec).toBeCloseTo(title.endSec - title.startSec);
  expect(next.titles[0]!.motion).toEqual(title.motion);
});
