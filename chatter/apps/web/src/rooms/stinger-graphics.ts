import {
  motionFrameState,
  newId,
  type CreativeRole,
  type MotionBinding,
  type MotionElement,
  type MotionKeyframe,
  type MotionPreset,
  type MotionScene,
  type MotionSceneKind,
  type MotionTheme,
} from '@chatter/shared';

export type StingerGraphicCategory =
  | 'RECENT' | 'HEADLINES' | 'LOWER_THIRDS' | 'QUOTES' | 'SCORES' | 'TICKERS'
  | 'BADGES' | 'PHOTO_FRAMES' | 'LOGO_MOMENTS' | 'TRANSITIONS' | 'BACKGROUNDS' | 'BASIC';

export const STINGER_GRAPHIC_CATEGORIES: Array<{ id: Exclude<StingerGraphicCategory, 'RECENT'>; label: string; mark: string }> = [
  { id: 'HEADLINES', label: 'Headlines', mark: 'Aa' },
  { id: 'LOWER_THIRDS', label: 'Name bars', mark: '▰' },
  { id: 'QUOTES', label: 'Quotes', mark: '“”' },
  { id: 'SCORES', label: 'Scores', mark: '12' },
  { id: 'TICKERS', label: 'Tickers', mark: '↤' },
  { id: 'BADGES', label: 'Badges', mark: '●' },
  { id: 'PHOTO_FRAMES', label: 'Photo frames', mark: '▧' },
  { id: 'LOGO_MOMENTS', label: 'Show marks', mark: '★' },
  { id: 'TRANSITIONS', label: 'Transitions', mark: '↝' },
  { id: 'BACKGROUNDS', label: 'Backgrounds', mark: '▦' },
  { id: 'BASIC', label: 'Basic pieces', mark: '＋' },
];

export interface StingerGraphicTemplate {
  id: string;
  name: string;
  category: Exclude<StingerGraphicCategory, 'RECENT'>;
  job: string;
  keywords: string[];
  preview: string;
  sceneKinds?: MotionSceneKind[];
  needsImage?: boolean;
}

const graphic = (
  id: string,
  name: string,
  category: StingerGraphicTemplate['category'],
  job: string,
  preview: string,
  keywords: string[],
  options: Pick<StingerGraphicTemplate, 'sceneKinds' | 'needsImage'> = {},
): StingerGraphicTemplate => ({ id, name, category, job, preview, keywords, ...options });

