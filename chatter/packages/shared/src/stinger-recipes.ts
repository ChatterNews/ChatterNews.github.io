import { newId } from './ids.js';
import type { CreativeRole, MotionElement, MotionPackage, MotionScene, MotionSceneKind, MotionTheme } from './types.js';
import { contrastRatio } from './creative.js';

export interface MotionDirection {
  id: string;
  name: string;
  note: string;
  theme: MotionTheme;
}

export interface MotionRecipeFamily {
  id: string;
  name: string;
  job: string;
  bestFor: string;
  sceneKinds: MotionSceneKind[];
  directions: readonly [MotionDirection, MotionDirection, MotionDirection];
}

const theme = (showName: string, primary: string, secondary: string, accent: string, paper: string, ink: string, fontDisplay: string): MotionTheme => ({ showName, primary, secondary, accent, paper, ink, fontDisplay, fontBody: 'Nunito' });
const look = (id: string, name: string, note: string, value: MotionTheme): MotionDirection => ({ id, name, note, theme: value });

export const MOTION_RECIPE_FAMILIES: MotionRecipeFamily[] = [
  { id: 'morning-news', name: 'Morning News', job: 'Build a complete daily school newscast', bestFor: 'Announcements, headlines, interviews, and rundowns', sceneKinds: ['OPEN', 'HEADLINE', 'LOWER_THIRD', 'COMING_UP', 'TRANSITION', 'END'], directions: [
    look('channel-nine', 'Channel Nine', 'Chunky public-access hardware and clear news bars.', theme('Chatter News', '#172A47', '#0DB5C7', '#FFD035', '#FFF7E7', '#111827', 'Archivo Black')),
    look('sunrise-desk', 'Sunrise Desk', 'Warm windows, calm cards, and bright morning rhythm.', theme('Chatter AM', '#3B2459', '#E9578B', '#A6DC3D', '#FFF9EB', '#211731', 'Anybody')),
    look('paper-bulletin', 'Paper Bulletin', 'Pinned notes and newsroom copy-paper texture.', theme('The Daily Chatter', '#283A32', '#6BA36D', '#EB8359', '#F5ECD6', '#1D2822', 'Bree Serif')),
  ] },
  { id: 'science-lab', name: 'Science Lab', job: 'Turn an experiment into clear motion graphics', bestFor: 'Robotics, KidWind, coding, data, and demonstrations', sceneKinds: ['OPEN', 'HEADLINE', 'STAT', 'LOWER_THIRD', 'TRANSITION', 'END'], directions: [
    look('scope-trace', 'Scope Trace', 'Data traces, calibration ticks, and bright evidence.', theme('STEAM Lab', '#102B3C', '#15B8A6', '#F3C84B', '#EFF9F4', '#0D202A', 'Archivo Black')),
    look('blueprint-grid', 'Blueprint Grid', 'Technical lines and diagram-callout panels.', theme('Build Report', '#0A3B69', '#2FB7D6', '#FF7B41', '#EDF7FF', '#09243B', 'Archivo Black')),
    look('museum-demo', 'Museum Demo', 'Quiet exhibit typography for work worth studying.', theme('Discovery Desk', '#27232B', '#A94868', '#D6AA39', '#F3EDDF', '#211E24', 'Newsreader')),
  ] },
  { id: 'sports-scoreboard', name: 'Sports Scoreboard', job: 'Report scores and the moments behind them', bestFor: 'Games, standings, recaps, and player interviews', sceneKinds: ['OPEN', 'STAT', 'HEADLINE', 'LOWER_THIRD', 'COMING_UP', 'END'], directions: [
    look('arena-board', 'Arena Board', 'Score-first slabs with high-contrast team color.', theme('Chatter Sports', '#102A22', '#F05A28', '#B7F34A', '#F5F7EF', '#07150F', 'Archivo Black')),
    look('court-tape', 'Court Tape', 'Floor lines, taped labels, and quick cuts.', theme('Game Desk', '#221B45', '#6E5CE7', '#FFD331', '#FFF8E8', '#17122F', 'Anybody')),
    look('replay-room', 'Replay Room', 'Dark monitor frames and sharp replay markers.', theme('Replay', '#101A2D', '#1F88FF', '#FF4F72', '#F3F6FA', '#09101D', 'Archivo Black')),
  ] },
  { id: 'student-spotlight', name: 'Student Spotlight', job: 'Frame one student voice with care', bestFor: 'Profiles, awards, performances, and project stories', sceneKinds: ['OPEN', 'QUOTE', 'LOWER_THIRD', 'HEADLINE', 'END'], directions: [
    look('portrait-card', 'Portrait Card', 'Magazine portrait space and one memorable quote.', theme('Student Spotlight', '#2C194B', '#D74D82', '#F1C84B', '#FFF8ED', '#211631', 'Newsreader')),
    look('yearbook-notes', 'Yearbook Notes', 'Snapshot corners, labels, and warm paper.', theme('People of PA STEAM', '#23404B', '#2EAF9B', '#FF805A', '#FFF2D6', '#192D34', 'Bree Serif')),
    look('studio-profile', 'Studio Profile', 'Clean interview cards with bold name type.', theme('Meet the Maker', '#13233B', '#3C78F2', '#B5DD3C', '#F7F8F1', '#0D1828', 'Archivo Black')),
  ] },
  { id: 'event-countdown', name: 'Event Countdown', job: 'Build anticipation and make the details stick', bestFor: 'STEAM nights, performances, open houses, and showcases', sceneKinds: ['OPEN', 'STAT', 'COMING_UP', 'HEADLINE', 'END'], directions: [
    look('marquee-clock', 'Marquee Clock', 'Huge count, ticket lights, and stage-card timing.', theme('Showcase Countdown', '#291749', '#EF4D8D', '#FFD42B', '#FFF8E8', '#1B102F', 'Luckiest Guy')),
    look('signal-count', 'Signal Count', 'Broadcast countdown blocks and modular details.', theme('Next Up', '#142D49', '#13B7C7', '#FF7138', '#F7F3E8', '#0E2033', 'Archivo Black')),
    look('paper-chain', 'Paper Chain', 'Cut-paper numbers with cheerful chapter colors.', theme('Three Days To Go', '#3A235C', '#8DCF3C', '#FF8345', '#FFF9EA', '#28183F', 'Baloo 2')),
  ] },
  { id: 'weather-desk', name: 'Weather Desk', job: 'Explain conditions and what students should expect', bestFor: 'Daily weather, closings, field days, and outdoor plans', sceneKinds: ['OPEN', 'STAT', 'HEADLINE', 'COMING_UP', 'END'], directions: [
    look('weather-map', 'Weather Map', 'Map panels, temperature bugs, and clean forecast labels.', theme('Chatter Weather', '#143B65', '#27B8D0', '#FFD04A', '#F0F8FF', '#102B48', 'Archivo Black')),
    look('window-watch', 'Window Watch', 'Soft horizon blocks with strong practical details.', theme('Outside Today', '#31517A', '#73C4CC', '#F5B64C', '#FFF9E8', '#20354E', 'Anybody')),
    look('field-day', 'Field Day', 'Outdoor score-card energy for go/no-go updates.', theme('Field Day Forecast', '#224532', '#62AA58', '#F28A45', '#F8F2DD', '#173023', 'Bree Serif')),
  ] },
  { id: 'arts-stage', name: 'Arts & Stage', job: 'Give performances and artwork a real opening night', bestFor: 'Concerts, theater, galleries, dance, and artist interviews', sceneKinds: ['OPEN', 'HEADLINE', 'LOWER_THIRD', 'QUOTE', 'COMING_UP', 'END'], directions: [
    look('stage-door', 'Stage Door', 'Curtain edges, program cards, and marquee type.', theme('Arts at PA STEAM', '#311642', '#B73B68', '#E7B441', '#FBF0DC', '#23102F', 'Newsreader')),
    look('gallery-label', 'Gallery Label', 'Measured white space and exhibit-grade captions.', theme('Student Gallery', '#27252A', '#916B4B', '#D7B35A', '#F4EFE5', '#1D1B1F', 'Newsreader')),
    look('rehearsal-tape', 'Rehearsal Tape', 'Floor marks, handwritten cues, and lively entrances.', theme('Backstage', '#1D3541', '#2EAB9F', '#F47D52', '#FFF3D9', '#14262E', 'Bree Serif')),
  ] },
  { id: 'community-alert', name: 'Community Update', job: 'Share an important change without causing confusion', bestFor: 'Schedules, family information, service projects, and safety notes', sceneKinds: ['OPEN', 'HEADLINE', 'STAT', 'COMING_UP', 'END'], directions: [
    look('civic-signal', 'Civic Signal', 'Calm official bands and a single action at a time.', theme('Community Update', '#173047', '#2A98A4', '#F2C552', '#FBF4E5', '#102330', 'Newsreader')),
    look('notice-board', 'Notice Board', 'Pinned sections for what changed and what to do.', theme('School Notice', '#334033', '#6A9B61', '#E87850', '#F6ECD6', '#242E24', 'Bree Serif')),
    look('clear-channel', 'Clear Channel', 'Direct broadcast cards with no alarmist decoration.', theme('Important Update', '#222B36', '#E46C43', '#F0CD4A', '#F7F2E7', '#171E26', 'Archivo Black')),
  ] },
  { id: 'podcast-video', name: 'Podcast Video', job: 'Give a Chatterbox conversation a visual identity', bestFor: 'Video podcasts, pull quotes, guests, chapters, and audiograms', sceneKinds: ['OPEN', 'LOWER_THIRD', 'QUOTE', 'HEADLINE', 'COMING_UP', 'END'], directions: [
    look('wave-table', 'Wave Table', 'Waveforms, talk cards, and warm studio controls.', theme('Chatterbox', '#2D1A4C', '#E95186', '#A8DB3F', '#FFF8E9', '#201333', 'Anybody')),
    look('mic-check', 'Mic Check', 'Mic flags and confident guest cards.', theme('Chatterbox Podcast', '#152C45', '#1CB4C6', '#FF7A3C', '#F7F2E6', '#0F2031', 'Archivo Black')),
    look('cassette-notes', 'Cassette Notes', 'Liner-note paper and chapter labels.', theme('Chatterbox Sessions', '#394036', '#759969', '#E78158', '#F6ECD4', '#292E27', 'Bree Serif')),
  ] },
];

