import type { BlastElement, BlastPage, BlastProject, CreativeRole } from '@chatter/shared';
import { contrastRatio, newId } from '@chatter/shared';
import { element } from './blast-model.js';

export interface BlastDirection {
  id: string;
  name: string;
  note: string;
  palette: readonly [string, string, string, string];
  displayFont: string;
}

export interface BlastRecipeFamily {
  id: string;
  name: string;
  job: string;
  audience: string;
  bestFor: string;
  tone: string;
  format: BlastProject['format'];
  directions: readonly [BlastDirection, BlastDirection, BlastDirection];
}

type RecipeBuild = Pick<BlastProject, 'title' | 'format' | 'width' | 'height' | 'pages' | 'creativeRecipe'>;
type FamilyCopy = { kicker: string; headline: string; deck: string; body: string; date: string; cta: string; stat: string; quote: string };

const direction = (id: string, name: string, note: string, palette: BlastDirection['palette'], displayFont: string): BlastDirection => ({ id, name, note, palette, displayFont });

export const BLAST_RECIPE_FAMILIES: BlastRecipeFamily[] = [
  { id: 'event-poster', name: 'Big Day Poster', job: 'Pack the hallway for one school event', audience: 'Students and families', bestFor: 'STEAM nights, showcases, performances, games, and open houses', tone: 'Immediate, joyful, impossible to miss', format: 'LETTER_PORTRAIT', directions: [
    direction('marquee', 'Hallway Marquee', 'Big type, ticket stubs, one hero image.', ['#20133A', '#FF4E93', '#FFD51E', '#FFF8E8'], 'Luckiest Guy'),
    direction('signal-stack', 'Signal Stack', 'Modular bands with broadcast rhythm.', ['#142B4A', '#16BFD4', '#FF6A2A', '#F7F2E4'], 'Archivo Black'),
    direction('paper-burst', 'Paper Burst', 'Cut-paper energy with a tilted headline.', ['#522389', '#A7E22E', '#FF8A1F', '#FFFDF7'], 'Baloo 2'),
  ] },
  { id: 'family-newsletter', name: 'Family News', job: 'Turn several stories into a readable issue', audience: 'Families and school community', bestFor: 'Monthly news, principal notes, classroom updates, and calendars', tone: 'Trustworthy, warm, easy to scan', format: 'LETTER_PORTRAIT', directions: [
    direction('front-page', 'Front Page', 'Classic masthead and confident editorial grid.', ['#102B46', '#1A9CB0', '#F3C94A', '#FBF6E9'], 'Newsreader'),
    direction('field-journal', 'Field Journal', 'Notebook rules, tabs, and hand-labeled sections.', ['#2D3828', '#79A864', '#E98354', '#FAF1D4'], 'Bree Serif'),
    direction('bright-edition', 'Bright Edition', 'Friendly modules and oversized section markers.', ['#321B5B', '#EF4E91', '#82D62D', '#FFFDF8'], 'Anybody'),
  ] },
  { id: 'science-showcase', name: 'Discovery Board', job: 'Explain what the team tested and learned', audience: 'Classmates, judges, and families', bestFor: 'Engineering builds, coding projects, KidWind, robotics, and science fairs', tone: 'Curious, evidence-led, proudly handmade', format: 'LETTER_LANDSCAPE', directions: [
    direction('field-notes', 'Field Notes', 'Observation cards, taped photo, evidence labels.', ['#173A35', '#48A979', '#F4C84A', '#FBF2D8'], 'Bree Serif'),
    direction('blueprint', 'Blueprint', 'Diagram grid with crisp technical callouts.', ['#0B3D69', '#2BB8D6', '#F7D154', '#EDF8FF'], 'Archivo Black'),
    direction('museum-label', 'Museum Label', 'Quiet gallery structure that makes the work feel important.', ['#24212B', '#B44B6E', '#D7A933', '#F5EFE1'], 'Newsreader'),
  ] },
  { id: 'club-recruitment', name: 'Join the Crew', job: 'Convince a student to try a club', audience: 'Students looking for their place', bestFor: 'Media club, robotics, arts, sports, service, and new groups', tone: 'Welcoming, specific, full of possibility', format: 'LETTER_PORTRAIT', directions: [
    direction('sticker-board', 'Sticker Board', 'Collectible badges around a clear invitation.', ['#3D2068', '#17BDD1', '#FFCB22', '#FFF8ED'], 'Baloo 2'),
    direction('crew-call', 'Crew Call', 'Public-access audition sheet with job cards.', ['#15273D', '#EF4F3B', '#A3DB3E', '#F7F0DD'], 'Archivo Black'),
    direction('open-door', 'Open Door', 'Photo-led welcome with calm details.', ['#32312E', '#E8794A', '#65A98B', '#FFF9E9'], 'Bree Serif'),
  ] },
  { id: 'student-spotlight', name: 'Student Spotlight', job: 'Celebrate one person and the work behind the moment', audience: 'Students, families, and staff', bestFor: 'Profiles, awards, performances, projects, and student voices', tone: 'Personal, respectful, magazine-like', format: 'LETTER_PORTRAIT', directions: [
    direction('cover-story', 'Cover Story', 'Portrait first, with one strong quote.', ['#291A4A', '#D94E82', '#F2C94C', '#FFF9EF'], 'Newsreader'),
    direction('scrapbook-profile', 'Scrapbook Profile', 'Snapshots, labels, and handwritten energy.', ['#203E4A', '#2DB7A3', '#FF845C', '#FFF5D8'], 'Bree Serif'),
    direction('studio-card', 'Studio Card', 'Bold blocks and a clean interview rhythm.', ['#101D34', '#3E7CFF', '#C6E83E', '#F7F8F1'], 'Archivo Black'),
  ] },
  { id: 'field-guide', name: 'Field Guide', job: 'Help readers notice and understand a place', audience: 'Students, visitors, and community partners', bestFor: 'Watershed walks, campus tours, nature notes, and local history', tone: 'Observant, useful, outdoorsy', format: 'LETTER_PORTRAIT', directions: [
    direction('trail-card', 'Trail Card', 'Mapped route, specimen cards, and quick facts.', ['#263D2C', '#6BA64D', '#E7B34F', '#F7EFD5'], 'Bree Serif'),
    direction('ranger-sheet', 'Ranger Sheet', 'Official guide structure with bright stamps.', ['#173852', '#2CA7A0', '#F07848', '#F9F3DE'], 'Archivo Black'),
    direction('nature-zine', 'Nature Zine', 'Photocopied labels with playful field marks.', ['#38214D', '#86C83E', '#FF8A40', '#FFF9E8'], 'Anybody'),
  ] },
  { id: 'how-it-works', name: 'How It Works', job: 'Teach a process one clear step at a time', audience: 'Anyone trying the project next', bestFor: 'Coding demos, maker instructions, lab methods, and design thinking', tone: 'Clear, visual, encouraging', format: 'LETTER_LANDSCAPE', directions: [
    direction('diagram-desk', 'Diagram Desk', 'One hero diagram with numbered callouts.', ['#132E4D', '#24AAC1', '#FFCF32', '#F5F1E5'], 'Archivo Black'),
    direction('step-cards', 'Step Cards', 'Chunky sequential cards built for fast scanning.', ['#35215B', '#F04D8A', '#9EDB37', '#FFF8EC'], 'Baloo 2'),
    direction('lab-manual', 'Lab Manual', 'Measured grid with notes from the workbench.', ['#26352F', '#4F9F76', '#E46C4C', '#F4EBD4'], 'Bree Serif'),
  ] },
  { id: 'community-update', name: 'Community Update', job: 'Share a change people need to understand or act on', audience: 'The whole school community', bestFor: 'Schedule changes, service projects, family notices, and public updates', tone: 'Calm, direct, accountable', format: 'LETTER_PORTRAIT', directions: [
    direction('notice-board', 'Notice Board', 'Civic bulletin hierarchy with a bright action box.', ['#173047', '#2B9AA5', '#F3C451', '#FBF5E7'], 'Newsreader'),
    direction('town-square', 'Town Square', 'Friendly modules for who, what, where, and why.', ['#3A245B', '#D74D7B', '#8FCD45', '#FFF9ED'], 'Anybody'),
    direction('signal-note', 'Signal Note', 'Urgent bands without alarmist styling.', ['#202A35', '#ED6B43', '#F1CD4C', '#F8F2E3'], 'Archivo Black'),
  ] },
  { id: 'photo-essay', name: 'Photo Story', job: 'Let a sequence of pictures carry the story', audience: 'Readers who want to feel present', bestFor: 'Field trips, performances, build days, games, and behind-the-scenes coverage', tone: 'Cinematic, paced, caption-smart', format: 'LETTER_LANDSCAPE', directions: [
    direction('contact-sheet', 'Contact Sheet', 'Documentary frames with honest captions.', ['#25232B', '#D95061', '#E7C34A', '#F5F0E7'], 'Newsreader'),
    direction('big-frame', 'Big Frame', 'One unforgettable image plus supporting moments.', ['#182D43', '#20A6B8', '#F08A3C', '#FFF8E8'], 'Archivo Black'),
    direction('cut-and-paste', 'Cut & Paste', 'Layered snapshots with zine-like notes.', ['#3C2057', '#DE4F91', '#9BD43D', '#FFFBEF'], 'Anybody'),
  ] },
  { id: 'social-story', name: 'Social Story', job: 'Build a short swipe-through announcement', audience: 'Students checking a screen or school feed', bestFor: 'Recaps, countdowns, quick explainers, and event reminders', tone: 'Fast, focused, readable at arm’s length', format: 'STORY', directions: [
    direction('countdown', 'Countdown', 'Huge numbers and one action per card.', ['#28184D', '#F14E92', '#FFD529', '#FFF9E9'], 'Luckiest Guy'),
    direction('channel-cards', 'Channel Cards', 'Broadcast frames with a clear progress rhythm.', ['#112D49', '#1BB6C8', '#F2783C', '#F7F3E6'], 'Archivo Black'),
    direction('paper-swipe', 'Paper Swipe', 'Cut-paper panels and bright chapter tabs.', ['#35235C', '#8BD53E', '#FF8640', '#FFF8E9'], 'Baloo 2'),
  ] },
];

