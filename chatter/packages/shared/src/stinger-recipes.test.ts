import { describe, expect, it } from 'vitest';
import { createMotionPackage } from './stinger.js';
import { makeMotionRecipeScene, MOTION_RECIPE_FAMILIES } from './stinger-recipes.js';

describe('Stinger creative recipes', () => {
  it('offers nine broadcast jobs with three complete directions each', () => {
    expect(MOTION_RECIPE_FAMILIES).toHaveLength(9);
    for (const family of MOTION_RECIPE_FAMILIES) {
      expect(family.job.length).toBeGreaterThan(8);
      expect(family.directions).toHaveLength(3);
    }
  });

  it('builds the scene types each broadcast job needs', () => {
    expect(createMotionPackage('morning-news').scenes.map((scene) => scene.kind)).toEqual(expect.arrayContaining(['OPEN', 'HEADLINE', 'LOWER_THIRD', 'END']));
    expect(createMotionPackage('sports-scoreboard').scenes.some((scene) => scene.kind === 'STAT')).toBe(true);
    expect(createMotionPackage('student-spotlight').scenes.some((scene) => scene.kind === 'QUOTE')).toBe(true);
    expect(createMotionPackage('event-countdown').scenes.some((scene) => scene.kind === 'COMING_UP')).toBe(true);
  });

  it('uses genuinely different geometry for different broadcast jobs', () => {
    const morning = createMotionPackage('morning-news').scenes.find((scene) => scene.kind === 'HEADLINE')!;
    const lab = createMotionPackage('science-lab').scenes.find((scene) => scene.kind === 'HEADLINE')!;
    const geometry = (scene: typeof morning) => scene.elements.map((item) => [item.kind, Math.round(item.x), Math.round(item.y), Math.round(item.width), Math.round(item.height)]);
    expect(geometry(morning)).not.toEqual(geometry(lab));
  });

  it('gives every visual direction its own headline-stage composition', () => {
    const signatures = MOTION_RECIPE_FAMILIES.flatMap((family) => family.directions.map((direction) => {
      const scene = makeMotionRecipeScene(family.id, direction.id, 'HEADLINE');
      return scene.elements.map((item) => [
        item.kind,
        item.role,
        Math.round(item.x),
        Math.round(item.y),
        Math.round(item.width),
        Math.round(item.height),
        Math.round(item.rotation),
      ].join(':')).join('|');
    }));

    expect(new Set(signatures).size).toBe(27);
  });

  it('marks authored layers with roles and valid timing', () => {
    for (const family of MOTION_RECIPE_FAMILIES) {
      const project = createMotionPackage(family.id);
      expect(project.creativeRecipe?.familyId).toBe(family.id);
      for (const scene of project.scenes) {
        expect(scene.elements.some((item) => item.role)).toBe(true);
        expect(scene.elements.every((item) => item.startMs >= 0 && item.endMs <= scene.durationMs && item.endMs > item.startMs)).toBe(true);
      }
    }
  });

  it('keeps generated headline type inside its authored stage', () => {
    for (const family of MOTION_RECIPE_FAMILIES) for (const direction of family.directions) {
      const scene = makeMotionRecipeScene(family.id, direction.id, 'HEADLINE');
      const headline = scene.elements.find((item) => item.role === 'HEADLINE')!;
      expect(headline.fontSize * headline.lineHeight * 3).toBeLessThanOrEqual(headline.height + 1);
    }
  });

  it('keeps every kit scene layered, fitted, and inside the frame', () => {
    const overlapRatio = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => {
      const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      return width * height / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
    };
    for (const family of MOTION_RECIPE_FAMILIES) for (const direction of family.directions) for (const kind of family.sceneKinds) {
      const scene = makeMotionRecipeScene(family.id, direction.id, kind);
      const text = scene.elements.filter((item) => item.kind === 'TEXT' && !item.hidden);
      expect(text.every((item) => item.x >= 0 && item.y >= 0 && item.x + item.width <= 1920 && item.y + item.height <= 1080), `${direction.id}/${kind}: text leaves frame`).toBe(true);
      for (let left = 0; left < text.length; left += 1) for (let right = left + 1; right < text.length; right += 1) {
        expect(overlapRatio(text[left]!, text[right]!), `${direction.id}/${kind}: text collision`).toBeLessThan(.12);
      }
      const firstText = Math.min(...text.map((item) => scene.elements.indexOf(item)));
      expect(scene.elements.slice(firstText).every((item) => item.kind === 'TEXT')).toBe(true);
    }
  });
});
