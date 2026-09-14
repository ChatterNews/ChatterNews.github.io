import { newId, type BlastElement, type BlastPage, type BlastProject } from '@chatter/shared';

export interface BlastTemplate {
  id: string;
  name: string;
  kind: string;
  description: string;
  accent: string;
  format: BlastProject['format'];
  build(): Pick<BlastProject, 'title' | 'format' | 'width' | 'height' | 'pages'>;
}

const BASE: Omit<BlastElement, 'id' | 'kind' | 'name' | 'x' | 'y' | 'width' | 'height'> = {
  rotation: 0, opacity: 1, locked: false, hidden: false,
  fill: '#1A1626', stroke: 'transparent', strokeWidth: 0, radius: 0,
  fillType: 'SOLID', fillSecondary: '#8B4DE8', fillAngle: 90, strokeStyle: 'SOLID',
  fontFamily: 'Nunito', fontSize: 32, fontWeight: 800, lineHeight: 1.1,
  fontStyle: 'normal', underline: false, strikethrough: false, textTransform: 'none', verticalAlign: 'top',
  letterSpacing: 0, align: 'left', textStrokeColor: '#1A1626', textStrokeWidth: 0,
  shadowColor: '#1A1626', shadowX: 0, shadowY: 0, shadowBlur: 0, blendMode: 'normal',
  brightness: 100, contrast: 100, saturation: 100, grayscale: 0, flipX: false, flipY: false,
};

export function element(input: Partial<BlastElement> & Pick<BlastElement, 'kind' | 'x' | 'y' | 'width' | 'height'>): BlastElement {
  return {
    ...BASE,
    id: newId(),
    name: input.kind === 'TEXT' ? 'Text' : input.kind === 'IMAGE' ? 'Photo' : input.kind === 'LINE' ? 'Line' : 'Shape',
    ...(input.kind === 'SHAPE' ? { shape: 'RECTANGLE' as const } : {}),
    ...input,
  };
}

export function selectedCanvasZIndex(selected: boolean): number | undefined {
  return selected ? 1000 : undefined;
}

function page(name: string, background: string, elements: BlastElement[]): BlastPage {
  return { id: newId(), name, background, elements };
}

const letter = { width: 816, height: 1056 };