const COPY: Record<string, FamilyCopy> = {
  'event-poster': { kicker: 'PENNSYLVANIA STEAM ACADEMY PRESENTS', headline: 'STEAM NIGHT', deck: 'Build it. Test it. Show it.', body: 'Robots, art, coding, wind power, and student-made surprises fill the school for one big night.', date: 'THURSDAY · 6:00 PM', cta: 'BRING THE WHOLE FAMILY', stat: '1 NIGHT', quote: 'Come see what we made.' },
  'family-newsletter': { kicker: 'FAMILY EDITION · OCTOBER', headline: 'THE SCHOOL IS FULL OF GOOD QUESTIONS', deck: 'News, ideas, and work from across the academy.', body: 'Students turned curiosity into prototypes this month. Inside: a creek investigation, new code from kindergarten, and the teams preparing for the next showcase.', date: 'OCTOBER 2026', cta: 'TURN THE PAGE FOR MORE', stat: '7 GRADES', quote: 'We learn by making the idea real.' },
  'science-showcase': { kicker: 'DESIGN · TEST · IMPROVE', headline: 'CAN WIND POWER OUR CLASSROOM?', deck: 'Our team changed one blade at a time and measured what happened.', body: 'We built three turbine designs, kept the wind speed steady, and recorded the voltage from every test. The wider blade produced the most consistent result.', date: 'ENGINEERING LAB · TEAM 6', cta: 'SCAN OUR TEST LOG', stat: '3.8 V', quote: 'The best result came after our first design failed.' },
  'club-recruitment': { kicker: 'FIND YOUR JOB ON THE CREW', headline: 'MAKE THE NEWS WITH US', deck: 'Write. Record. Design. Direct. There is a chair with your name on it.', body: 'No experience required. Bring one thing you want to learn and one story you think the school should hear.', date: 'TUESDAYS · MEDIA ROOM · 3:15', cta: 'TRY ONE MEETING', stat: '8 JOBS', quote: 'I joined to edit. Then I learned to host.' },
  'student-spotlight': { kicker: 'STUDENT SPOTLIGHT', headline: 'MAYA BUILDS THE BOT THAT SORTS IT OUT', deck: 'A sixth grader turns a messy recycling problem into a working prototype.', body: 'Maya started with cardboard, one sensor, and a question. Four versions later, the sorter can tell metal from paper and explain what it sees.', date: 'WORDS BY THE CHATTER CREW', cta: 'SEE MAYA’S BUILD LOG', stat: '4 VERSIONS', quote: 'Every mistake gave me the next clue.' },
  'field-guide': { kicker: 'WATERSHED FIELD NOTES', headline: 'FOLLOW THE WATER', deck: 'Three stops that reveal how rain moves through our neighborhood.', body: 'Look for fast water near pavement, slower water near planted beds, and tiny signs of life along the bank. Record what changes after rain.', date: 'CAMPUS CREEK WALK · STOP 01', cta: 'PACK A PENCIL AND LOOK CLOSE', stat: '3 STOPS', quote: 'A map begins with noticing.' },
  'how-it-works': { kicker: 'MAKER MANUAL 04', headline: 'TEACH A ROBOT TO SEE A LINE', deck: 'Five moves from first sensor reading to a smoother turn.', body: 'Calibrate on light and dark surfaces. Set a midpoint. Test one turn. Change a single number. Run the same course again.', date: 'ROBOTICS LAB', cta: 'TEST ONE CHANGE AT A TIME', stat: '5 STEPS', quote: 'The code gets better when the test stays fair.' },
  'community-update': { kicker: 'COMMUNITY UPDATE', headline: 'THE GARDEN WORKDAY MOVES INSIDE', deck: 'Rain changes the place, not the plan.', body: 'Meet in the maker lab at 10:00. Teams will build seed starters, paint new signs, and prepare tools for the next clear Saturday.', date: 'SATURDAY · 10:00–12:00', cta: 'ENTER THROUGH THE MAIN DOORS', stat: 'NEW PLAN', quote: 'Everyone who signed up still has a job.' },
  'photo-essay': { kicker: 'BEHIND THE BUILD', headline: 'FROM LOOSE PARTS TO LIFT-OFF', deck: 'One afternoon inside the KidWind workroom.', body: 'First came the sketch. Then the careful cuts, a wobble, a repair, and the moment the meter finally moved.', date: 'PHOTOS BY THE CHATTER CREW', cta: 'READ THE FULL CAPTIONS', stat: '6 FRAMES', quote: 'When it spun, the whole table cheered.' },
  'social-story': { kicker: '3 DAYS TO GO', headline: 'SHOWCASE WEEK STARTS HERE', deck: 'Save the date, pick your route, and bring someone curious.', body: 'Swipe for the schedule, featured rooms, and the fastest way to see every student project.', date: 'THURSDAY · 6 PM', cta: 'NEXT: BUILD YOUR ROUTE', stat: '03', quote: 'See the school become a gallery.' },
};