export const LEGACY_MOTION_ALIASES: Record<string, { familyId: string; directionId: string }> = {
  bulletin: { familyId: 'morning-news', directionId: 'channel-nine' },
  'clean-desk': { familyId: 'morning-news', directionId: 'paper-bulletin' },
  'yearbook-pop': { familyId: 'student-spotlight', directionId: 'yearbook-notes' },
  'sports-desk': { familyId: 'sports-scoreboard', directionId: 'arena-board' },
};

const SCENE_LABELS: Record<MotionSceneKind, string> = { OPEN: 'Show open', HEADLINE: 'Headline', LOWER_THIRD: 'Lower third', QUOTE: 'Quote card', STAT: 'Big number', COMING_UP: 'Coming up', TRANSITION: 'Story transition', END: 'End card' };

function durationFor(kind: MotionSceneKind): number {
  return kind === 'TRANSITION' ? 1000 : kind === 'LOWER_THIRD' ? 5200 : kind === 'QUOTE' ? 6000 : 4400;
}

function item(kind: MotionElement['kind'], name: string, role: CreativeRole, durationMs: number, input: Partial<MotionElement>): MotionElement {
  return {
    id: newId(), kind, name, role, recipeOwned: kind === 'SHAPE', x: 0, y: 0, width: 100, height: 100,
    rotation: 0, scale: 1, opacity: 1, hidden: false, locked: kind === 'SHAPE',
    shape: 'RECTANGLE', fill: '#FFFFFF', stroke: 'transparent', strokeWidth: 0, radius: 0,
    fontFamily: 'Nunito', fontSize: 72, fontWeight: 800, align: 'left', letterSpacing: 0, lineHeight: 1.05,
    startMs: 0, endMs: durationMs, enter: 'FADE', exit: 'FADE', ease: 'EASE_OUT', keyframes: [],
    ...input,
  };
}