export const STINGER_GRAPHICS: StingerGraphicTemplate[] = [
  graphic('headline-slab', 'Headline slab', 'HEADLINES', 'Lead with one clear story', 'headline-slab', ['title', 'story', 'breaking'], { sceneKinds: ['OPEN', 'HEADLINE', 'COMING_UP', 'END'] }),
  graphic('split-headline', 'Split headline', 'HEADLINES', 'Pair a label with the main line', 'split-headline', ['topic', 'chapter', 'question'], { sceneKinds: ['OPEN', 'HEADLINE', 'COMING_UP', 'END'] }),
  graphic('reporter-lower-third', 'Reporter name bar', 'LOWER_THIRDS', 'Name the person on camera', 'reporter-bar', ['name bar', 'lower third', 'reporter', 'speaker'], { sceneKinds: ['LOWER_THIRD'] }),
  graphic('guest-lower-third', 'Guest ID card', 'LOWER_THIRDS', 'Add a guest and why they matter', 'guest-card', ['name bar', 'guest', 'interview'], { sceneKinds: ['LOWER_THIRD'] }),
  graphic('quote-paper', 'Pull quote card', 'QUOTES', 'Hold one sentence long enough to read', 'quote-paper', ['quote', 'voice', 'statement'], { sceneKinds: ['QUOTE', 'HEADLINE'] }),
  graphic('quote-caption', 'Quote over video', 'QUOTES', 'Set a short quote above footage', 'quote-caption', ['quote', 'caption', 'overlay'], { sceneKinds: ['QUOTE', 'HEADLINE'] }),
  graphic('score-bug', 'Score bug', 'SCORES', 'Keep a score in the corner', 'score-bug', ['score', 'teams', 'game'], { sceneKinds: ['STAT', 'HEADLINE', 'LOWER_THIRD'] }),
  graphic('result-board', 'Result board', 'SCORES', 'Make the final result the headline', 'result-board', ['score', 'result', 'stat'], { sceneKinds: ['STAT', 'HEADLINE'] }),
  graphic('news-ticker', 'News ticker', 'TICKERS', 'Carry one update along the bottom', 'news-ticker', ['ticker', 'crawl', 'update'], { sceneKinds: ['HEADLINE', 'COMING_UP', 'LOWER_THIRD', 'STAT'] }),
  graphic('coming-up-ticker', 'Coming-up rail', 'TICKERS', 'Tease the next story', 'coming-up', ['ticker', 'next', 'coming up'], { sceneKinds: ['COMING_UP', 'HEADLINE'] }),
  graphic('live-badge', 'Live badge', 'BADGES', 'Mark a live or recorded segment', 'live-badge', ['live', 'recorded', 'status'], { sceneKinds: ['OPEN', 'HEADLINE', 'LOWER_THIRD', 'QUOTE', 'STAT', 'COMING_UP', 'END'] }),
  graphic('location-badge', 'Location tab', 'BADGES', 'Tell viewers where the story is', 'location-badge', ['place', 'location', 'school'], { sceneKinds: ['HEADLINE', 'LOWER_THIRD', 'QUOTE', 'STAT', 'COMING_UP'] }),
  graphic('portrait-window', 'Portrait window', 'PHOTO_FRAMES', 'Frame a person with a caption', 'portrait-window', ['photo', 'portrait', 'person'], { sceneKinds: ['HEADLINE', 'QUOTE', 'LOWER_THIRD'], needsImage: true }),
  graphic('picture-in-picture', 'Picture-in-picture', 'PHOTO_FRAMES', 'Place evidence beside the main video', 'picture-in-picture', ['photo', 'evidence', 'video'], { sceneKinds: ['HEADLINE', 'QUOTE', 'STAT'], needsImage: true }),
  graphic('show-bug', 'Corner show bug', 'LOGO_MOMENTS', 'Keep the show name present', 'show-bug', ['logo', 'show', 'corner'], { sceneKinds: ['OPEN', 'HEADLINE', 'LOWER_THIRD', 'QUOTE', 'STAT', 'COMING_UP', 'END'] }),
  graphic('show-stamp', 'Show stamp', 'LOGO_MOMENTS', 'Land the show name with emphasis', 'show-stamp', ['logo', 'show', 'opener'], { sceneKinds: ['OPEN', 'TRANSITION', 'END'] }),
  graphic('signal-wipe', 'Signal wipe', 'TRANSITIONS', 'Move cleanly between stories', 'signal-wipe', ['transition', 'wipe', 'change'], { sceneKinds: ['TRANSITION'] }),
  graphic('chapter-stripe', 'Chapter stripe', 'TRANSITIONS', 'Introduce the next section', 'chapter-stripe', ['transition', 'chapter', 'section'], { sceneKinds: ['TRANSITION'] }),
  graphic('split-signal', 'Split signal', 'BACKGROUNDS', 'Divide the screen into clear zones', 'split-signal', ['background', 'split', 'panel'], { sceneKinds: ['OPEN', 'HEADLINE', 'QUOTE', 'STAT', 'COMING_UP', 'END'] }),
  graphic('grid-wall', 'Broadcast grid', 'BACKGROUNDS', 'Add a measured technical field', 'grid-wall', ['background', 'grid', 'technical'], { sceneKinds: ['OPEN', 'HEADLINE', 'QUOTE', 'STAT', 'COMING_UP', 'END'] }),
  graphic('basic-text', 'Words', 'BASIC', 'Add one text layer', 'basic-text', ['text', 'words']),
  graphic('basic-box', 'Box', 'BASIC', 'Add a rectangle', 'basic-box', ['shape', 'rectangle']),
  graphic('basic-circle', 'Circle', 'BASIC', 'Add a circle', 'basic-circle', ['shape', 'ellipse']),
  graphic('basic-triangle', 'Triangle', 'BASIC', 'Add a triangle', 'basic-triangle', ['shape']),
  graphic('basic-line', 'Line', 'BASIC', 'Add a line', 'basic-line', ['shape', 'rule']),
  graphic('basic-photo', 'Photo', 'BASIC', 'Add one replaceable image', 'basic-photo', ['image', 'media'], { needsImage: true }),
];