function layer(role: CreativeRole, input: Parameters<typeof element>[0]): BlastElement {
  return element({ ...input, role, recipeOwned: role === 'DECORATION' || input.kind === 'SHAPE' || input.kind === 'LINE' });
}

function text(role: CreativeRole, name: string, value: string, x: number, y: number, width: number, height: number, style: Partial<BlastElement> = {}) {
  return layer(role, { kind: 'TEXT', name, text: value, x, y, width, height, ...style });
}

function shape(name: string, x: number, y: number, width: number, height: number, fill: string, style: Partial<BlastElement> = {}) {
  return layer('DECORATION', { kind: 'SHAPE', name, x, y, width, height, fill, ...style });
}

function photo(name: string, x: number, y: number, width: number, height: number, fill: string, style: Partial<BlastElement> = {}) {
  return layer('PHOTO', { kind: 'IMAGE', name, x, y, width, height, fill, ...style });
}

function makePage(name: string, background: string, elements: BlastElement[]): BlastPage {
  return { id: newId(), name, background, elements };
}

type CompositionSlot = 'KICKER' | 'HEADLINE' | 'DECK' | 'PHOTO' | 'STAT' | 'BODY' | 'DATE' | 'CALL_TO_ACTION' | 'QUOTE';
type CompositionBox = readonly [x: number, y: number, width: number, height: number];
type CompositionProfile = {
  slots: Partial<Record<CompositionSlot, CompositionBox>>;
  motif: readonly [x: number, y: number, width: number, height: number, color: 'ink' | 'primary' | 'accent', rotation?: number, shape?: BlastElement['shape']];
};

const b = (x: number, y: number, width: number, height: number): CompositionBox => [x, y, width, height];