function copyFor(kind: MotionSceneKind) {
  if (kind === 'OPEN') return { headline: 'THE CHATTER STARTS NOW', kicker: 'STUDENT NEWS · MADE HERE' };
  if (kind === 'LOWER_THIRD') return { headline: 'Maya R.', kicker: 'Student reporter · Grade 6' };
  if (kind === 'QUOTE') return { headline: '“Every mistake gave us the next clue.”', kicker: 'FROM THE WORKBENCH' };
  if (kind === 'STAT') return { headline: '3.8 V', kicker: 'OUR STRONGEST TURBINE TEST' };
  if (kind === 'COMING_UP') return { headline: 'COMING UP', kicker: 'THE ROBOT THAT SORTS RECYCLING' };
  if (kind === 'END') return { headline: 'THANKS FOR WATCHING', kicker: 'MORE STORIES IN THE MEDIA BIN' };
  return { headline: 'STUDENTS TURN WIND INTO WATTS', kicker: 'ENGINEERING · ON CAMPUS' };
}

function bindingFor(kind: MotionSceneKind, target: 'headline' | 'kicker'): MotionElement['binding'] {
  if (kind === 'OPEN') return target === 'headline' ? 'SHOW_NAME' : 'CHANNEL';
  if (kind === 'LOWER_THIRD') return target === 'headline' ? 'BYLINE' : 'CHANNEL';
  if (kind === 'QUOTE') return target === 'headline' ? 'QUOTE' : 'CHANNEL';
  if (kind === 'HEADLINE' || kind === 'COMING_UP') return target === 'headline' ? (kind === 'HEADLINE' ? 'STORY_TITLE' : 'CUSTOM') : (kind === 'COMING_UP' ? 'STORY_TITLE' : 'CHANNEL');
  return 'CUSTOM';
}

