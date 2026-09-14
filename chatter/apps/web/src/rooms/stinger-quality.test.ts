import { describe, expect, it } from 'vitest';
import { createMotionPackage, MOTION_RECIPE_FAMILIES, remixMotionPackage } from '@chatter/shared';
import { checkMotionPackage } from './stinger-quality.js';

describe('Stinger Ready Check', () => {
  it('finds starter copy, unreadable timing, and low contrast', () => {
    const project = createMotionPackage('morning-news');
    const scene = project.scenes.find((item) => item.kind === 'HEADLINE')!;
    const headline = scene.elements.find((item) => item.role === 'HEADLINE')!;
    headline.text = 'The story starts here';
    headline.binding = 'CUSTOM';
    headline.fill = scene.background;
    headline.endMs = 900;
    const codes = checkMotionPackage(project).map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(['starter-copy', 'low-contrast', 'too-fast']));
  });

  it('finds content beyond title safe and invalid layer timing', () => {
    const project = createMotionPackage('student-spotlight');
    const scene = project.scenes[0]!;
    const headline = scene.elements.find((item) => item.kind === 'TEXT')!;
    headline.x = 0;
    headline.endMs = scene.durationMs + 1;
    const codes = checkMotionPackage(project).map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(['outside-safe-zone', 'timing-outside-scene']));
  });

  it('warns when three loud entrances compete at once', () => {
    const project = createMotionPackage('science-lab');
    const scene = project.scenes[0]!;
    scene.elements.slice(0, 3).forEach((item) => { item.enter = 'POP'; item.startMs = 0; });
    expect(checkMotionPackage(project).some((item) => item.code === 'motion-clash')).toBe(true);
  });

  it('does not hand students a kit with a blocking signal problem', () => {
    for (const family of MOTION_RECIPE_FAMILIES) for (const direction of family.directions) {
      const base = createMotionPackage(family.id);
      base.creativeRecipe!.directionId = direction.id;
      const project = direction.id === family.directions[0].id ? base : remixMotionPackage(base, direction.id);
      const blocking = checkMotionPackage(project).filter((item) => item.severity === 'BLOCKING');
      expect(blocking, `${family.id}/${direction.id}: ${blocking.map((item) => `${item.code}:${item.message}`).join(', ')}`).toEqual([]);
    }
  });
});
