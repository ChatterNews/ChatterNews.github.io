import { describe, expect, test } from 'vitest';
import { advanceMotionPlayhead, captionAt, captionLines, clipWindow, cloneMotionScene, createMotionPackage, motionFrameState, resizeMotionPackage, resolveMotionText, retimeMotionScene, templateData, validateMotionPackage } from './stinger.js';
import type { TranscriptSegment } from './transcribe.js';

const SEGMENTS: TranscriptSegment[] = [
  { start: 0, end: 2.5, text: 'Starting Monday the cafeteria' },
  { start: 2.5, end: 5, text: 'is adding a taco bar' },
  { start: 5, end: 8, text: 'on Wednesdays' },
];

describe('captionAt - the words on screen right now', () => {
  test('finds the line being spoken', () => {
    expect(captionAt(SEGMENTS, 3)!.text).toBe('is adding a taco bar');
  });

  test('the boundary belongs to the line starting there', () => {
    expect(captionAt(SEGMENTS, 2.5)!.text).toBe('is adding a taco bar');
  });

  test('is nothing before the first word', () => {
    expect(captionAt([{ start: 1, end: 2, text: 'late' }], 0)).toBeUndefined();
  });

  test('is nothing after the last word', () => {
    expect(captionAt(SEGMENTS, 99)).toBeUndefined();
  });
});

describe('captionLines - wrapping for a phone screen', () => {
  test('keeps a short line on one line', () => {
    expect(captionLines('taco bar', 20)).toEqual(['taco bar']);
  });

  test('breaks a long line between words, never inside one', () => {
    const lines = captionLines('the pasta line was the least picked thing', 16);
    expect(lines.every((l) => l.length <= 16)).toBe(true);
    expect(lines.join(' ')).toBe('the pasta line was the least picked thing');
  });

  test('a single word longer than the line still comes out', () => {
    expect(captionLines('extraordinarily', 5)).toEqual(['extraordinarily']);
  });

  test('empty text is no lines at all', () => {
    expect(captionLines('   ', 20)).toEqual([]);
  });
});

describe('clipWindow - picking the bit to cut', () => {
  test('a clip starts where the chosen line starts', () => {
    expect(clipWindow(SEGMENTS, 1, 45).start).toBe(2.5);
  });

  test('runs to the end of the tape when the tape is short', () => {
    expect(clipWindow(SEGMENTS, 0, 45).end).toBe(8);
  });

  test('is capped at the length a social clip is allowed to be', () => {
    const long: TranscriptSegment[] = [{ start: 0, end: 300, text: 'a very long take' }];
    expect(clipWindow(long, 0, 45).end).toBe(45);
  });

  test('an empty transcript gives an empty window rather than NaN', () => {
    expect(clipWindow([], 0, 45)).toEqual({ start: 0, end: 0 });
  });
});

describe('templateData - templates render from Story data', () => {
  test('a name bar carries the byline, never a legal name', () => {
    const data = templateData('name-bar', {
      title: 'Taco bar', penName: 'Maya R.', gradeBand: '6th grade',
    });
    expect(data.lines).toEqual(['Maya R.', '6th grade']);
  });

  test('a topic bar carries the headline', () => {
    const data = templateData('topic-bar', { title: 'Taco bar starts Monday', kicker: 'Cafeteria' });
    expect(data.lines).toEqual(['Taco bar starts Monday', 'Cafeteria']);
  });

  test('an ending card needs no story at all', () => {
    expect(templateData('ending-card', {}).lines).toEqual(['THE END']);
  });

  test('a missing field does not put "undefined" on screen', () => {
    const data = templateData('name-bar', { penName: 'Maya R.' });
    expect(data.lines.join(' ')).not.toMatch(/undefined/);
  });
});