function transitionScene(themeValue: MotionTheme, width: number, height: number): MotionScene {
  const durationMs = durationFor('TRANSITION');
  return { id: newId(), name: SCENE_LABELS.TRANSITION, kind: 'TRANSITION', durationMs, background: 'transparent', elements: [item('SHAPE', 'Signal slide', 'DECORATION', durationMs, { x: -width * .7, y: height * .38, width: width * .7, height: height * .24, fill: themeValue.secondary, enter: 'NONE', exit: 'NONE', keyframes: [{ id: newId(), atMs: 0, x: -width * .7 }, { id: newId(), atMs: 500, x: width * .15 }, { id: newId(), atMs: 1000, x: width }] })] };
}

function guaranteeMotionContrast(elements: MotionElement[], background: string, themeValue: MotionTheme, width: number) {
  elements.forEach((entry, index) => {
    if (entry.kind !== 'TEXT') return;
    const cx = entry.x + entry.width / 2; const cy = entry.y + entry.height / 2;
    const surface = [...elements.slice(0, index)].reverse().find((candidate) => candidate.kind === 'SHAPE' && cx >= candidate.x && cy >= candidate.y && cx <= candidate.x + candidate.width && cy <= candidate.y + candidate.height)?.fill ?? background;
    const required = entry.fontSize >= width * .032 ? 3 : 4.5;
    if (contrastRatio(entry.fill, surface) >= required) return;
    entry.fill = [themeValue.ink, themeValue.paper, '#000000', '#FFFFFF'].sort((a, b) => contrastRatio(b, surface) - contrastRatio(a, surface))[0]!;
  });
}

type NormalizedBox = readonly [x: number, y: number, width: number, height: number];
type MotionCompositionProfile = {
  headline: NormalizedBox;
  kicker: NormalizedBox;
  shapes: readonly [NormalizedBox, NormalizedBox];
  align?: MotionElement['align'];
  headlineRotation?: number;
  shapeRotations?: readonly [number, number];
};

const mb = (x: number, y: number, width: number, height: number): NormalizedBox => [x, y, width, height];
const mc = (
  headline: NormalizedBox,
  kicker: NormalizedBox,
  firstShape: NormalizedBox,
  secondShape: NormalizedBox,
  align: MotionElement['align'] = 'left',
  headlineRotation = 0,
  shapeRotations: readonly [number, number] = [0, 0],
): MotionCompositionProfile => ({ headline, kicker, shapes: [firstShape, secondShape], align, headlineRotation, shapeRotations });

