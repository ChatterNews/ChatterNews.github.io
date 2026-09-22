import { expect, test } from 'vitest';
import { createShowtimeProject, makeShowtimeClip, showtimeDuration } from './showtime.js';
import { isVideoGraphic } from './video-graphics.js';
import { withVideoEndCredits } from './video-credits.js';

function video() {
  const project = createShowtimeProject({ title: 'Club report' });
  project.clips = [makeShowtimeClip({ assetId: 'footage', name: 'Report', durationSec: 12 })];
  project.credits = 'Avery — Reporting\nJordan — Camera\nSam — Editing';
  return project;
}

test('credits become an editable closing graphic after the whole project', () => {
  const project = video();
  const next = withVideoEndCredits(project);
  expect(next.credits).toBe(project.credits);
  expect(project.titles).toHaveLength(0);
  const card = next.titles[0]!;
  expect(card.startSec).toBe(12);
  expect(card.endSec).toBeGreaterThan(17);
  expect(card.motion!.scenes[0]!.kind).toBe('END');
  expect(card.motion!.scenes[0]!.elements.find(e => e.name === 'Members and contributions')!.text).toBe(project.credits);
  expect(isVideoGraphic(card.motion)).toBe(true);
});

test('updating credits replaces its cards without duplicating the ending or touching other titles', () => {
  let project = withVideoEndCredits(video());
  const firstId = project.titles[0]!.id;
  project.credits = 'New member — Camera';
  const next = withVideoEndCredits(project);
  expect(next.titles).toHaveLength(1);
  expect(next.titles[0]!.id).toBe(firstId);
  expect(next.titles[0]!.startSec).toBe(12);
  expect(next.titles[0]!.projectCredits).toBe('New member — Camera');
  expect(project.titles[0]!.projectCredits).toContain('Avery');
  expect(showtimeDuration(next)).toBeLessThan(25);
});

test.each(['WIDE', 'VERTICAL', 'SQUARE'] as const)('a large crew paginates without losing names in %s', format => {
  const project = createShowtimeProject({ format });
  project.credits = Array.from({ length: 35 }, (_, i) => `Member ${i + 1} — Reporting`).join('\n');
  const next = withVideoEndCredits(project);
  expect(next.titles.length).toBeGreaterThan(1);
  const words = next.titles.map(t => t.motion!.scenes[0]!.elements.find(e => e.name === 'Members and contributions')!.text).join('\n');
  expect(words).toBe(project.credits);
  next.titles.forEach((card, i) => {
    expect(isVideoGraphic(card.motion)).toBe(true);
    expect(card.motion!.width).toBe(project.width);
    expect(card.startSec).toBe(i ? next.titles[i - 1]!.endSec : 0);
  });
});

test('empty credits cannot replace a saved credits sequence', () => {
  const project = withVideoEndCredits(video());
  project.credits = ' \n ';
  expect(() => withVideoEndCredits(project)).toThrow('Add the members');
  expect(project.titles).toHaveLength(1);
});

test('long credit entries wrap without discarding their letters', () => {
  const project = video();
  project.credits = 'A'.repeat(320);
  const next = withVideoEndCredits(project);
  const displayed = next.titles.map(t => t.motion!.scenes[0]!.elements.find(e => e.name === 'Members and contributions')!.text).join('');
  expect(displayed.replace(/\n/g, '')).toBe(project.credits);
});