describe('Stinger show packages', () => {
  test('a template is a reusable family of broadcast scenes', () => {
    const project = createMotionPackage('bulletin', { title: 'Friday show' });
    expect(project.scenes.map((scene) => scene.kind)).toEqual(['OPEN', 'HEADLINE', 'LOWER_THIRD', 'TRANSITION', 'END']);
    expect(project.scenes.every((scene) => scene.elements.length > 0)).toBe(true);
    expect(validateMotionPackage(project)).toEqual([]);
  });

  test('story binding changes the words without rebuilding the graphic', () => {
    const item = createMotionPackage('clean-desk').scenes[1]!.elements.find((element) => element.name === 'Headline')!;
    expect(resolveMotionText(item, { storyTitle: 'Robotics team reaches state' })).toBe('Robotics team reaches state');
    expect(resolveMotionText(item, { storyTitle: 'New lunch menu Monday' })).toBe('New lunch menu Monday');
  });

  test('the frame evaluator is deterministic and seekable', () => {
    const scene = createMotionPackage('yearbook-pop').scenes[0]!;
    const item = scene.elements.find((element) => element.kind === 'TEXT')!;
    expect(motionFrameState(item, 325, scene, { showName: 'Chatter AM' })).toEqual(motionFrameState(item, 325, scene, { showName: 'Chatter AM' }));
    expect(motionFrameState(item, 0, scene).frameOpacity).toBe(0);
    expect(motionFrameState(item, 800, scene).frameOpacity).toBeGreaterThan(.9);
  });

  test('keyframes interpolate from the saved layer state', () => {
    const scene = createMotionPackage('bulletin').scenes[1]!;
    const item = scene.elements[0]!;
    item.enter = 'NONE'; item.exit = 'NONE'; item.x = 0;
    item.keyframes = [{ id: 'a', atMs: 1000, x: 100 }, { id: 'b', atMs: 2000, x: 200 }];
    item.ease = 'LINEAR';
    expect(motionFrameState(item, 1500, scene).frameX).toBe(150);
  });

  test('format changes preserve relative layout and return to wide cleanly', () => {
    const project = createMotionPackage('sports-desk');
    const before = project.scenes[0]!.elements[0]!;
    const vertical = resizeMotionPackage(project, 'VERTICAL');
    const after = vertical.scenes[0]!.elements[0]!;
    expect(after.x / vertical.width).toBeCloseTo(before.x / project.width);
    expect(after.y / vertical.height).toBeCloseTo(before.y / project.height);
    const wideAgain = resizeMotionPackage(vertical, 'WIDE');
    expect(wideAgain.scenes[0]!.elements[0]!.width).toBeCloseTo(before.width);
  });

  test('duplicating a scene never reuses ids or keyframe ids', () => {
    const scene = createMotionPackage('bulletin').scenes[3]!;
    const duplicate = cloneMotionScene(scene);
    expect(duplicate.id).not.toBe(scene.id);
    expect(duplicate.elements[0]!.id).not.toBe(scene.elements[0]!.id);
    expect(duplicate.elements[0]!.keyframes[0]!.id).not.toBe(scene.elements[0]!.keyframes[0]!.id);
  });

  test('invalid layer timing is caught before save or export', () => {
    const project = createMotionPackage('bulletin');
    project.scenes[0]!.elements[0]!.endMs = project.scenes[0]!.durationMs + 1;
    expect(validateMotionPackage(project)[0]).toMatch(/timing/);
  });

  test('shortening a scene scales the whole animation instead of clipping it', () => {
    const scene = createMotionPackage('bulletin').scenes[3]!;
    const beforeDuration = scene.durationMs;
    const beforeFrame = scene.elements[0]!.keyframes.at(-1)!.atMs;
    const next = retimeMotionScene(scene, 2200);
    expect(next.durationMs).toBe(2200);
    expect(next.elements[0]!.keyframes.at(-1)!.atMs).toBeCloseTo(beforeFrame * 2200 / beforeDuration);
    expect(next.elements.every((item) => item.startMs >= 0 && item.endMs <= next.durationMs && item.endMs > item.startMs)).toBe(true);
    expect(next.elements.flatMap((item) => item.keyframes).every((frame) => frame.atMs >= 0 && frame.atMs <= next.durationMs)).toBe(true);
  });

  test('the preview clock is monotonic and stops cleanly at the scene end', () => {
    expect(advanceMotionPlayhead(800, 500, 2200)).toEqual({ atMs: 1300, complete: false });
    expect(advanceMotionPlayhead(800, 1400, 2200)).toEqual({ atMs: 2200, complete: true });
    expect(advanceMotionPlayhead(800, -20, 2200)).toEqual({ atMs: 800, complete: false });
  });
});