// These are stage maps, not skins. The same semantic words can move between
// them without becoming a recolored copy of the previous kit.
const MOTION_COMPOSITIONS: Record<string, MotionCompositionProfile> = {
  'channel-nine': mc(mb(.17, .25, .67, .30), mb(.17, .64, .58, .08), mb(0, 0, .12, 1), mb(.14, .17, .18, .055)),
  'sunrise-desk': mc(mb(.10, .20, .80, .26), mb(.20, .59, .60, .075), mb(0, .66, 1, .34), mb(.72, .08, .20, .48), 'center'),
  'paper-bulletin': mc(mb(.16, .25, .64, .31), mb(.18, .64, .52, .08), mb(.08, .10, .84, .80), mb(.06, .17, .16, .05), 'left', -1, [-1, 2]),
  'scope-trace': mc(mb(.09, .22, .49, .31), mb(.09, .63, .46, .075), mb(.63, .12, .29, .70), mb(.07, .12, .12, .04)),
  'blueprint-grid': mc(mb(.43, .21, .47, .28), mb(.43, .60, .42, .08), mb(.05, .08, .90, .84), mb(.08, .16, .28, .62)),
  'museum-demo': mc(mb(.11, .18, .78, .23), mb(.53, .62, .34, .07), mb(.08, .12, .84, .72), mb(.08, .56, .38, .20), 'left'),
  'arena-board': mc(mb(.08, .28, .58, .30), mb(.09, .67, .50, .075), mb(.70, .08, .24, .84), mb(.04, .13, .62, .07)),
  'court-tape': mc(mb(.17, .18, .66, .25), mb(.19, .68, .48, .075), mb(.06, .10, .88, .80), mb(.09, .48, .76, .12), 'center', -2, [0, 2]),
  'replay-room': mc(mb(.43, .24, .47, .29), mb(.46, .64, .39, .07), mb(.05, .12, .34, .72), mb(.43, .14, .47, .06)),
  'portrait-card': mc(mb(.45, .27, .43, .29), mb(.46, .66, .38, .07), mb(.07, .10, .33, .80), mb(.40, .18, .53, .58)),
  'yearbook-notes': mc(mb(.10, .23, .47, .28), mb(.11, .65, .42, .075), mb(.62, .12, .29, .66), mb(.07, .14, .54, .58), 'left', -1, [2, -2]),
  'studio-profile': mc(mb(.14, .19, .72, .25), mb(.22, .60, .56, .075), mb(.09, .12, .82, .68), mb(.14, .50, .72, .08), 'center'),
  'marquee-clock': mc(mb(.08, .25, .84, .34), mb(.24, .69, .52, .08), mb(.04, .10, .92, .72), mb(.38, .06, .24, .12), 'center'),
  'signal-count': mc(mb(.10, .17, .53, .36), mb(.10, .65, .47, .075), mb(.68, .08, .26, .84), mb(.06, .11, .57, .08)),
  'paper-chain': mc(mb(.18, .27, .64, .28), mb(.23, .66, .54, .075), mb(.05, .16, .36, .66), mb(.58, .09, .35, .73), 'center', 1, [-4, 5]),
  'weather-map': mc(mb(.08, .20, .44, .27), mb(.09, .58, .42, .075), mb(.56, .08, .38, .78), mb(.05, .70, .48, .12)),
  'window-watch': mc(mb(.14, .18, .72, .25), mb(.19, .62, .62, .075), mb(0, .58, 1, .42), mb(.08, .10, .84, .43), 'center'),
  'field-day': mc(mb(.39, .22, .51, .27), mb(.40, .61, .46, .075), mb(.05, .10, .29, .76), mb(.37, .12, .55, .07)),
  'stage-door': mc(mb(.19, .22, .62, .29), mb(.26, .64, .48, .075), mb(0, 0, .15, 1), mb(.85, 0, .15, 1), 'center'),
  'gallery-label': mc(mb(.45, .22, .43, .25), mb(.47, .60, .38, .07), mb(.08, .12, .30, .72), mb(.42, .16, .49, .53)),
  'rehearsal-tape': mc(mb(.10, .26, .67, .28), mb(.11, .65, .57, .075), mb(.04, .12, .88, .68), mb(.69, .12, .22, .68), 'left', -2, [2, -3]),
  'civic-signal': mc(mb(.11, .21, .78, .24), mb(.11, .58, .56, .075), mb(0, 0, 1, .13), mb(.72, .53, .18, .25)),
  'notice-board': mc(mb(.10, .18, .54, .27), mb(.11, .58, .48, .075), mb(.06, .10, .88, .78), mb(.68, .18, .22, .54), 'left', 0, [-1, 1]),
  'clear-channel': mc(mb(.16, .27, .68, .27), mb(.24, .65, .52, .075), mb(0, .72, 1, .28), mb(.08, .16, .84, .07), 'center'),
  'wave-table': mc(mb(.13, .20, .74, .26), mb(.20, .61, .60, .075), mb(.06, .12, .88, .67), mb(.10, .51, .80, .10), 'center'),
  'mic-check': mc(mb(.38, .23, .52, .28), mb(.40, .63, .46, .075), mb(.06, .11, .27, .74), mb(.36, .13, .56, .08)),
  'cassette-notes': mc(mb(.13, .26, .61, .27), mb(.14, .65, .53, .075), mb(.07, .12, .86, .72), mb(.70, .18, .19, .50), 'left', 1, [1, -2]),
};