// Each direction has a deliberate silhouette. Shared builders still provide
// safe type, color and content defaults; these profiles decide what dominates.
const BLAST_COMPOSITIONS: Record<string, CompositionProfile> = {
  marquee: { slots: { HEADLINE: b(54, 154, 708, 200), PHOTO: b(72, 450, 672, 330), STAT: b(74, 808, 198, 102) }, motif: [22, 16, 772, 102, 'primary', 0] },
  'signal-stack': { slots: { HEADLINE: b(214, 62, 540, 250), PHOTO: b(214, 430, 542, 350), BODY: b(214, 812, 338, 142) }, motif: [0, 0, 176, 1056, 'primary', 0] },
  'paper-burst': { slots: { HEADLINE: b(54, 248, 706, 222), PHOTO: b(54, 582, 434, 354), BODY: b(532, 648, 198, 174) }, motif: [516, 602, 252, 344, 'accent', 3] },
  'front-page': { slots: { KICKER: b(48, 38, 720, 34), HEADLINE: b(48, 94, 720, 142), PHOTO: b(48, 288, 454, 340), BODY: b(526, 288, 242, 340), DECK: b(48, 660, 720, 74) }, motif: [48, 252, 720, 4, 'ink', 0] },
  'field-journal': { slots: { HEADLINE: b(62, 122, 480, 186), PHOTO: b(438, 354, 322, 322), BODY: b(62, 354, 334, 322), STAT: b(62, 714, 174, 96) }, motif: [34, 0, 18, 1056, 'primary', 0] },
  'bright-edition': { slots: { HEADLINE: b(52, 126, 500, 180), PHOTO: b(52, 350, 714, 292), BODY: b(302, 690, 464, 180), STAT: b(54, 690, 210, 180) }, motif: [598, 42, 170, 170, 'accent', 9, 'ELLIPSE'] },
  'field-notes': { slots: { HEADLINE: b(54, 42, 598, 108), PHOTO: b(54, 206, 602, 436), BODY: b(694, 238, 308, 244), STAT: b(720, 530, 254, 116) }, motif: [26, 26, 1004, 764, 'primary', 0] },
  blueprint: { slots: { HEADLINE: b(64, 72, 440, 172), PHOTO: b(542, 70, 448, 458), BODY: b(64, 330, 420, 250), STAT: b(64, 620, 232, 104) }, motif: [520, 38, 4, 700, 'accent', 0] },
  'museum-label': { slots: { HEADLINE: b(86, 74, 884, 94), PHOTO: b(86, 214, 520, 430), BODY: b(650, 214, 320, 250), DECK: b(650, 498, 320, 112) }, motif: [86, 680, 884, 8, 'accent', 0] },
  'sticker-board': { slots: { HEADLINE: b(62, 92, 476, 210), PHOTO: b(308, 352, 446, 410), BODY: b(62, 360, 210, 286), STAT: b(82, 704, 180, 112) }, motif: [590, 74, 154, 154, 'accent', -8, 'ELLIPSE'] },
  'crew-call': { slots: { HEADLINE: b(208, 70, 548, 180), DECK: b(208, 272, 548, 82), PHOTO: b(208, 394, 548, 286), BODY: b(208, 716, 548, 116) }, motif: [0, 0, 174, 1056, 'primary', 0] },
  'open-door': { slots: { PHOTO: b(0, 0, 816, 618), HEADLINE: b(54, 500, 708, 190), DECK: b(58, 710, 700, 72), BODY: b(58, 810, 466, 124), STAT: b(558, 812, 198, 124) }, motif: [36, 470, 744, 250, 'ink', 0] },
  'cover-story': { slots: { PHOTO: b(52, 54, 712, 558), KICKER: b(72, 78, 320, 40), HEADLINE: b(70, 528, 674, 204), QUOTE: b(74, 756, 500, 120), DATE: b(596, 776, 148, 76) }, motif: [50, 510, 716, 242, 'primary', 0] },
  'scrapbook-profile': { slots: { HEADLINE: b(54, 84, 706, 164), PHOTO: b(66, 300, 416, 420), QUOTE: b(506, 312, 246, 210), BODY: b(510, 554, 238, 188) }, motif: [492, 286, 276, 480, 'accent', 2] },
  'studio-card': { slots: { HEADLINE: b(64, 80, 688, 150), PHOTO: b(64, 286, 286, 498), DECK: b(390, 306, 362, 106), BODY: b(390, 448, 362, 226), STAT: b(390, 706, 174, 104) }, motif: [584, 706, 168, 104, 'accent', 0] },
  'trail-card': { slots: { HEADLINE: b(54, 76, 706, 150), PHOTO: b(54, 280, 706, 430), BODY: b(330, 750, 430, 164), STAT: b(54, 750, 238, 164) }, motif: [78, 302, 86, 86, 'accent', 0, 'ELLIPSE'] },
  'ranger-sheet': { slots: { HEADLINE: b(208, 66, 548, 182), PHOTO: b(208, 312, 548, 330), BODY: b(208, 686, 340, 188), DATE: b(580, 690, 176, 132) }, motif: [0, 0, 174, 1056, 'primary', 0] },
  'nature-zine': { slots: { HEADLINE: b(52, 184, 706, 210), PHOTO: b(54, 456, 430, 430), BODY: b(510, 496, 242, 228), STAT: b(536, 760, 190, 118) }, motif: [510, 442, 260, 458, 'accent', -2] },
  'diagram-desk': { slots: { HEADLINE: b(50, 38, 614, 126), PHOTO: b(50, 214, 678, 466), BODY: b(762, 250, 246, 264), STAT: b(762, 552, 246, 112) }, motif: [744, 38, 6, 700, 'accent', 0] },
  'step-cards': { slots: { HEADLINE: b(52, 52, 952, 96), PHOTO: b(52, 202, 286, 436), BODY: b(374, 202, 286, 436), DECK: b(696, 202, 308, 190), STAT: b(696, 430, 308, 208) }, motif: [52, 674, 952, 68, 'primary', 0] },
  'lab-manual': { slots: { HEADLINE: b(80, 62, 570, 126), PHOTO: b(80, 248, 520, 398), BODY: b(642, 248, 330, 250), DECK: b(642, 530, 330, 116) }, motif: [36, 28, 984, 760, 'ink', 0] },
  'notice-board': { slots: { HEADLINE: b(58, 82, 700, 190), DECK: b(58, 300, 700, 72), PHOTO: b(58, 414, 300, 330), BODY: b(394, 414, 364, 214), STAT: b(394, 656, 180, 116) }, motif: [0, 0, 816, 54, 'primary', 0] },
  'town-square': { slots: { HEADLINE: b(54, 76, 488, 174), PHOTO: b(574, 66, 184, 294), BODY: b(54, 420, 330, 252), DECK: b(420, 420, 338, 110), STAT: b(420, 558, 338, 114) }, motif: [42, 392, 728, 306, 'accent', 0] },
  'signal-note': { slots: { HEADLINE: b(56, 164, 704, 206), DECK: b(58, 404, 704, 80), PHOTO: b(58, 540, 704, 250), BODY: b(58, 824, 470, 118), DATE: b(560, 824, 202, 118) }, motif: [0, 0, 816, 126, 'ink', 0] },
  'contact-sheet': { slots: { HEADLINE: b(48, 42, 504, 108), PHOTO: b(48, 196, 664, 470), BODY: b(748, 196, 260, 262), STAT: b(748, 500, 260, 166) }, motif: [28, 176, 1000, 510, 'ink', 0] },
  'big-frame': { slots: { PHOTO: b(0, 0, 1056, 604), HEADLINE: b(48, 486, 960, 130), DECK: b(52, 650, 610, 72), DATE: b(720, 660, 288, 62) }, motif: [30, 462, 996, 174, 'ink', 0] },
  'cut-and-paste': { slots: { HEADLINE: b(52, 52, 612, 126), PHOTO: b(76, 238, 520, 414), QUOTE: b(636, 208, 342, 208), BODY: b(634, 454, 342, 190) }, motif: [612, 184, 386, 486, 'accent', 3] },
  countdown: { slots: { KICKER: b(58, 124, 964, 68), STAT: b(58, 252, 964, 400), HEADLINE: b(58, 718, 964, 310), BODY: b(58, 1080, 820, 160) }, motif: [790, 70, 230, 230, 'accent', 0, 'ELLIPSE'] },
  'channel-cards': { slots: { KICKER: b(80, 116, 920, 68), HEADLINE: b(80, 260, 620, 360), STAT: b(760, 260, 240, 360), BODY: b(80, 730, 920, 180) }, motif: [44, 220, 992, 440, 'primary', 0] },
  'paper-swipe': { slots: { KICKER: b(76, 140, 650, 74), HEADLINE: b(74, 320, 900, 390), BODY: b(132, 820, 810, 190), STAT: b(748, 1570, 260, 130) }, motif: [44, 284, 992, 470, 'accent', -3] },
};