export function filterStingerGraphics(input: {
  query?: string;
  category?: StingerGraphicCategory;
  sceneKind: MotionSceneKind;
  recentIds?: string[];
  includeIncompatible?: boolean;
}): StingerGraphicTemplate[] {
  const query = input.query?.trim().toLowerCase() ?? '';
  const compatible = (item: StingerGraphicTemplate) => input.includeIncompatible || !item.sceneKinds || item.sceneKinds.includes(input.sceneKind);
  const matchesQuery = (item: StingerGraphicTemplate) => !query || `${item.name} ${item.job} ${item.keywords.join(' ')}`.toLowerCase().includes(query);
  if (input.category === 'RECENT') {
    return (input.recentIds ?? []).map((id) => STINGER_GRAPHICS.find((item) => item.id === id)).filter((item): item is StingerGraphicTemplate => !!item && compatible(item) && matchesQuery(item));
  }
  return STINGER_GRAPHICS.filter((item) => compatible(item)
    && (query || !input.category || item.category === input.category)
    && matchesQuery(item));
}

export function insertStingerGraphicElements(
  existing: MotionElement[],
  inserted: MotionElement[],
  category: StingerGraphicTemplate['category'],
): MotionElement[] {
  const legacyBackgroundNames = new Set(['Left field', 'Right field', 'Signal line', 'Grid field', 'Grid line 1', 'Grid line 2', 'Grid line 3', 'Grid line 4', 'Grid line 5', 'Grid row 1', 'Grid row 2', 'Grid row 3']);
  const oldBackgroundGroups = new Set(existing.filter((item) => item.backgroundGroup || legacyBackgroundNames.has(item.name)).map((item) => item.groupId).filter((id): id is string => !!id));
  return category === 'BACKGROUNDS'
    ? [...inserted, ...existing.filter((item) => !item.backgroundGroup && (!item.groupId || !oldBackgroundGroups.has(item.groupId)))]
    : [...existing, ...inserted];
}

export function moveStingerGraphicGroup(elements: MotionElement[], selectedId: string, dx: number, dy: number): MotionElement[] {
  const selected = elements.find((item) => item.id === selectedId);
  if (!selected) return elements;
  return elements.map((item) => {
    const movesWithSelected = !item.locked && (item.id === selectedId || (!!selected.groupId && item.groupId === selected.groupId));
    return movesWithSelected ? {
      ...item,
      x: item.x + dx,
      y: item.y + dy,
      keyframes: item.keyframes.map((frame) => ({
        ...frame,
        x: frame.x === undefined ? undefined : frame.x + dx,
        y: frame.y === undefined ? undefined : frame.y + dy,
      })),
    } : item;
  });
}

export function makeStingerKeyframeAtPlayhead(item: MotionElement, atMs: number, scene: MotionScene): MotionKeyframe {
  const visible = motionFrameState(item, atMs, scene);
  return {
    id: newId(), atMs: Math.round(atMs), x: visible.frameX, y: visible.frameY,
    scale: visible.frameScale, rotation: visible.frameRotation, opacity: visible.frameOpacity,
  };
}

type BuildInput = { width: number; height: number; durationMs: number; theme: MotionTheme; imageAssetId?: string };

