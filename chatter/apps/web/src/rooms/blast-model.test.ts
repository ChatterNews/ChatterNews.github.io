import { describe, expect, test } from 'vitest';
import { BLAST_TEMPLATES, clonePage, editableBlastProject, element, layersForPanel, makeBlankPage, selectedCanvasZIndex } from './blast-model.js';

describe('Blast templates', () => {
  test('every template builds editable pages with unique element ids', () => {
    for (const template of BLAST_TEMPLATES) {
      const project = template.build();
      expect(project.pages.length).toBeGreaterThan(0);
      const ids = project.pages.flatMap((page) => page.elements.map((item) => item.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const page of project.pages) {
        for (const item of page.elements) {
          expect(item.width).toBeGreaterThan(0);
          expect(item.height).toBeGreaterThan(0);
          expect(item.x).toBeGreaterThanOrEqual(0);
          expect(item.y).toBeGreaterThanOrEqual(0);
          if (item.kind === 'SHAPE') expect(item.locked).toBe(false);
        }
      }
    }
  });

  test('the newsletter is a real multi-page document', () => {
    const newsletter = BLAST_TEMPLATES.find((template) => template.id === 'newsroom')!.build();
    expect(newsletter.pages).toHaveLength(2);
    expect(newsletter.pages[0]!.elements.some((item) => item.kind === 'TEXT')).toBe(true);
    expect(newsletter.pages[0]!.elements.some((item) => item.kind === 'IMAGE')).toBe(true);
  });

  test('duplicating a page gives the page and every layer a fresh identity', () => {
    const source = BLAST_TEMPLATES[0]!.build().pages[0]!;
    const duplicate = clonePage(source);
    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.elements.map((item) => item.id)).not.toEqual(source.elements.map((item) => item.id));
  });

  test('a blank page is ready to customize', () => {
    const page = makeBlankPage(3);
    expect(page.name).toBe('Page 3');
    expect(page.background).toBe('#FFFDF7');
    expect(page.elements).toEqual([]);
  });

  test('new layers carry editable professional appearance defaults', () => {
    const shape = element({ kind: 'SHAPE', shape: 'TRIANGLE', x: 10, y: 20, width: 200, height: 180 });
    expect(shape.shape).toBe('TRIANGLE');
    expect(shape.fillType).toBe('SOLID');
    expect(shape.strokeStyle).toBe('SOLID');
    expect(shape.shadowBlur).toBe(0);
    expect(shape.blendMode).toBe('normal');
  });

  test('rich text and object effects survive page duplication', () => {
    const source = makeBlankPage(1);
    source.elements.push(element({
      kind: 'TEXT', x: 20, y: 20, width: 300, height: 80, text: 'Big news',
      richText: '<b>Big</b> <u>news</u>', shadowX: 6, shadowY: 8, shadowBlur: 10,
    }));
    const duplicate = clonePage(source);
    expect(duplicate.elements[0]!.richText).toBe('<b>Big</b> <u>news</u>');
    expect(duplicate.elements[0]!.shadowBlur).toBe(10);
  });

  test('guided layouts keep template-owned layers in the Layers panel', () => {
    const templateShape = element({ kind: 'SHAPE', x: 0, y: 0, width: 200, height: 80, name: 'Signal band', recipeOwned: true });
    const studentText = element({ kind: 'TEXT', x: 20, y: 20, width: 160, height: 40, name: 'Headline', recipeOwned: false });

    expect(layersForPanel([templateShape, studentText], 'GUIDED').map((item) => item.name))
      .toEqual(['Headline', 'Signal band']);
  });

  test('the selected canvas layer rises above neighboring artwork while its handles are in use', () => {
    expect(selectedCanvasZIndex(true)).toBe(1000);
    expect(selectedCanvasZIndex(false)).toBeUndefined();
  });

  test('opening a saved recipe unlocks its old template shapes', () => {
    const project = BLAST_TEMPLATES[0]!.build();
    const shape = project.pages[0]!.elements.find((item) => item.kind === 'SHAPE')!;
    shape.recipeOwned = true;
    shape.locked = true;

    const opened = editableBlastProject(project);

    expect(opened.pages[0]!.elements.find((item) => item.id === shape.id)?.locked).toBe(false);
  });

  test('repairs old starter-template locks without unlocking a student lock', () => {
    const project = BLAST_TEMPLATES[0]!.build();
    const templateBand = project.pages[0]!.elements.find((item) => item.name === 'Top color band')!;
    templateBand.locked = true;
    const studentShape = element({ kind: 'SHAPE', name: 'My locked sticker', x: 20, y: 20, width: 80, height: 80, locked: true });
    project.pages[0]!.elements.push(studentShape);

    const opened = editableBlastProject(project);

    expect(opened.pages[0]!.elements.find((item) => item.id === templateBand.id)?.locked).toBe(false);
    expect(opened.pages[0]!.elements.find((item) => item.id === studentShape.id)?.locked).toBe(true);
  });
});