export const BLAST_TEMPLATES: BlastTemplate[] = [
  {
    id: 'pep-rally', name: 'Big Event', kind: 'Flyer', accent: '#FF3D8B', format: 'LETTER_PORTRAIT',
    description: 'A loud, photo-first flyer for dances, games, and club events.',
    build: () => ({ title: 'Big Event Flyer', format: 'LETTER_PORTRAIT', ...letter, pages: [page('Flyer', '#FFD21E', [
      element({ kind: 'SHAPE', name: 'Top color band', x: 0, y: 0, width: 816, height: 164, fill: '#FF3D8B' }),
      element({ kind: 'TEXT', name: 'School name', x: 62, y: 42, width: 690, height: 70, text: 'CHATTER MIDDLE SCHOOL', fill: '#FFFFFF', fontSize: 30, fontWeight: 900, align: 'center', letterSpacing: 2 }),
      element({ kind: 'IMAGE', name: 'Hero photo', x: 62, y: 206, width: 692, height: 386, fill: '#FFF6E4', stroke: '#1A1626', strokeWidth: 5, radius: 24 }),
      element({ kind: 'TEXT', name: 'Event headline', x: 60, y: 634, width: 696, height: 140, text: 'PEP RALLY!', fill: '#1A1626', fontFamily: 'Luckiest Guy', fontSize: 76, fontWeight: 900, align: 'center', lineHeight: .95 }),
      element({ kind: 'TEXT', name: 'Details', x: 88, y: 796, width: 640, height: 100, text: 'FRIDAY · 3:30 PM · THE GYM', fill: '#6229BC', fontSize: 30, fontWeight: 900, align: 'center' }),
      element({ kind: 'SHAPE', name: 'Callout', x: 208, y: 916, width: 400, height: 76, fill: '#1A1626', radius: 38 }),
      element({ kind: 'TEXT', name: 'Call to action', x: 232, y: 932, width: 352, height: 44, text: 'BRING YOUR SCHOOL SPIRIT', fill: '#FFFFFF', fontSize: 20, fontWeight: 900, align: 'center' }),
    ])] }),
  },
  {
    id: 'newsroom', name: 'The Newsroom', kind: '2-page newsletter', accent: '#22C7E8', format: 'LETTER_PORTRAIT',
    description: 'A real front page and inside page with headlines, columns, and photos.',
    build: () => ({ title: 'The Newsroom', format: 'LETTER_PORTRAIT', ...letter, pages: [
      page('Front page', '#FFFDF7', [
        element({ kind: 'TEXT', name: 'Masthead', x: 48, y: 38, width: 720, height: 90, text: 'THE CHATTER', fill: '#1A1626', fontFamily: 'Newsreader', fontSize: 62, fontWeight: 900, align: 'center' }),
        element({ kind: 'LINE', name: 'Masthead rule', x: 48, y: 136, width: 720, height: 4, fill: '#1A1626' }),
        element({ kind: 'TEXT', name: 'Issue line', x: 48, y: 149, width: 720, height: 30, text: 'STUDENT NEWS  ·  SEPTEMBER 2026  ·  VOL. 1', fill: '#5B5270', fontSize: 15, fontWeight: 900, align: 'center', letterSpacing: 1 }),
        element({ kind: 'TEXT', name: 'Lead headline', x: 48, y: 206, width: 720, height: 132, text: 'A BIG IDEA TAKES OVER CAMPUS', fill: '#0E8FAC', fontFamily: 'Newsreader', fontSize: 52, fontWeight: 900, lineHeight: 1 }),
        element({ kind: 'IMAGE', name: 'Lead photo', x: 48, y: 358, width: 720, height: 370, fill: '#E8F8FB', stroke: '#1A1626', strokeWidth: 2 }),
        element({ kind: 'TEXT', name: 'Photo caption', x: 48, y: 737, width: 720, height: 42, text: 'Write a caption that tells readers what is happening and who is pictured.', fill: '#5B5270', fontFamily: 'Newsreader', fontSize: 15, fontWeight: 600, lineHeight: 1.25 }),
        element({ kind: 'TEXT', name: 'Lead story', x: 48, y: 802, width: 456, height: 190, text: 'Start your story here. The opening paragraph should answer the biggest question and make readers want to keep going.\n\nAdd the details, voices, and facts your audience needs.', fill: '#1A1626', fontFamily: 'Newsreader', fontSize: 19, fontWeight: 500, lineHeight: 1.35 }),
        element({ kind: 'SHAPE', name: 'Inside box', x: 536, y: 802, width: 232, height: 190, fill: '#FFD21E', radius: 14 }),
        element({ kind: 'TEXT', name: 'Inside headline', x: 558, y: 824, width: 188, height: 54, text: 'ALSO INSIDE', fill: '#1A1626', fontSize: 23, fontWeight: 900, align: 'center' }),
        element({ kind: 'TEXT', name: 'Inside list', x: 558, y: 885, width: 188, height: 80, text: 'Sports ........ 2\nArts ............ 2\nClubs .......... 2', fill: '#1A1626', fontSize: 16, fontWeight: 800, lineHeight: 1.45 }),
      ]),
      page('Inside', '#FFFDF7', [
        element({ kind: 'SHAPE', name: 'Section flag', x: 0, y: 0, width: 816, height: 116, fill: '#22C7E8' }),
        element({ kind: 'TEXT', name: 'Section title', x: 48, y: 28, width: 720, height: 64, text: 'AROUND SCHOOL', fill: '#1A1626', fontFamily: 'Newsreader', fontSize: 46, fontWeight: 900 }),
        element({ kind: 'TEXT', name: 'Story one headline', x: 48, y: 156, width: 438, height: 96, text: 'Students turn an idea into action', fill: '#1A1626', fontFamily: 'Newsreader', fontSize: 38, fontWeight: 900, lineHeight: 1.05 }),
        element({ kind: 'TEXT', name: 'Story one', x: 48, y: 276, width: 438, height: 324, text: 'Write the full story in this text frame. Double-click any text to edit it right on the page.\n\nUse short paragraphs, specific details, and quotes from people who were there. The inspector can change type, color, spacing, alignment, and more.', fill: '#1A1626', fontFamily: 'Newsreader', fontSize: 18, fontWeight: 500, lineHeight: 1.42 }),
        element({ kind: 'IMAGE', name: 'Side photo', x: 520, y: 156, width: 248, height: 280, fill: '#E8F8FB' }),
        element({ kind: 'TEXT', name: 'Side caption', x: 520, y: 450, width: 248, height: 82, text: 'Caption this photo with names and context.', fill: '#5B5270', fontFamily: 'Newsreader', fontSize: 14, fontWeight: 600, lineHeight: 1.3 }),
        element({ kind: 'LINE', name: 'Divider', x: 48, y: 644, width: 720, height: 3, fill: '#1A1626' }),
        element({ kind: 'TEXT', name: 'Story two headline', x: 48, y: 682, width: 720, height: 62, text: 'Quick hits from clubs, arts, and sports', fill: '#0E8FAC', fontFamily: 'Newsreader', fontSize: 34, fontWeight: 900 }),
        element({ kind: 'TEXT', name: 'Column one', x: 48, y: 770, width: 220, height: 232, text: 'CLUBS\nAdd a short update here. What happened? What comes next? How can readers join?', fill: '#1A1626', fontFamily: 'Newsreader', fontSize: 17, fontWeight: 500, lineHeight: 1.4 }),
        element({ kind: 'TEXT', name: 'Column two', x: 298, y: 770, width: 220, height: 232, text: 'ARTS\nAdd a short update here. Include the date and place for upcoming performances.', fill: '#1A1626', fontFamily: 'Newsreader', fontSize: 17, fontWeight: 500, lineHeight: 1.4 }),
        element({ kind: 'TEXT', name: 'Column three', x: 548, y: 770, width: 220, height: 232, text: 'SPORTS\nAdd a short update here. Include the score, standout moments, and next game.', fill: '#1A1626', fontFamily: 'Newsreader', fontSize: 17, fontWeight: 500, lineHeight: 1.4 }),
      ]),
    ] }),
  },
  {
    id: 'club-poster', name: 'Join Our Club', kind: 'Poster', accent: '#8B4DE8', format: 'LETTER_PORTRAIT',
    description: 'Bold recruiting poster with a clear pitch and meeting details.',
    build: () => ({ title: 'Club Poster', format: 'LETTER_PORTRAIT', ...letter, pages: [page('Poster', '#FFF6E4', [
      element({ kind: 'SHAPE', name: 'Backdrop', x: 38, y: 38, width: 740, height: 980, fill: '#8B4DE8', radius: 32 }),
      element({ kind: 'TEXT', name: 'Eyebrow', x: 90, y: 98, width: 636, height: 48, text: 'YOU BELONG HERE', fill: '#FFD21E', fontSize: 23, fontWeight: 900, align: 'center', letterSpacing: 3 }),
      element({ kind: 'TEXT', name: 'Headline', x: 82, y: 166, width: 652, height: 176, text: 'JOIN THE\nMEDIA CLUB', fill: '#FFFFFF', fontFamily: 'Luckiest Guy', fontSize: 67, fontWeight: 900, align: 'center', lineHeight: .98 }),
      element({ kind: 'IMAGE', name: 'Club photo', x: 116, y: 380, width: 584, height: 326, fill: '#FFFDF7', radius: 26 }),
      element({ kind: 'TEXT', name: 'Pitch', x: 116, y: 748, width: 584, height: 84, text: 'Make videos. Tell stories. Design the news.', fill: '#FFFFFF', fontSize: 27, fontWeight: 900, align: 'center', lineHeight: 1.2 }),
      element({ kind: 'SHAPE', name: 'Meeting pill', x: 146, y: 876, width: 524, height: 82, fill: '#FFD21E', radius: 41 }),
      element({ kind: 'TEXT', name: 'Meeting details', x: 170, y: 896, width: 476, height: 44, text: 'TUESDAYS · ROOM 204 · 3:15', fill: '#1A1626', fontSize: 23, fontWeight: 900, align: 'center' }),
    ])] }),
  },
  {
    id: 'social-square', name: 'Quick Announcement', kind: 'Square graphic', accent: '#9BE015', format: 'SQUARE',
    description: 'A clean social post or digital sign for one fast message.',
    build: () => ({ title: 'Quick Announcement', format: 'SQUARE', width: 1080, height: 1080, pages: [page('Graphic', '#9BE015', [
      element({ kind: 'SHAPE', name: 'Photo frame', x: 70, y: 70, width: 940, height: 500, fill: '#FFFDF7', radius: 44 }),
      element({ kind: 'IMAGE', name: 'Photo', x: 86, y: 86, width: 908, height: 468, fill: '#FFF6E4', radius: 34 }),
      element({ kind: 'TEXT', name: 'Headline', x: 80, y: 630, width: 920, height: 180, text: 'SAVE THE DATE!', fill: '#1A1626', fontFamily: 'Luckiest Guy', fontSize: 104, fontWeight: 900, align: 'center', lineHeight: 1 }),
      element({ kind: 'TEXT', name: 'Details', x: 150, y: 850, width: 780, height: 92, text: 'SEPT 18 · 6 PM · AUDITORIUM', fill: '#6229BC', fontSize: 42, fontWeight: 900, align: 'center' }),
    ])] }),
  },
  {
    id: 'blank', name: 'Blank Page', kind: 'Start from scratch', accent: '#FFFDF7', format: 'LETTER_PORTRAIT',
    description: 'A clean letter-size page with margins and guides ready.',
    build: () => ({ title: 'Untitled publication', format: 'LETTER_PORTRAIT', ...letter, pages: [page('Page 1', '#FFFDF7', [])] }),
  },
];

export function clonePage(source: BlastPage): BlastPage {
  return {
    ...source,
    id: newId(),
    name: `${source.name} copy`,
    elements: source.elements.map((item) => ({ ...item, id: newId() })),
  };
}

export function makeBlankPage(index: number): BlastPage {
  return page(`Page ${index}`, '#FFFDF7', []);
}

/** Every layer stays reachable in the panel; Guided mode teaches without hiding the template. */
export function layersForPanel(elements: BlastElement[], _mode?: 'GUIDED' | 'FREEFORM'): BlastElement[] {
  return [...elements].reverse();
}

const OLD_LOCKED_TEMPLATE_SHAPES = new Set(['Top color band', 'Section flag']);

/** Repair template locks from projects saved before template shapes became editable. */
export function editableBlastProject<T extends { pages: BlastPage[] }>(project: T): T {
  return {
    ...project,
    pages: project.pages.map((source) => ({
      ...source,
      elements: source.elements.map((item) => item.kind === 'SHAPE' && (item.recipeOwned || OLD_LOCKED_TEMPLATE_SHAPES.has(item.name))
        ? { ...item, locked: false }
        : item),
    })),
  };
}