export function buildStingerGraphic(templateId: string, input: BuildInput): MotionElement[] {
  const groupId = newId();
  const { width: w, height: h, durationMs: duration, theme } = input;
  const backgroundGroup = STINGER_GRAPHICS.find((item) => item.id === templateId)?.category === 'BACKGROUNDS';
  const x = (value: number) => w * value;
  const y = (value: number) => h * value;
  const base = (
    kind: MotionElement['kind'],
    name: string,
    role: CreativeRole,
    frame: [number, number, number, number],
    patch: Partial<MotionElement> = {},
  ): MotionElement => ({
    id: newId(), groupId, backgroundGroup, kind, name, role, recipeOwned: false,
    x: x(frame[0]), y: y(frame[1]), width: x(frame[2]), height: y(frame[3]),
    rotation: 0, scale: 1, opacity: 1, hidden: false, locked: false,
    shape: 'RECTANGLE', fill: kind === 'TEXT' ? theme.paper : theme.accent,
    stroke: 'transparent', strokeWidth: 0, radius: Math.round(w * .008),
    fontFamily: role === 'HEADLINE' || role === 'STAT' || role === 'LOGO' ? theme.fontDisplay : theme.fontBody,
    fontSize: Math.round(w * (role === 'HEADLINE' ? .05 : .026)), fontWeight: 800,
    align: 'left', letterSpacing: 0, lineHeight: 1.05,
    startMs: 0, endMs: duration, enter: 'FADE', exit: 'FADE', ease: 'EASE_OUT', keyframes: [],
    ...patch,
  });
  const text = (name: string, role: CreativeRole, value: string, binding: MotionBinding, frame: [number, number, number, number], patch: Partial<MotionElement> = {}) => base('TEXT', name, role, frame, { text: value, binding, ...patch });
  const shape = (name: string, frame: [number, number, number, number], patch: Partial<MotionElement> = {}) => base('SHAPE', name, 'DECORATION', frame, patch);
  const image = (name: string, frame: [number, number, number, number], patch: Partial<MotionElement> = {}) => base('IMAGE', name, 'PHOTO', frame, { imageAssetId: input.imageAssetId, fill: theme.secondary, ...patch });
  const group = (...elements: MotionElement[]) => elements;
  const squareFrame = (centerX: number, centerY: number, sizeFraction: number): [number, number, number, number] => {
    const size = Math.min(w, h) * sizeFraction;
    return [(w * centerX - size / 2) / w, (h * centerY - size / 2) / h, size / w, size / h];
  };

  switch (templateId) {
    case 'headline-slab': return group(
      shape('Headline slab', [.07, .2, .86, .5], { fill: theme.primary, stroke: theme.accent, strokeWidth: Math.max(3, w * .004), enter: 'WIPE' }),
      shape('Signal tab', [.07, .2, .18, .055], { fill: theme.accent, enter: 'SLIDE_LEFT' }),
      text('Headline', 'HEADLINE', 'STORY HEADLINE', 'STORY_TITLE', [.12, .34, .72, .22], { fontFamily: theme.fontDisplay, fontSize: w * .065, enter: 'SLIDE_UP' }),
      text('Topic', 'KICKER', 'SCHOOL NEWS', 'CHANNEL', [.12, .59, .55, .05], { fill: theme.accent, fontSize: w * .018, letterSpacing: 3 }),
    );
    case 'split-headline': return group(
      shape('Topic rail', [.05, .12, .25, .76], { fill: theme.secondary, enter: 'SLIDE_LEFT' }),
      shape('Headline paper', [.3, .12, .65, .76], { fill: theme.paper, radius: w * .014, enter: 'FADE' }),
      text('Topic', 'KICKER', 'TODAY', 'CHANNEL', [.09, .2, .17, .1], { fill: theme.ink, fontSize: w * .025, align: 'center' }),
      text('Headline', 'HEADLINE', 'STORY HEADLINE', 'STORY_TITLE', [.36, .29, .51, .3], { fill: theme.ink, fontSize: w * .06, enter: 'TYPE_ON' }),
    );
    case 'reporter-lower-third': return group(
      shape('Name plate', [.05, .7, .62, .2], { fill: theme.primary, stroke: theme.accent, strokeWidth: Math.max(3, w * .003), enter: 'SLIDE_LEFT', exit: 'SLIDE_LEFT' }),
      shape('Accent tab', [.05, .7, .025, .2], { fill: theme.accent, enter: 'WIPE' }),
      text('Reporter name', 'BYLINE', 'STUDENT REPORTER', 'BYLINE', [.1, .735, .5, .07], { fontFamily: theme.fontDisplay, fontSize: w * .034, enter: 'SLIDE_UP' }),
      text('Reporter role', 'KICKER', 'CHATTER NEWS', 'CHANNEL', [.1, .82, .45, .04], { fill: theme.accent, fontSize: w * .016, letterSpacing: 2 }),
    );
    case 'guest-lower-third': return group(
      shape('Guest card', [.05, .66, .52, .25], { fill: theme.paper, stroke: theme.secondary, strokeWidth: Math.max(3, w * .003), radius: w * .018, enter: 'POP' }),
      shape('Guest dot', squareFrame(.1125, .765, .13), { fill: theme.accent, shape: 'ELLIPSE', radius: w, enter: 'POP' }),
      text('Guest name', 'BYLINE', 'GUEST NAME', 'CUSTOM', [.175, .7, .34, .07], { fill: theme.ink, fontFamily: theme.fontDisplay, fontSize: w * .03 }),
      text('Guest role', 'KICKER', 'WHY WE ARE TALKING', 'CUSTOM', [.175, .79, .32, .05], { fill: theme.secondary, fontSize: w * .015 }),
    );
    case 'quote-paper': return group(
      shape('Quote paper', [.1, .12, .8, .76], { fill: theme.paper, stroke: theme.accent, strokeWidth: Math.max(3, w * .004), radius: w * .02, enter: 'SLIDE_UP' }),
      text('Quote mark', 'DECORATION', '“', 'CUSTOM', [.14, .17, .12, .2], { fill: theme.secondary, fontFamily: theme.fontDisplay, fontSize: w * .13 }),
      text('Quote', 'QUOTE', 'ONE STRONG SENTENCE GOES HERE.', 'QUOTE', [.24, .27, .56, .32], { fill: theme.ink, fontFamily: theme.fontDisplay, fontSize: w * .047, enter: 'TYPE_ON' }),
      text('Quote credit', 'BYLINE', '— STUDENT VOICE', 'BYLINE', [.24, .68, .5, .06], { fill: theme.secondary, fontSize: w * .018 }),
    );
    case 'quote-caption': return group(
      shape('Caption shade', [.08, .62, .84, .27], { fill: theme.ink, opacity: .9, enter: 'FADE' }),
      text('Quote', 'QUOTE', '“A SHORT QUOTE OVER VIDEO.”', 'QUOTE', [.13, .68, .72, .11], { fontFamily: theme.fontDisplay, fontSize: w * .038, enter: 'TYPE_ON' }),
      text('Credit', 'BYLINE', 'STUDENT VOICE', 'BYLINE', [.13, .81, .46, .04], { fill: theme.accent, fontSize: w * .015 }),
    );
    case 'score-bug': return group(
      shape('Score case', [.68, .06, .27, .18], { fill: theme.primary, stroke: theme.paper, strokeWidth: Math.max(2, w * .002), enter: 'POP' }),
      text('Home team', 'KICKER', 'HOME', 'CUSTOM', [.7, .085, .1, .035], { fill: theme.accent, fontSize: w * .014, align: 'center' }),
      text('Score', 'STAT', '12 — 9', 'CUSTOM', [.7, .125, .21, .07], { fontFamily: theme.fontDisplay, fontSize: w * .043, align: 'center' }),
      text('Away team', 'KICKER', 'AWAY', 'CUSTOM', [.82, .085, .1, .035], { fill: theme.accent, fontSize: w * .014, align: 'center' }),
    );
    case 'result-board': return group(
      shape('Result board', [.08, .16, .84, .68], { fill: theme.primary, stroke: theme.secondary, strokeWidth: Math.max(4, w * .005), enter: 'WIPE' }),
      text('Result', 'STAT', '12 — 9', 'CUSTOM', [.15, .28, .7, .23], { fontFamily: theme.fontDisplay, fontSize: w * .14, align: 'center', enter: 'POP' }),
      text('Result label', 'HEADLINE', 'FINAL SCORE', 'CUSTOM', [.2, .58, .6, .08], { fill: theme.accent, fontSize: w * .035, align: 'center' }),
    );
    case 'news-ticker':
    case 'coming-up-ticker': return group(
      shape('Ticker rail', [.05, .84, .9, .1], { fill: theme.primary, enter: 'SLIDE_UP' }),
      shape('Ticker label', [.05, .84, .19, .1], { fill: theme.accent, enter: 'WIPE' }),
      text('Ticker label', 'KICKER', templateId === 'coming-up-ticker' ? 'COMING UP' : 'NEWS', 'CUSTOM', [.07, .865, .15, .04], { fill: theme.ink, fontSize: w * .016, align: 'center' }),
      text('Ticker text', 'HEADLINE', 'THE NEXT UPDATE GOES HERE', templateId === 'coming-up-ticker' ? 'STORY_TITLE' : 'CUSTOM', [.28, .865, .62, .04], { fontSize: w * .018, enter: 'TYPE_ON' }),
    );
    case 'live-badge':
    case 'location-badge': return group(
      shape('Badge', [.05, .06, templateId === 'live-badge' ? .17 : .3, .08], { fill: templateId === 'live-badge' ? '#D9434E' : theme.accent, radius: w * .03, enter: 'POP' }),
      text('Badge text', templateId === 'location-badge' ? 'LOCATION' : 'KICKER', templateId === 'live-badge' ? '● LIVE' : 'ON CAMPUS', templateId === 'location-badge' ? 'CUSTOM' : 'CUSTOM', [.07, .082, templateId === 'live-badge' ? .13 : .26, .035], { fill: templateId === 'live-badge' ? '#FFFFFF' : theme.ink, fontSize: w * .016, align: 'center' }),
    );
    case 'portrait-window': return group(
      shape('Portrait mat', [.08, .1, .42, .8], { fill: theme.accent, radius: w * .02, rotation: -2, enter: 'POP' }),
      image('Portrait photo', [.105, .13, .37, .64], { radius: w * .014, enter: 'FADE' }),
      shape('Caption card', [.15, .72, .4, .14], { fill: theme.paper, stroke: theme.ink, strokeWidth: Math.max(2, w * .002), rotation: 1, enter: 'SLIDE_UP' }),
      text('Photo caption', 'CAPTION', 'WHO OR WHAT IS IN THIS PHOTO', 'CUSTOM', [.19, .755, .32, .07], { fill: theme.ink, fontSize: w * .02 }),
    );
    case 'picture-in-picture': return group(
      shape('Picture frame', [.59, .48, .34, .4], { fill: theme.paper, stroke: theme.accent, strokeWidth: Math.max(4, w * .005), enter: 'POP' }),
      image('Evidence photo', [.615, .515, .29, .29], { enter: 'FADE' }),
      text('Evidence label', 'CAPTION', 'EVIDENCE', 'CUSTOM', [.63, .82, .25, .035], { fill: theme.accent, fontSize: w * .014, letterSpacing: 2 }),
    );
    case 'show-bug': return group(
      shape('Show bug', [.78, .06, .17, .1], { fill: theme.paper, stroke: theme.accent, strokeWidth: Math.max(2, w * .002), radius: w * .01, enter: 'FADE' }),
      text('Show name', 'LOGO', theme.showName.toUpperCase(), 'SHOW_NAME', [.795, .085, .14, .045], { fill: theme.ink, fontFamily: theme.fontDisplay, fontSize: w * .018, align: 'center' }),
    );
    case 'show-stamp': return group(
      shape('Show stamp ring', squareFrame(.5, .5, .56), { fill: theme.secondary, shape: 'ELLIPSE', radius: w, stroke: theme.paper, strokeWidth: Math.max(4, w * .006), rotation: -4, enter: 'POP' }),
      text('Show name', 'LOGO', theme.showName.toUpperCase(), 'SHOW_NAME', [.38, .4, .24, .14], { fill: theme.paper, fontFamily: theme.fontDisplay, fontSize: w * .045, align: 'center', rotation: -4 }),
    );
    case 'signal-wipe': return group(
      shape('Signal wipe', [.05, .36, .9, .28], { x: -w * .9, fill: theme.secondary, enter: 'NONE', exit: 'NONE', keyframes: [{ id: newId(), atMs: 0, x: -w * .9 }, { id: newId(), atMs: Math.min(500, duration * .5), x: w * .05 }, { id: newId(), atMs: duration, x: w * .95 }] }),
      shape('Wipe accent', [.05, .36, .05, .28], { x: -w * .95, fill: theme.accent, enter: 'NONE', exit: 'NONE', keyframes: [{ id: newId(), atMs: 0, x: -w * .95 }, { id: newId(), atMs: Math.min(500, duration * .5), x: w * .05 }, { id: newId(), atMs: duration, x: w }] }),
    );
    case 'chapter-stripe': return group(
      shape('Chapter stripe', [.05, .42, .9, .16], { fill: theme.primary, stroke: theme.accent, strokeWidth: Math.max(3, w * .003), enter: 'SLIDE_LEFT', exit: 'SLIDE_RIGHT' as MotionPreset }),
      text('Chapter title', 'HEADLINE', 'NEXT STORY', 'CUSTOM', [.2, .465, .6, .07], { fontFamily: theme.fontDisplay, fontSize: w * .04, align: 'center', enter: 'TYPE_ON' }),
    );
    case 'split-signal': return group(
      shape('Left field', [0, 0, .6, 1], { fill: theme.primary, enter: 'FADE' }),
      shape('Right field', [.6, 0, .4, 1], { fill: theme.secondary, enter: 'WIPE' }),
      shape('Signal line', [.58, 0, .02, 1], { fill: theme.accent, enter: 'SLIDE_UP' }),
    );
    case 'grid-wall': return group(
      shape('Grid field', [0, 0, 1, 1], { fill: theme.primary, stroke: theme.secondary, strokeWidth: Math.max(3, w * .003), enter: 'FADE' }),
      ...Array.from({ length: 5 }, (_, index) => shape(`Grid line ${index + 1}`, [index * .2, 0, .002, 1], { fill: theme.secondary, opacity: .45 })),
      ...Array.from({ length: 3 }, (_, index) => shape(`Grid row ${index + 1}`, [0, index / 3, 1, .003], { fill: theme.secondary, opacity: .45 })),
    );
    case 'basic-text': return [text('New words', 'HEADLINE', 'NEW WORDS', 'CUSTOM', [.3, .4, .4, .12], { fontFamily: theme.fontDisplay, fontSize: w * .05, align: 'center', enter: 'POP' })];
    case 'basic-box': return [shape('Box', [.3, .36, .4, .22], { fill: theme.accent })];
    case 'basic-circle': return [shape('Circle', squareFrame(.5, .5, .3), { fill: theme.accent, shape: 'ELLIPSE', radius: w })];
    case 'basic-triangle': return [shape('Triangle', squareFrame(.5, .5, .3), { fill: theme.accent, shape: 'TRIANGLE' })];
    case 'basic-line': return [shape('Line', [.25, .49, .5, .015], { fill: theme.accent, shape: 'LINE', radius: 0 })];
    case 'basic-photo': return [image('Photo', [.3, .2, .4, .6])];
    default: return [];
  }
}
