import { newId } from './ids.js';
import { createMotionPackage } from './stinger.js';
import { showtimeDuration } from './showtime.js';
import { makeVideoGraphic } from './video-graphics.js';
import type { MotionElement, MotionScene, ShowtimeProject } from './types.js';

/** Wrap before pagination so a long name/contribution cannot disappear below a card. */
function creditLines(credits: string, width: number): string[] {
  return credits.trim().split(/\r?\n/).filter(line => line.trim()).flatMap(entry => {
    const lines: string[] = []; let rest = entry.trim();
    while (rest.length > width) {
      const space = rest.lastIndexOf(' ', width);
      const end = space > width / 3 ? space : width;
      lines.push(rest.slice(0, end)); rest = rest.slice(end).trimStart();
    }
    if (rest) lines.push(rest);
    return lines;
  });
}

/** Explicitly regenerate only the credit cards, placing them after the rest of the edit. */
export function withVideoEndCredits(project: ShowtimeProject): ShowtimeProject {
  const credits = project.credits?.trim();
  if (!credits) throw new Error('Add the members and their contributions to Project credits first.');
  const next = structuredClone(project);
  const previous = next.titles.filter(title => title.projectCredits !== undefined);
  next.titles = next.titles.filter(title => title.projectCredits === undefined);
  let at = showtimeDuration(next);
  const kit = createMotionPackage('bulletin', { title: 'Project credits', storyId: project.storyId, authorId: project.authorId });
  kit.width = project.width; kit.height = project.height;
  kit.format = project.format === 'VERTICAL' ? 'VERTICAL' : project.format === 'SQUARE' ? 'SQUARE' : 'WIDE';
  const fontSize = Math.min(project.height * .046, project.width * .032);
  const columns = Math.max(12, Math.floor(project.width * .8 / (fontSize * .62)));
  const lines = creditLines(credits, columns);
  const perCard = Math.max(3, Math.min(10, Math.floor(project.height * .55 / (fontSize * 1.45))));
  const pages = Math.ceil(lines.length / perCard);
  for (let page = 0; page < pages; page++) {
    const words = lines.slice(page * perCard, (page + 1) * perCard).join('\n');
    const durationMs = Math.round(Math.max(6, words.split(/\s+/).length / 2.5 + 2) * 1000);
    const duration = Math.min(30_000, durationMs);
    const text = (name: string, value: string, y: number, size: number, height: number, fill = '#fff9e9'): MotionElement => ({
      id: newId(), kind: 'TEXT', name, x: project.width * .1, y, width: project.width * .8, height,
      rotation: 0, scale: 1, opacity: 1, hidden: false, locked: false,
      text: value, binding: 'CUSTOM', fill, stroke: 'transparent', strokeWidth: 0, radius: 0,
      fontFamily: 'Space Mono', fontSize: size, fontWeight: 700, align: 'center', letterSpacing: 0, lineHeight: 1.45,
      startMs: 0, endMs: duration, enter: 'FADE', exit: 'FADE', ease: 'EASE_IN_OUT', keyframes: [],
    });
    const scene: MotionScene = { id: newId(), kind: 'END', name: pages > 1 ? `Credits ${page + 1} of ${pages}` : 'End credits', durationMs: duration,
      background: '#201a30', elements: [
        text('Credits heading', 'MADE BY', project.height * .12, fontSize * 1.35, project.height * .14, '#ffd64c'),
        text('Members and contributions', words, project.height * .32, fontSize, project.height * .56),
        text('Credits page', pages > 1 ? `${page + 1} / ${pages}` : 'CHATTER NEWS', project.height * .9, fontSize * .55, project.height * .08, '#ffd64c'),
      ] };
    const title = makeVideoGraphic({ ...kit, scenes: [scene] }, scene.id, at);
    title.id = previous[page]?.id ?? title.id; title.projectCredits = credits;
    next.titles.push(title); at = title.endSec;
  }
  next.updatedAt = Date.now();
  return next;
}