function applyBlastComposition(pages: BlastPage[], direction: BlastDirection) {
  const page = pages[0]; const profile = BLAST_COMPOSITIONS[direction.id];
  if (!page || !profile) return;
  for (const entry of page.elements) {
    const box = entry.role ? profile.slots[entry.role as CompositionSlot] : undefined;
    // Each direction intentionally chooses which information belongs on its
    // first page. Keep unused semantic layers in the document (so remixing
    // never loses a student's work), but do not pile them into the new layout.
    if (entry.role && !box) { entry.hidden = true; continue; }
    if (!box) continue;
    const scale = Math.min(box[2] / entry.width, box[3] / entry.height);
    entry.x = box[0]; entry.y = box[1]; entry.width = box[2]; entry.height = box[3];
    if (entry.kind === 'TEXT' && scale < 1) {
      const minimum = entry.role === 'BODY' ? 18 : entry.role === 'DATE' || entry.role === 'KICKER' ? 17 : 15;
      entry.fontSize = Math.max(minimum, entry.fontSize * Math.max(.7, scale));
    }
  }
  const [x, y, width, height, color, rotation = 0, motifShape = 'RECTANGLE'] = profile.motif;
  const [ink, primary, accent] = direction.palette;
  page.elements.unshift(shape('Composition motif', x, y, width, height, color === 'ink' ? ink : color === 'accent' ? accent : primary, { rotation, shape: motifShape }));
  // Keep intentionally overlapping compositions readable: panels at the back,
  // photos in the middle, and editable words within reach on top.
  const layer = (item: BlastElement) => item.kind === 'TEXT' ? 2 : item.kind === 'IMAGE' ? 1 : 0;
  page.elements.sort((left, right) => layer(left) - layer(right));
}

