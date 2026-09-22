import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SlateAngleCheck } from './SlateAngleCheck.js';

const change = () => undefined;

describe('Slate project direction', () => {
  it.each([
    ['angle', '>The lunch line </textarea>'],
    ['affected', 'value="The lunch line "'],
    ['verification', 'value="The lunch line "'],
  ])('preserves a just-typed space in the %s field', (field, expected) => {
    const html = renderToStaticMarkup(createElement(SlateAngleCheck, {
      angle: '', affected: '', verification: '', [field]: 'The lunch line ', onChange: change,
    }));
    expect(html).toContain(expected);
  });

  it('keeps whitespace editable without marking an empty answer ready', () => {
    const html = renderToStaticMarkup(createElement(SlateAngleCheck, {
      angle: '  ', affected: ' ', verification: ' ', onChange: change,
    }));
    expect(html).toContain('>  </textarea>');
    expect(html).toContain('aria-label="0 of 3 ready"');
  });

  it('turns a selected project type into a visible example and three production prompts', () => {
    const html = renderToStaticMarkup(createElement(SlateAngleCheck, {
      templateId: 'experiment', angle: '', affected: '', verification: '', onChange: change,
    }));

    expect(html).toContain('The fourth bridge held twice the weight of the first');
    expect(html).toContain('What’s the focus?');
    expect(html).toContain('Who is it for?');
    expect(html).toContain('What can we use?');
    expect(html).toContain('aria-label="0 of 3 ready"');
  });

  it('reports a complete direction without grading the student’s taste', () => {
    const html = renderToStaticMarkup(createElement(SlateAngleCheck, {
      templateId: 'news',
      angle: 'The lunch line now uses two serving tables.',
      affected: 'Students with the shortest lunch period',
      verification: 'Time the wait and check the cafeteria schedule',
      onChange: change,
    }));

    expect(html).toContain('aria-label="3 of 3 ready"');
    expect(html).toContain('The project direction is clear.');
    expect(html).not.toMatch(/bad|weak|score/i);
  });
});
