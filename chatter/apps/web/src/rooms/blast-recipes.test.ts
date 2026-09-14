import { describe, expect, it } from 'vitest';
import { BLAST_RECIPE_FAMILIES, buildBlastRecipe, remixBlastRecipe } from './blast-recipes.js';

describe('Blast creative recipes', () => {
  it('offers ten school publishing jobs with three authored directions each', () => {
    expect(BLAST_RECIPE_FAMILIES).toHaveLength(10);
    for (const family of BLAST_RECIPE_FAMILIES) {
      expect(family.job.length).toBeGreaterThan(8);
      expect(family.audience.length).toBeGreaterThan(3);
      expect(family.bestFor.length).toBeGreaterThan(8);
      expect(family.directions).toHaveLength(3);
      expect(new Set(family.directions.map((direction) => direction.id)).size).toBe(3);
    }
  });

  it('builds every direction with semantic, editable content', () => {
    for (const family of BLAST_RECIPE_FAMILIES) {
      for (const direction of family.directions) {
        const project = buildBlastRecipe(family.id, direction.id);
        expect(project.creativeRecipe).toMatchObject({ familyId: family.id, directionId: direction.id, mode: 'GUIDED' });
        expect(project.pages.length).toBeGreaterThan(0);
        const elements = project.pages.flatMap((page) => page.elements);
        expect(elements.some((item) => item.role === 'HEADLINE')).toBe(true);
        expect(elements.some((item) => item.role === 'BODY')).toBe(true);
        expect(elements.every((item) => item.width > 0 && item.height > 0)).toBe(true);
        expect(new Set(elements.map((item) => item.id)).size).toBe(elements.length);
        expect(elements.map((item) => item.text).join(' ')).not.toContain('The story starts here');
        expect(elements.filter((item) => item.kind === 'SHAPE').every((item) => !item.locked)).toBe(true);
      }
    }
  });

  it('gives every visual direction its own first-page composition', () => {
    const signatures = BLAST_RECIPE_FAMILIES.flatMap((family) => family.directions.map((direction) => {
      const page = buildBlastRecipe(family.id, direction.id).pages[0]!;
      return page.elements.map((item) => [
        item.kind,
        item.role,
        Math.round(item.x),
        Math.round(item.y),
        Math.round(item.width),
        Math.round(item.height),
        Math.round(item.rotation),
      ].join(':')).join('|');
    }));

    expect(new Set(signatures).size).toBe(30);
  });

  it('remixes structure while preserving student words by semantic role', () => {
    const project = buildBlastRecipe('science-showcase', 'field-notes');
    const headline = project.pages.flatMap((page) => page.elements).find((item) => item.role === 'HEADLINE')!;
    headline.text = 'Our turbine powered three classroom lights';
    const remixed = remixBlastRecipe(project, 'blueprint');
    expect(remixed.creativeRecipe?.directionId).toBe('blueprint');
    expect(remixed.pages.flatMap((page) => page.elements).find((item) => item.role === 'HEADLINE')?.text).toBe('Our turbine powered three classroom lights');
  });

  it('keeps unused starter copy available without crowding a direction', () => {
    const project = buildBlastRecipe('photo-story', 'cut-and-paste');
    const firstPage = project.pages[0]!;
    expect(firstPage.elements.some((item) => item.role === 'DATE' && item.hidden)).toBe(true);
    expect(firstPage.elements.some((item) => item.role === 'HEADLINE' && !item.hidden)).toBe(true);
    expect(firstPage.elements.some((item) => item.role === 'PHOTO' && !item.hidden)).toBe(true);
  });

  it('keeps every visible starter line fitted and out of other text', () => {
    const overlapRatio = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => {
      const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      return width * height / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
    };
    for (const family of BLAST_RECIPE_FAMILIES) for (const direction of family.directions) {
      const page = buildBlastRecipe(family.id, direction.id).pages[0]!;
      const visibleText = page.elements.filter((item) => item.kind === 'TEXT' && !item.hidden);
      for (let left = 0; left < visibleText.length; left += 1) for (let right = left + 1; right < visibleText.length; right += 1) {
        expect(overlapRatio(visibleText[left]!, visibleText[right]!), `${direction.id}: ${visibleText[left]!.role} overlaps ${visibleText[right]!.role}`).toBeLessThan(.12);
      }
      for (const item of visibleText) {
        const charsPerLine = Math.max(1, Math.floor(item.width / (item.fontSize * .58)));
        const estimatedLines = (item.text ?? '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
        const availableLines = Math.max(1, Math.floor(item.height / (item.fontSize * item.lineHeight)));
        expect(availableLines, `${direction.id}: ${item.role} needs about ${estimatedLines} lines`).toBeGreaterThanOrEqual(estimatedLines);
      }
      const highestText = Math.min(...visibleText.map((item) => page.elements.indexOf(item)));
      expect(page.elements.slice(highestText).every((item) => item.kind === 'TEXT')).toBe(true);
    }
  });

  it('places real starter details into the chosen composition', () => {
    const project = buildBlastRecipe('event-poster', 'marquee', { slotValues: { headline: 'Families build the future', date: 'Thursday · 6 PM · Maker Lab' } });
    const words = project.pages.flatMap((page) => page.elements).map((item) => item.text);
    expect(words).toContain('Families build the future');
    expect(words).toContain('Thursday · 6 PM · Maker Lab');
  });
});