function applyMotionComposition(elements: MotionElement[], direction: MotionDirection, kind: MotionSceneKind, width: number, height: number) {
  if (kind === 'LOWER_THIRD') return;
  const profile = MOTION_COMPOSITIONS[direction.id];
  if (!profile) return;
  const headline = elements.find((entry) => entry.kind === 'TEXT' && entry.role !== 'KICKER');
  const kicker = elements.find((entry) => entry.kind === 'TEXT' && entry.role === 'KICKER');
  const shapes = elements.filter((entry) => entry.kind === 'SHAPE');
  const place = (entry: MotionElement | undefined, box: NormalizedBox) => {
    if (!entry) return;
    entry.x = box[0] * width; entry.y = box[1] * height; entry.width = box[2] * width; entry.height = box[3] * height;
  };
  place(headline, profile.headline); place(kicker, profile.kicker);
  place(shapes[0], profile.shapes[0]); place(shapes[1], profile.shapes[1]);
  if (headline) {
    headline.align = profile.align ?? 'left';
    headline.rotation = profile.headlineRotation ?? 0;
    const sizeForWidth = profile.headline[2] * width / (kind === 'STAT' ? 4.1 : 9.4);
    const sizeForHeight = profile.headline[3] * height / (kind === 'STAT' ? 1.15 : 3.25);
    headline.fontSize = Math.max(width * .038, Math.min(headline.fontSize, sizeForWidth, sizeForHeight));
  }
  if (kicker) kicker.fontSize = Math.max(width * .016, Math.min(kicker.fontSize, profile.kicker[2] * width / 18, profile.kicker[3] * height / 1.2));
  if (shapes[0]) shapes[0].rotation = profile.shapeRotations?.[0] ?? 0;
  if (shapes[1]) shapes[1].rotation = profile.shapeRotations?.[1] ?? 0;
}