function portraitLayout(family: BlastRecipeFamily, d: BlastDirection, variant: number, copy: FamilyCopy): BlastPage[] {
  const [ink, primary, accent, paper] = d.palette;
  if (variant === 0) return [makePage(family.name, paper, [
    shape('Signal tab', 0, 0, 816, 132, primary),
    text('KICKER', 'Kicker', copy.kicker, 54, 42, 708, 42, { fill: paper, fontSize: 19, fontWeight: 900, letterSpacing: 2, align: 'center' }),
    text('HEADLINE', 'Headline', copy.headline, 54, 168, 708, 180, { fill: ink, fontFamily: d.displayFont, fontSize: 62, fontWeight: 900, lineHeight: .95, align: 'center' }),
    text('DECK', 'Deck', copy.deck, 104, 352, 608, 82, { fill: primary, fontSize: 26, fontWeight: 800, align: 'center', lineHeight: 1.15 }),
    photo('Hero photo', 70, 468, 676, 310, paper, { stroke: ink, strokeWidth: 4, radius: 18 }),
    shape('Fact ticket', 72, 806, 202, 104, accent, { radius: 12, rotation: -2 }),
    text('STAT', 'Big fact', copy.stat, 90, 830, 166, 48, { fill: ink, fontFamily: d.displayFont, fontSize: 31, fontWeight: 900, align: 'center' }),
    text('BODY', 'Story', copy.body, 306, 808, 440, 112, { fill: ink, fontSize: 18, fontWeight: 600, lineHeight: 1.3 }),
    text('DATE', 'Date', copy.date, 306, 925, 440, 22, { fill: ink, fontSize: 15, fontWeight: 900, align: 'right', letterSpacing: .5 }),
    shape('Action bar', 72, 952, 674, 62, ink, { radius: 31 }),
    text('CALL_TO_ACTION', 'Action', copy.cta, 94, 969, 630, 28, { fill: paper, fontSize: 18, fontWeight: 900, align: 'center', letterSpacing: 1 }),
  ])];
  if (variant === 1) return [makePage(family.name, ink, [
    shape('Side rail', 0, 0, 176, 1056, primary),
    text('KICKER', 'Kicker', copy.kicker, 35, 60, 106, 300, { fill: paper, fontSize: 18, fontWeight: 900, letterSpacing: 2, align: 'center', rotation: -90 }),
    text('HEADLINE', 'Headline', copy.headline, 216, 72, 540, 236, { fill: paper, fontFamily: d.displayFont, fontSize: 66, fontWeight: 900, lineHeight: .92 }),
    text('DECK', 'Deck', copy.deck, 220, 322, 520, 90, { fill: accent, fontSize: 27, fontWeight: 800, lineHeight: 1.15 }),
    photo('Feature photo', 216, 444, 540, 330, paper, { radius: 10 }),
    text('QUOTE', 'Quote', `“${copy.quote}”`, 50, 644, 100, 286, { fill: paper, fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 20, fontWeight: 700, align: 'center', rotation: -90 }),
    text('BODY', 'Story', copy.body, 216, 810, 344, 150, { fill: paper, fontSize: 18, fontWeight: 600, lineHeight: 1.35 }),
    shape('Date tag', 586, 814, 170, 146, accent, { radius: 16 }),
    text('DATE', 'Date', copy.date, 602, 841, 138, 88, { fill: ink, fontSize: 19, fontWeight: 900, align: 'center', lineHeight: 1.25 }),
    text('CALL_TO_ACTION', 'Action', copy.cta, 216, 990, 540, 30, { fill: accent, fontSize: 17, fontWeight: 900, letterSpacing: 1 }),
  ])];
  return [makePage(family.name, paper, [
    shape('Top corner', 0, 0, 360, 238, primary, { rotation: -5 }),
    shape('Accent stamp', 630, 42, 122, 122, accent, { shape: 'ELLIPSE', rotation: 8 }),
    text('STAT', 'Stamp', copy.stat, 646, 78, 90, 48, { fill: ink, fontFamily: d.displayFont, fontSize: 24, fontWeight: 900, align: 'center', rotation: 8 }),
    text('KICKER', 'Kicker', copy.kicker, 56, 54, 250, 72, { fill: paper, fontSize: 18, fontWeight: 900, letterSpacing: 1 }),
    text('HEADLINE', 'Headline', copy.headline, 56, 258, 704, 208, { fill: ink, fontFamily: d.displayFont, fontSize: 70, fontWeight: 900, lineHeight: .92 }),
    text('DECK', 'Deck', copy.deck, 58, 476, 570, 82, { fill: primary, fontSize: 27, fontWeight: 800 }),
    photo('Main photo', 58, 590, 430, 346, paper, { stroke: ink, strokeWidth: 5, rotation: -2 }),
    shape('Notes card', 512, 614, 248, 322, accent, { radius: 5, rotation: 2 }),
    text('BODY', 'Story', copy.body, 536, 648, 200, 174, { fill: ink, fontSize: 18, fontWeight: 700, lineHeight: 1.3, rotation: 2 }),
    text('DATE', 'Date', copy.date, 536, 850, 200, 52, { fill: ink, fontSize: 18, fontWeight: 900, rotation: 2 }),
    text('CALL_TO_ACTION', 'Action', copy.cta, 58, 978, 702, 32, { fill: primary, fontSize: 18, fontWeight: 900, align: 'center', letterSpacing: 1 }),
  ])];
}

