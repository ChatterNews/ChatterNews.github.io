import type { CrewRole } from './crew.js';
import type { Story } from './types.js';

export interface CrewHandoffParts {
  finished: string;
  location: string;
  next: string;
}

export type CrewHandoffStory = Pick<Story, 'title' | 'brief'>;

const HEADINGS = ['FINISHED', 'FIND IT', 'CHECK NEXT'] as const;

function storyTitle(story: CrewHandoffStory): string {
  return story.title.trim() || 'Untitled story';
}

function verification(story: CrewHandoffStory): string {
  return story.brief?.angleCheck?.verification?.trim() || 'Recheck the key fact against the original notes or recording';
}

export function crewHandoffSpecimen(role: CrewRole, story: CrewHandoffStory): CrewHandoffParts {
  const title = storyTitle(story);
  const examples: Record<CrewRole, CrewHandoffParts> = {
    report: {
      finished: `Interviewed two sources and logged exact quotes for “${title}.”`,
      location: `Slate → ${title} → Reporting file.`,
      next: `For “${title},” still verify: ${verification(story)}.`,
    },
    write: {
      finished: `Drafted “${title}” with a news lead, evidence, and one attributed quote.`,
      location: `Desk → ${title} → saved story draft.`,
      next: `Read “${title}” aloud once and check that the opening explains what changed.`,
    },
    voice: {
      finished: `Recorded a complete read of “${title}” and selected the clearest take.`,
      location: `Booth → ${title} → selected take.`,
      next: `Listen to “${title}” once for clipped words, room noise, and correct names.`,
    },
    edit: {
      finished: `Checked “${title}” against its reporting file and left revision notes.`,
      location: `Green Light → ${title} → open review.`,
      next: `Before approving “${title},” verify: ${verification(story)}.`,
    },
    produce: {
      finished: `Built and balanced the audio for “${title}” from opening through ending.`,
      location: `Studio → ${title} → latest saved mix.`,
      next: `Play “${title}” from start to finish; keep speech in front and check every transition.`,
    },
    picture: {
      finished: `Made a headline graphic and square social card for “${title}.”`,
      location: `Blast → ${title} → latest saved design.`,
      next: `Check “${title}” for photo credit, spelling, contrast, and the final call to action.`,
    },
  };
  return examples[role];
}

export function crewHandoffProgress(parts: CrewHandoffParts): number {
  return [parts.finished, parts.location, parts.next].filter((value) => value.trim()).length;
}

export function formatCrewHandoff(parts: CrewHandoffParts): string {
  if (crewHandoffProgress(parts) === 0) return '';
  return `${HEADINGS[0]}\n${parts.finished.trim()}\n\n${HEADINGS[1]}\n${parts.location.trim()}\n\n${HEADINGS[2]}\n${parts.next.trim()}`.trim();
}

export function parseCrewHandoff(note: string): CrewHandoffParts {
  const trimmed = note.trim();
  if (!trimmed) return { finished: '', location: '', next: '' };
  const match = trimmed.match(/^FINISHED\n([\s\S]*?)\n\nFIND IT\n([\s\S]*?)\n\nCHECK NEXT\n([\s\S]*)$/);
  if (!match) return { finished: trimmed, location: '', next: '' };
  return { finished: match[1]!.trim(), location: match[2]!.trim(), next: match[3]!.trim() };
}