export function makeMotionRecipeScene(familyId: string, directionId: string | undefined, kind: MotionSceneKind, width = 1920, height = 1080): MotionScene {
  const family = MOTION_RECIPE_FAMILIES.find((row) => row.id === familyId) ?? MOTION_RECIPE_FAMILIES[0]!;
  const direction = family.directions.find((row) => row.id === directionId) ?? family.directions[0];
  const themeValue = direction.theme;
  if (kind === 'TRANSITION') return transitionScene(themeValue, width, height);
  const durationMs = durationFor(kind);
  const textCopy = copyFor(kind);
  const familyIndex = MOTION_RECIPE_FAMILIES.findIndex((row) => row.id === family.id);
  const directionIndex = family.directions.findIndex((row) => row.id === direction.id);
  const grammar = familyIndex % 3;
  const variant = directionIndex;
  const elements: MotionElement[] = [];

  if (kind === 'LOWER_THIRD') {
    elements.push(item('SHAPE', 'Name plate', 'DECORATION', durationMs, { x: width * .055, y: height * .7, width: width * (variant === 1 ? .72 : .58), height: height * .22, fill: variant === 2 ? themeValue.paper : themeValue.primary, radius: variant === 0 ? 22 : 4, enter: 'SLIDE_LEFT', exit: 'SLIDE_LEFT' }));
    elements.push(item('SHAPE', 'Role stripe', 'DECORATION', durationMs, { x: width * .055, y: height * .7, width: width * .018, height: height * .22, fill: themeValue.accent, enter: 'WIPE', exit: 'FADE' }));
    elements.push(item('TEXT', 'Headline', 'BYLINE', durationMs, { text: textCopy.headline, binding: 'BYLINE', x: width * .095, y: height * .735, width: width * .48, height: height * .08, fill: variant === 2 ? themeValue.ink : themeValue.paper, fontFamily: themeValue.fontDisplay, fontSize: width * .036, enter: 'SLIDE_UP' }));
    elements.push(item('TEXT', 'Kicker', 'KICKER', durationMs, { text: textCopy.kicker, binding: 'CHANNEL', x: width * .095, y: height * .83, width: width * .48, height: height * .05, fill: themeValue.accent, fontSize: width * .018, letterSpacing: 2, enter: 'FADE' }));
  } else if (grammar === 0) {
    elements.push(item('SHAPE', 'Broadcast rail', 'DECORATION', durationMs, { x: variant === 1 ? width * .06 : 0, y: variant === 2 ? height * .72 : 0, width: variant === 1 ? width * .18 : (variant === 2 ? width : width * .12), height: variant === 1 ? height * .88 : (variant === 2 ? height * .28 : height), fill: themeValue.secondary, enter: 'WIPE' }));
    elements.push(item('SHAPE', 'Signal block', 'DECORATION', durationMs, { x: width * .14, y: height * .18, width: width * .16, height: height * .05, fill: themeValue.accent, enter: 'SLIDE_LEFT' }));
    elements.push(item('TEXT', 'Headline', kind === 'STAT' ? 'STAT' : 'HEADLINE', durationMs, { text: textCopy.headline, binding: bindingFor(kind, 'headline'), x: width * .16, y: height * .28, width: width * .7, height: height * .3, fill: themeValue.paper, fontFamily: themeValue.fontDisplay, fontSize: width * (kind === 'STAT' ? .14 : .072), align: variant === 2 ? 'center' : 'left', enter: kind === 'STAT' ? 'POP' : 'SLIDE_UP' }));
    elements.push(item('TEXT', 'Kicker', 'KICKER', durationMs, { text: textCopy.kicker, binding: bindingFor(kind, 'kicker'), x: width * .16, y: height * .65, width: width * .66, height: height * .09, fill: themeValue.accent, fontSize: width * .025, letterSpacing: 3, enter: 'FADE' }));
  } else if (grammar === 1) {
    elements.push(item('SHAPE', 'Lab grid', 'DECORATION', durationMs, { x: width * .05, y: height * .08, width: width * .9, height: height * .84, fill: themeValue.paper, stroke: themeValue.secondary, strokeWidth: 6, radius: variant === 1 ? 0 : 20, enter: 'FADE' }));
    elements.push(item('SHAPE', 'Data window', 'DECORATION', durationMs, { x: width * .08, y: height * .15, width: width * (variant === 2 ? .36 : .5), height: height * .62, fill: themeValue.primary, radius: 12, enter: 'WIPE' }));
    elements.push(item('TEXT', 'Headline', kind === 'STAT' ? 'STAT' : 'HEADLINE', durationMs, { text: textCopy.headline, binding: bindingFor(kind, 'headline'), x: width * (variant === 2 ? .49 : .12), y: height * .25, width: width * (variant === 2 ? .4 : .72), height: height * .3, fill: variant === 2 ? themeValue.ink : themeValue.paper, fontFamily: themeValue.fontDisplay, fontSize: width * (kind === 'STAT' ? .13 : .065), align: variant === 0 ? 'center' : 'left', enter: 'TYPE_ON' }));
    elements.push(item('TEXT', 'Kicker', 'KICKER', durationMs, { text: textCopy.kicker, binding: bindingFor(kind, 'kicker'), x: width * (variant === 2 ? .49 : .12), y: height * .62, width: width * .4, height: height * .1, fill: themeValue.secondary, fontSize: width * .022, letterSpacing: 2, enter: 'FADE' }));
  } else {
    elements.push(item('SHAPE', 'Portrait frame', 'DECORATION', durationMs, { x: variant === 1 ? width * .58 : width * .07, y: height * .1, width: width * .35, height: height * .8, fill: themeValue.secondary, radius: variant === 0 ? 42 : 4, rotation: variant === 2 ? -3 : 0, enter: 'POP' }));
    elements.push(item('SHAPE', 'Quote paper', 'DECORATION', durationMs, { x: variant === 1 ? width * .08 : width * .38, y: height * .19, width: width * .54, height: height * .62, fill: themeValue.paper, radius: variant === 2 ? 6 : 24, rotation: variant === 2 ? 2 : 0, enter: 'SLIDE_UP' }));
    elements.push(item('TEXT', 'Headline', kind === 'STAT' ? 'STAT' : kind === 'QUOTE' ? 'QUOTE' : 'HEADLINE', durationMs, { text: textCopy.headline, binding: bindingFor(kind, 'headline'), x: variant === 1 ? width * .12 : width * .43, y: height * .3, width: width * .44, height: height * .28, fill: themeValue.ink, fontFamily: themeValue.fontDisplay, fontSize: width * (kind === 'STAT' ? .12 : .058), enter: kind === 'QUOTE' ? 'TYPE_ON' : 'POP' }));
    elements.push(item('TEXT', 'Kicker', 'KICKER', durationMs, { text: textCopy.kicker, binding: bindingFor(kind, 'kicker'), x: variant === 1 ? width * .12 : width * .43, y: height * .66, width: width * .42, height: height * .08, fill: themeValue.secondary, fontSize: width * .02, letterSpacing: 2, enter: 'FADE' }));
  }
  applyMotionComposition(elements, direction, kind, width, height);
  guaranteeMotionContrast(elements, themeValue.primary, themeValue, width);
  return { id: newId(), name: SCENE_LABELS[kind], kind, durationMs, background: themeValue.primary, backgroundSecondary: variant === 2 ? themeValue.secondary : undefined, elements };
}