function landscapeLayout(family: BlastRecipeFamily, d: BlastDirection, variant: number, copy: FamilyCopy): BlastPage[] {
  const [ink, primary, accent, paper] = d.palette;
  const width = 1056;
  if (variant === 0) return [makePage(family.name, paper, [
    shape('Title rail', 0, 0, width, 124, ink),
    text('KICKER', 'Kicker', copy.kicker, 42, 32, 256, 50, { fill: accent, fontSize: 18, fontWeight: 900, letterSpacing: 2 }),
    text('HEADLINE', 'Headline', copy.headline, 314, 24, 696, 72, { fill: paper, fontFamily: d.displayFont, fontSize: 47, fontWeight: 900, align: 'right' }),
    photo('Main evidence', 44, 166, 570, 420, paper, { stroke: ink, strokeWidth: 4, radius: 8 }),
    shape('Fact card', 650, 166, 360, 170, primary, { radius: 16 }),
    text('STAT', 'Result', copy.stat, 678, 190, 304, 68, { fill: paper, fontFamily: d.displayFont, fontSize: 52, fontWeight: 900 }),
    text('DECK', 'Finding', copy.deck, 678, 266, 304, 50, { fill: paper, fontSize: 18, fontWeight: 800 }),
    text('BODY', 'What happened', copy.body, 650, 376, 360, 184, { fill: ink, fontSize: 20, fontWeight: 600, lineHeight: 1.35 }),
    shape('Quote strip', 44, 626, 966, 112, accent, { radius: 10 }),
    text('QUOTE', 'Team quote', `“${copy.quote}”`, 72, 650, 650, 62, { fill: ink, fontFamily: 'Newsreader', fontSize: 25, fontWeight: 800, fontStyle: 'italic' }),
    text('CALL_TO_ACTION', 'Action', copy.cta, 750, 654, 230, 54, { fill: ink, fontSize: 18, fontWeight: 900, align: 'right' }),
  ])];
  if (variant === 1) return [makePage(family.name, ink, [
    shape('Grid card one', 42, 42, 294, 732, primary, { radius: 18 }),
    shape('Grid card two', 360, 42, 294, 732, paper, { radius: 18 }),
    shape('Grid card three', 678, 42, 336, 732, accent, { radius: 18 }),
    text('KICKER', 'Kicker', copy.kicker, 68, 76, 242, 70, { fill: paper, fontSize: 18, fontWeight: 900, letterSpacing: 1 }),
    text('HEADLINE', 'Headline', copy.headline, 68, 180, 242, 260, { fill: paper, fontFamily: d.displayFont, fontSize: 48, fontWeight: 900, lineHeight: .94 }),
    text('STAT', 'Result', copy.stat, 68, 632, 242, 88, { fill: accent, fontFamily: d.displayFont, fontSize: 50, fontWeight: 900 }),
    photo('Process photo', 382, 70, 250, 300, '#E7E0D2', { radius: 10 }),
    text('DECK', 'Finding', copy.deck, 384, 402, 246, 88, { fill: ink, fontSize: 23, fontWeight: 900 }),
    text('BODY', 'Method', copy.body, 384, 520, 246, 204, { fill: ink, fontSize: 17, fontWeight: 600, lineHeight: 1.35 }),
    text('QUOTE', 'Quote', `“${copy.quote}”`, 710, 86, 272, 250, { fill: ink, fontFamily: 'Newsreader', fontSize: 29, fontWeight: 800, lineHeight: 1.15 }),
    text('DATE', 'Credit', copy.date, 710, 386, 272, 80, { fill: ink, fontSize: 18, fontWeight: 900 }),
    text('CALL_TO_ACTION', 'Action', copy.cta, 710, 650, 272, 74, { fill: ink, fontSize: 20, fontWeight: 900 }),
  ])];
  return [makePage(family.name, paper, [
    shape('Diagram field', 28, 28, 1000, 760, '#FFFFFF', { stroke: primary, strokeWidth: 4, radius: 8 }),
    text('KICKER', 'Kicker', copy.kicker, 62, 54, 420, 36, { fill: primary, fontSize: 17, fontWeight: 900, letterSpacing: 2 }),
    text('HEADLINE', 'Headline', copy.headline, 62, 108, 620, 120, { fill: ink, fontFamily: d.displayFont, fontSize: 53, fontWeight: 900, lineHeight: .95 }),
    shape('Result circle', 790, 72, 172, 172, accent, { shape: 'ELLIPSE' }),
    text('STAT', 'Result', copy.stat, 812, 126, 128, 62, { fill: ink, fontFamily: d.displayFont, fontSize: 34, fontWeight: 900, align: 'center' }),
    photo('Diagram or photo', 62, 274, 570, 360, '#EAF3F3', { stroke: ink, strokeWidth: 3 }),
    text('BODY', 'Explanation', copy.body, 670, 294, 292, 190, { fill: ink, fontSize: 19, fontWeight: 600, lineHeight: 1.35 }),
    text('DECK', 'Finding', copy.deck, 670, 514, 292, 90, { fill: primary, fontSize: 23, fontWeight: 900 }),
    shape('Bottom signal', 62, 680, 900, 62, primary, { radius: 8 }),
    text('CALL_TO_ACTION', 'Action', copy.cta, 86, 697, 852, 30, { fill: paper, fontSize: 18, fontWeight: 900, align: 'center', letterSpacing: 1 }),
  ])];
}

function storyLayout(d: BlastDirection, variant: number, copy: FamilyCopy): BlastPage[] {
  const [ink, primary, accent, paper] = d.palette;
  const first = makePage('Hook', variant === 1 ? ink : primary, [
    shape('Progress marker', 58, 70, variant === 2 ? 220 : 86, 20, accent, { radius: 10 }),
    text('KICKER', 'Kicker', copy.kicker, 58, 136, 964, 72, { fill: accent, fontSize: 31, fontWeight: 900, letterSpacing: 3 }),
    text('HEADLINE', 'Headline', copy.headline, 58, 278, 964, 420, { fill: paper, fontFamily: d.displayFont, fontSize: variant === 0 ? 116 : 102, fontWeight: 900, lineHeight: .92 }),
    text('BODY', 'Promise', copy.deck, 62, 760, 880, 190, { fill: paper, fontSize: 40, fontWeight: 800, lineHeight: 1.15 }),
    text('STAT', 'Chapter', copy.stat, 790, 1670, 224, 110, { fill: accent, fontFamily: d.displayFont, fontSize: 62, fontWeight: 900, align: 'right' }),
    text('CALL_TO_ACTION', 'Next card', copy.cta, 62, 1710, 650, 58, { fill: paper, fontSize: 28, fontWeight: 900 }),
  ]);
  const second = makePage('Details', paper, [
    shape('Chapter band', 0, 0, 1080, 290, primary),
    text('HEADLINE', 'Detail headline', copy.deck, 64, 74, 952, 160, { fill: paper, fontFamily: d.displayFont, fontSize: 66, fontWeight: 900, lineHeight: 1 }),
    photo('Story photo', 64, 356, 952, variant === 2 ? 630 : 760, '#E9E3D7', { radius: variant === 1 ? 0 : 30 }),
    shape('Story card', 64, variant === 2 ? 1040 : 1170, 952, 420, accent, { radius: 28, rotation: variant === 2 ? -1 : 0 }),
    text('BODY', 'Story', copy.body, 114, variant === 2 ? 1100 : 1230, 852, 190, { fill: ink, fontSize: 35, fontWeight: 700, lineHeight: 1.25 }),
    text('DATE', 'Date', copy.date, 114, variant === 2 ? 1370 : 1500, 852, 70, { fill: ink, fontSize: 27, fontWeight: 900 }),
    text('CALL_TO_ACTION', 'Action', copy.cta, 64, 1740, 952, 72, { fill: primary, fontSize: 30, fontWeight: 900, align: 'center' }),
  ]);
  return [first, second];
}

