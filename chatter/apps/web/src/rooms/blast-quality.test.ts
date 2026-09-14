import { describe, expect, it } from 'vitest';
import { BLAST_RECIPE_FAMILIES, buildBlastRecipe } from './blast-recipes.js';
import { checkBlastProject } from './blast-quality.js';

describe('Blast Ready Check', () => {
  it('points to untouched starter copy', () => {
    const project = buildBlastRecipe('event-poster', 'marquee');
    const headline = project.pages[0]!.elements.find((item) => item.role === 'HEADLINE')!;
    headline.text = 'The story starts here';
    expect(checkBlastProject(project).find((item) => item.code === 'starter-copy')).toMatchObject({ elementId: headline.id, severity: 'BLOCKING' });
  });

  it('catches low contrast, tiny type, outside layers, and missing photos', () => {
    const project = buildBlastRecipe('event-poster', 'marquee');
    const headline = project.pages[0]!.elements.find((item) => item.role === 'HEADLINE')!;
    headline.fill = project.pages[0]!.background;
    headline.fontSize = 8;
    headline.x = -20;
    const codes = checkBlastProject(project).map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(['low-contrast', 'tiny-type', 'outside-page', 'empty-image']));
  });

  it('blocks a page with no headline and warns when the layer stack is crowded', () => {
    const project = buildBlastRecipe('event-poster', 'marquee');
    project.pages[0]!.elements = project.pages[0]!.elements.filter((item) => item.role !== 'HEADLINE');
    const visible = project.pages[0]!.elements.find((item) => !item.hidden)!;
    while (project.pages[0]!.elements.filter((item) => !item.hidden).length < 29) project.pages[0]!.elements.push(structuredClone(visible));
    const codes = checkBlastProject(project).map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(['missing-headline', 'crowded-page']));
  });

  it('does not give students a recipe that begins with a blocking press problem', () => {
    for (const family of BLAST_RECIPE_FAMILIES) for (const direction of family.directions) {
      const blocking = checkBlastProject(buildBlastRecipe(family.id, direction.id)).filter((item) => item.severity === 'BLOCKING');
      expect(blocking, `${family.id}/${direction.id}: ${blocking.map((item) => `${item.code}:${item.message}`).join(', ')}`).toEqual([]);
    }
  });
});