export function resolveMotionRecipe(templateId: string): { family: MotionRecipeFamily; direction: MotionDirection } {
  const alias = LEGACY_MOTION_ALIASES[templateId];
  const family = MOTION_RECIPE_FAMILIES.find((row) => row.id === (alias?.familyId ?? templateId)) ?? MOTION_RECIPE_FAMILIES[0]!;
  const direction = family.directions.find((row) => row.id === alias?.directionId) ?? family.directions[0];
  return { family, direction };
}

export function remixMotionPackage(project: MotionPackage, directionId: string): MotionPackage {
  const recipe = project.creativeRecipe;
  if (!recipe) return project;
  const family = MOTION_RECIPE_FAMILIES.find((row) => row.id === recipe.familyId) ?? MOTION_RECIPE_FAMILIES[0]!;
  const direction = family.directions.find((row) => row.id === directionId) ?? family.directions[0];
  const previous = new Map<string, MotionElement>();
  project.scenes.forEach((scene) => scene.elements.forEach((element) => { if (element.role && !element.recipeOwned) previous.set(`${scene.kind}:${element.role}`, element); }));
  const scenes = family.sceneKinds.map((kind) => makeMotionRecipeScene(family.id, direction.id, kind, project.width, project.height));
  scenes.forEach((scene) => scene.elements.forEach((element) => {
    if (!element.role || element.recipeOwned) return;
    const source = previous.get(`${scene.kind}:${element.role}`);
    if (!source) return;
    element.text = source.text; element.binding = source.binding; element.imageAssetId = source.imageAssetId;
  }));
  return { ...project, theme: structuredClone(direction.theme), scenes, creativeRecipe: { ...recipe, directionId: direction.id } };
}