function newsletterPages(family: BlastRecipeFamily, d: BlastDirection, variant: number, copy: FamilyCopy): BlastPage[] {
  const first = portraitLayout(family, d, variant, copy)[0]!;
  first.name = 'Front page';
  const [ink, primary, accent, paper] = d.palette;
  const inside = makePage('Inside', paper, [
    shape('Section header', 0, 0, 816, 118, primary),
    text('KICKER', 'Section label', 'AROUND THE ACADEMY', 48, 34, 720, 50, { fill: paper, fontFamily: d.displayFont, fontSize: 34, fontWeight: 900 }),
    text('HEADLINE', 'Inside headline', 'Small experiments make a big month', 48, 160, 720, 82, { fill: ink, fontFamily: d.displayFont, fontSize: 43, fontWeight: 900 }),
    photo('Classroom photo', variant === 1 ? 470 : 48, 274, variant === 1 ? 298 : 410, 302, '#E8EFE9', { radius: variant === 2 ? 22 : 0 }),
    text('BODY', 'Lead story', copy.body, variant === 1 ? 48 : 488, 274, variant === 1 ? 382 : 280, 302, { fill: ink, fontFamily: 'Newsreader', fontSize: 19, fontWeight: 500, lineHeight: 1.42 }),
    shape('Quick read', 48, 628, 720, 304, accent, { radius: 18 }),
    text('DECK', 'Quick read headline', 'Three things to notice', 78, 662, 660, 54, { fill: ink, fontFamily: d.displayFont, fontSize: 30, fontWeight: 900 }),
    text('BODY', 'Quick reads', '01  Kindergarten coders made their first moving characters.\n\n02  The watershed team mapped where rain collects.\n\n03  Artists turned measured shapes into a hallway installation.', 78, 742, 660, 150, { fill: ink, fontSize: 18, fontWeight: 700, lineHeight: 1.4 }),
    text('CALL_TO_ACTION', 'Footer', 'SEND STORY IDEAS TO THE CHATTER CREW', 48, 980, 720, 28, { fill: primary, fontSize: 16, fontWeight: 900, align: 'center', letterSpacing: 1 }),
  ]);
  return [first, inside];
}

function guaranteeRecipeContrast(pages: BlastPage[], ink: string, paper: string) {
  for (const page of pages) page.elements.forEach((item, index) => {
    if (item.kind !== 'TEXT') return;
    const cx = item.x + item.width / 2; const cy = item.y + item.height / 2;
    const background = [...page.elements.slice(0, index)].reverse().find((candidate) => !candidate.hidden && candidate.kind === 'SHAPE' && cx >= candidate.x && cy >= candidate.y && cx <= candidate.x + candidate.width && cy <= candidate.y + candidate.height)?.fill ?? page.background;
    const required = item.fontSize >= 24 || (item.fontSize >= 19 && item.fontWeight >= 700) ? 3 : 4.5;
    if (contrastRatio(item.fill, background) >= required) return;
    item.fill = [ink, paper, '#000000', '#FFFFFF'].sort((a, b) => contrastRatio(b, background) - contrastRatio(a, background))[0]!;
  });
}

export function buildBlastRecipe(familyId: string, directionId?: string, input: { title?: string; slotValues?: Record<string, string> } = {}): RecipeBuild {
  const family = BLAST_RECIPE_FAMILIES.find((item) => item.id === familyId) ?? BLAST_RECIPE_FAMILIES[0]!;
  const selected = family.directions.find((item) => item.id === directionId) ?? family.directions[0];
  const variant = family.directions.findIndex((item) => item.id === selected.id);
  const baseCopy = COPY[family.id]!;
  const copy = { ...baseCopy, ...input.slotValues };
  const pages = family.id === 'family-newsletter' ? newsletterPages(family, selected, variant, copy)
    : family.format === 'LETTER_LANDSCAPE' ? landscapeLayout(family, selected, variant, copy)
      : family.format === 'STORY' ? storyLayout(selected, variant, copy)
        : portraitLayout(family, selected, variant, copy);
  applyBlastComposition(pages, selected);
  guaranteeRecipeContrast(pages, selected.palette[0], selected.palette[3]);
  const dimensions = family.format === 'LETTER_LANDSCAPE' ? { width: 1056, height: 816 }
    : family.format === 'STORY' ? { width: 1080, height: 1920 } : { width: 816, height: 1056 };
  return {
    title: input.title ?? `${family.name} · ${selected.name}`,
    format: family.format,
    ...dimensions,
    pages,
    creativeRecipe: { familyId: family.id, directionId: selected.id, mode: 'GUIDED', slotValues: input.slotValues },
  };
}

export function remixBlastRecipe(project: RecipeBuild, directionId: string): RecipeBuild {
  const recipe = project.creativeRecipe;
  if (!recipe) return project;
  const previous = new Map<CreativeRole, BlastElement[]>();
  for (const item of project.pages.flatMap((page) => page.elements)) {
    if (!item.role || item.recipeOwned) continue;
    const rows = previous.get(item.role) ?? [];
    rows.push(item);
    previous.set(item.role, rows);
  }
  const next = buildBlastRecipe(recipe.familyId, directionId, { title: project.title, slotValues: recipe.slotValues });
  const seen = new Map<CreativeRole, number>();
  for (const item of next.pages.flatMap((page) => page.elements)) {
    if (!item.role || item.recipeOwned) continue;
    const at = seen.get(item.role) ?? 0;
    const source = previous.get(item.role)?.[at];
    seen.set(item.role, at + 1);
    if (!source) continue;
    if (item.kind === 'TEXT') { item.text = source.text; item.richText = source.richText; }
    if (item.kind === 'IMAGE') item.imageAssetId = source.imageAssetId;
  }
  return next;
}
