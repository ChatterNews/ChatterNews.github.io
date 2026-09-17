/** Record shapes. SPEC S3. */
import type { Status } from './track.js';
import type { GateStatus } from './gate.js';
import type { ProseNode } from './readtime.js';

export type { Status, GateStatus, ProseNode };

export type Role = 'STUDENT' | 'ADVISER' | 'ADMIN';
export type AssetKind = 'IMAGE' | 'AUDIO' | 'VIDEO';
export type Origin = 'OPENVERSE' | 'UPLOAD' | 'RECORDING' | 'GENERATED';
export type ReleaseStatus = 'NONE' | 'ON_FILE' | 'EXPIRED' | 'REFUSED';
export type StoryCreationRecipeId = 'article' | 'podcast' | 'video' | 'poster' | 'show';
export type EvidenceType = 'PERSON' | 'DOCUMENT' | 'OBSERVATION' | 'WEB_LEAD' | 'AI_LEAD';

export interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface User extends Base {
  name: string;        // full legal name, never published
  penName: string;     // what appears on a byline: "Maya R."
  role: Role;
  gradeBand?: string;
  email?: string;      // advisers only
  active: boolean;
}

export interface Story extends Base {
  slug: string;
  title: string;
  channels: string[];  // pod | web | social | segment
  status: Status;
  dueAt?: number;
  body: ProseNode;
  readTimeSec: number; // derived: words / 150 * 60
  durationSec?: number;
  orderIndex?: number;
  bylineIds: string[];
  ownerId?: string;
  /** The main thing this crew is making. Older stories infer it from channels. */
  creationRecipeId?: StoryCreationRecipeId;
  /** The validated bead currently guiding this recipe. Older stories infer it from status. */
  workflowStepId?: string;
  brief?: StoryBrief;
  selectedTakeId?: string;
  /** Stable identity inside a portable USB project, even when cached on another computer. */
  portableId?: string;
  /** Published work stays frozen; later coverage points back to the edition that inspired it. */
  followUpOfId?: string;
}

export interface StoryBrief {
  angle: string;
  /** The starter that shaped this plan. Older stories may not have one. */
  storyType?: string;
  /** Concrete reporting tests that support the one-line angle. */
  angleCheck?: { affected: string; verification: string };
  audience: string;
  priority: 'NORMAL' | 'HIGH';
  questions: { id: string; text: string; answered: boolean }[];
  sources: StorySource[];
  checklist: { id: string; text: string; done: boolean }[];
  productionNotes: string;
}

export interface StorySource {
  id: string;
  name: string;
  role: string;
  reference: string;
  notes: string;
  quotes: string;
  state: 'TO_CONTACT' | 'CONTACTED' | 'CONFIRMED';
  evidenceType?: EvidenceType;
}

export interface Asset extends Base {
  kind: AssetKind;
  origin: Origin;
  sha256: string;
  path: string;
  mime: string;
  bytes: number;
  license?: string;
  creator?: string;
  sourceUrl?: string;
  gateStatus: GateStatus;
  gateScore?: number;
  expiresAt?: number;  // raw takes expire; published work does not
}

export interface Take extends Base {
  storyId: string; userId: string; assetId: string; durationSec: number;
  name?: string;
  notes?: string;
  performanceMode?: BoothPerformanceMode;
  slated?: boolean;
  captureId?: string;
  edits?: TakeEdits;
  markers?: { id: string; at: number; label: string }[];
  transcriptCorrection?: string;
  renderedAssetId?: string;
  renderedEditKey?: string;
}
export type BoothPerformanceMode = 'NEWS_READ' | 'INTERVIEW_ANSWER' | 'NARRATION' | 'PODCAST_CONVERSATION';
export interface TakeEdits {
  trimStart: number;
  trimEnd: number;
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
  normalize: boolean;
}
export interface Transcript extends Base {
  assetId: string; text: string; segments: unknown[];
}
export interface Credit extends Base {
  assetId: string; storyId?: string; usedIn: string;
}
/**
 * Who is in a picture or a take, and whether you can tell it is them.
 *
 * NOT in SPEC S3. Added because the publish block in S6 - "blocked when an
 * identifiable minor lacks a valid Release" - has nothing to join Release to
 * without it. Worth folding back into the spec.
 */
export interface Appearance extends Base {
  assetId: string;
  storyId?: string;
  userId: string;
  /** False for the back of a head in a crowd, which needs no permission. */
  identifiable: boolean;
}

export interface Release extends Base {
  userId: string; status: ReleaseStatus; expiresAt?: number; scanAssetId?: string;
}
export interface RoleAssign extends Base {
  userId: string; storyId: string; role: string; cycle: string;
}
export interface CrewTask extends Base {
  storyId: string;
  role: string;
  assigneeId: string;
  state: 'CLAIMED' | 'IN_PROGRESS' | 'NEEDS_HELP' | 'DONE';
  completedSteps: string[];
  handoffNote: string;
  completedAt?: number;
}

export interface ReviewNote {
  id: string;
  authorId: string;
  text: string;
  category: 'FACT' | 'CLARITY' | 'MEDIA' | 'GENERAL';
  resolved: boolean;
  createdAt: number;
}

export interface StoryReview extends Base {
  storyId: string;
  reviewerId?: string;
  contentKey: string;
  mediaKey?: string;
  checks: Record<string, { checked: boolean; actor: string; at: number }>;
  notes: ReviewNote[];
  exceptions?: Partial<Record<ReleaseLaneId, ReleaseException>>;
  state: 'REVIEWING' | 'CHANGES_REQUESTED' | 'READY';
}
export type ReleaseLaneId = 'REPORTING' | 'PERMISSIONS' | 'WORDS' | 'SOUND' | 'GRAPHICS' | 'CAPTIONS' | 'EXPORTS';
export interface ReleaseException { reason: string; actor: string; at: number }
export interface Badge extends Base {
  userId: string; kind: string; progress: number; earnedAt?: number;
}
export interface PublishedStorySnapshot {
  storyId: string;
  title: string;
  slug: string;
  channels: string[];
  body: ProseNode;
  readTimeSec: number;
  durationSec?: number;
  bylines: string[];
  angle?: string;
}

export interface EditionReflection {
  worked: string;
  audience: string;
  change: string;
  authorId?: string;
  updatedAt?: number;
}

/** One real place where an adviser put the finished work in front of an audience. */
export interface PublishingDestination {
  platform: string;
  url: string;
}

/** The human release record. Chatter archives work only after this is complete. */
export interface PublishingReceipt {
  destinations: PublishingDestination[];
  publishedAt: number;
  adviserId: string;
  note?: string;
}

export type PublishingReceiptInput = Omit<PublishingReceipt, 'adviserId'>;

export interface Episode extends Base {
  title: string; publishedAt: number; channel: string; storyIds: string[];
  /** Frozen public copy. Optional so existing local projects remain readable. */
  stories?: PublishedStorySnapshot[];
  /** Podcast editions freeze their player metadata and point to the reviewed master. */
  podcastProjectId?: string;
  audioDeliverableId?: string;
  description?: string;
  episodeType?: PodcastEpisodeType;
  artworkAssetId?: string;
  chapters?: PodcastChapter[];
  /** Where and when the adviser actually published this edition. */
  receipt?: PublishingReceipt;
  /** Crew learning notes live beside the immutable published snapshot. */
  reflections?: Record<string, EditionReflection>;
}

export type DeliverableKind = 'AUDIO' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'DESIGN' | 'PACKAGE';
export type DeliverableRoom = 'DESK' | 'BOOTH' | 'GARAGE' | 'BLAST' | 'STINGER' | 'SHOWTIME' | 'CHATTERBOX' | 'GREENLIGHT';
export type DeliverableStage = 'WORKING' | 'REVIEW' | 'FINAL' | 'PUBLISHED';

/** A tangible file made by a production room and kept in the Media Bin. */
export interface Deliverable extends Base {
  storyId?: string;
  authorId?: string;
  title: string;
  fileName: string;
  kind: DeliverableKind;
  room: DeliverableRoom;
  stage: DeliverableStage;
  mime: string;
  bytes: number;
  blobHash: string;
  sourceAssetId?: string;
  sourceProjectId?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  pageCount?: number;
}

export type BlastElementKind = 'TEXT' | 'SHAPE' | 'IMAGE' | 'LINE';
export type BlastShape = 'RECTANGLE' | 'ELLIPSE' | 'TRIANGLE' | 'DIAMOND' | 'STAR' | 'HEXAGON' | 'ARROW' | 'HEART' | 'SPEECH';
export type CreativeMode = 'GUIDED' | 'FREEFORM';
export type CreativeRole = 'HEADLINE' | 'DECK' | 'BODY' | 'BYLINE' | 'KICKER' | 'CAPTION' | 'QUOTE' | 'STAT' | 'DATE' | 'LOCATION' | 'CALL_TO_ACTION' | 'PHOTO' | 'LOGO' | 'DECORATION';

export interface CreativeRecipeState {
  familyId: string;
  directionId: string;
  mode: CreativeMode;
  slotValues?: Record<string, string>;
}

export interface CreativeFinding {
  code: string;
  severity: 'BLOCKING' | 'ADVISORY';
  title: string;
  message: string;
  pageId?: string;
  sceneId?: string;
  elementId?: string;
  repair?: 'EXTEND_TIMING' | 'MOVE_TO_SAFE_ZONE';
}

/** A freely positioned object on a Blast publication page. */
export interface BlastElement {
  id: string;
  kind: BlastElementKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  groupId?: string;
  /** Semantic purpose used by recipes and quality checks; optional for older documents. */
  role?: CreativeRole;
  /** True when Guided mode should protect this structural layer from accidental edits. */
  recipeOwned?: boolean;
  text?: string;
  /** Sanitized inline HTML used for mixed bold/italic/underline text runs. */
  richText?: string;
  imageAssetId?: string;
  fit?: 'cover' | 'contain';
  shape?: BlastShape;
  fill: string;
  fillType?: 'SOLID' | 'LINEAR' | 'RADIAL';
  fillSecondary?: string;
  fillAngle?: number;
  stroke: string;
  strokeWidth: number;
  strokeStyle?: 'SOLID' | 'DASHED' | 'DOTTED';
  radius: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle?: 'normal' | 'italic';
  underline?: boolean;
  strikethrough?: boolean;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  align: 'left' | 'center' | 'right';
  textStrokeColor?: string;
  textStrokeWidth?: number;
  shadowColor?: string;
  shadowX?: number;
  shadowY?: number;
  shadowBlur?: number;
  blendMode?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  grayscale?: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface BlastPage {
  id: string;
  name: string;
  background: string;
  elements: BlastElement[];
}

/** A page-layout document made in Blast: flyer, poster, or newsletter. */
export interface BlastProject extends Base {
  title: string;
  authorId?: string;
  storyId?: string;
  format: 'LETTER_PORTRAIT' | 'LETTER_LANDSCAPE' | 'SQUARE' | 'STORY';
  width: number;
  height: number;
  pages: BlastPage[];
  creativeRecipe?: CreativeRecipeState;
}

export type MotionFormat = 'WIDE' | 'VERTICAL' | 'SQUARE';
export type MotionSceneKind = 'OPEN' | 'HEADLINE' | 'LOWER_THIRD' | 'QUOTE' | 'STAT' | 'COMING_UP' | 'TRANSITION' | 'END';
export type MotionBinding = 'CUSTOM' | 'SHOW_NAME' | 'STORY_TITLE' | 'BYLINE' | 'CHANNEL' | 'QUOTE';
export type MotionPreset = 'NONE' | 'FADE' | 'SLIDE_LEFT' | 'SLIDE_RIGHT' | 'SLIDE_UP' | 'POP' | 'WIPE' | 'TYPE_ON' | 'SPIN';
export type MotionEase = 'LINEAR' | 'EASE_OUT' | 'EASE_IN_OUT' | 'BACK_OUT';

export interface MotionKeyframe {
  id: string;
  atMs: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
}

/** A layer in a reusable broadcast graphic. Coordinates use the package's native pixels. */
export interface MotionElement {
  id: string;
  kind: 'TEXT' | 'SHAPE' | 'IMAGE';
  name: string;
  role?: CreativeRole;
  recipeOwned?: boolean;
  /** Layers inserted together from an authored Stinger graphic remain identifiable as one piece. */
  groupId?: string;
  /** Full-canvas palette backgrounds can be replaced without disturbing foreground graphics. */
  backgroundGroup?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  hidden: boolean;
  locked: boolean;
  text?: string;
  binding?: MotionBinding;
  imageAssetId?: string;
  shape?: 'RECTANGLE' | 'ELLIPSE' | 'TRIANGLE' | 'LINE';
  fill: string;
  fillSecondary?: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  shadowColor?: string;
  shadowX?: number;
  shadowY?: number;
  shadowBlur?: number;
  startMs: number;
  endMs: number;
  enter: MotionPreset;
  exit: MotionPreset;
  ease: MotionEase;
  keyframes: MotionKeyframe[];
}

export interface MotionScene {
  id: string;
  name: string;
  kind: MotionSceneKind;
  durationMs: number;
  background: string;
  backgroundSecondary?: string;
  elements: MotionElement[];
  /** A Studio-made or Gate-approved sound cue. Showtime can mix it with programme audio. */
  audioAssetId?: string;
}

export interface MotionTheme {
  showName: string;
  primary: string;
  secondary: string;
  accent: string;
  paper: string;
  ink: string;
  fontDisplay: string;
  fontBody: string;
  logoAssetId?: string;
}

/** A saved, reusable show-identity package made in Stinger. */
export interface MotionPackage extends Base {
  title: string;
  authorId?: string;
  storyId?: string;
  format: MotionFormat;
  width: number;
  height: number;
  theme: MotionTheme;
  scenes: MotionScene[];
  creativeRecipe?: CreativeRecipeState;
}

export type ShowtimeFormat = 'WIDE' | 'VERTICAL' | 'SQUARE';
export type ShowtimeTransition = 'CUT' | 'DISSOLVE' | 'DIP_BLACK';
export type ShowtimeRecipeId = 'BULLETIN_60' | 'PACKAGE_180' | 'INTERVIEW_PROFILE' | 'EVENT_RECAP' | 'VERTICAL_SOCIAL';
export type ShowtimeMediaKind = 'VIDEO' | 'AUDIO';
export type ShowtimeTrackKind = 'VIDEO' | 'TITLE' | 'AUDIO';
export type ShowtimeTrackRole = 'OVERLAY' | 'PRIMARY' | 'TITLE' | 'VOICE' | 'MUSIC' | 'SFX';

export interface ShowtimeTrack {
  id: string;
  kind: ShowtimeTrackKind;
  role: ShowtimeTrackRole;
  name: string;
  order: number;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  volume: number;
}

export interface ShowtimePacingRail {
  id: string;
  label: string;
  purpose: string;
  startSec: number;
  endSec: number;
  color: string;
}

export interface ShowtimeProgramPlan {
  recipeId: ShowtimeRecipeId;
  targetSec: number;
  rails: ShowtimePacingRail[];
}

/** One non-destructive edit of a source video in a Showtime sequence. */
export interface ShowtimeClip {
  id: string;
  assetId: string;
  name: string;
  trimInSec: number;
  trimOutSec: number;
  sourceDurationSec: number;
  volume: number;
  muted: boolean;
  speed: number;
  transition: ShowtimeTransition;
  transitionSec: number;
  /** Source-frame metadata captured when footage enters the edit. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Optional multitrack fields. Missing values are normalized as a legacy V1 edit. */
  trackId?: string;
  mediaKind?: ShowtimeMediaKind;
  startSec?: number;
  anchorClipId?: string;
  anchorOffsetSec?: number;
  fit?: 'COVER' | 'CONTAIN';
  scale?: number;
  positionX?: number;
  positionY?: number;
  opacity?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

export interface ShowtimeTitle {
  id: string;
  kind: 'HEADLINE' | 'LOWER_THIRD' | 'CAPTION';
  text: string;
  subtext: string;
  startSec: number;
  endSec: number;
  position: 'TOP' | 'MIDDLE' | 'BOTTOM';
  background: string;
  color: string;
}

/** A persistent video project: raw sources stay untouched while this stores the decisions. */
export interface ShowtimeProject extends Base {
  title: string;
  authorId?: string;
  storyId?: string;
  format: ShowtimeFormat;
  width: number;
  height: number;
  clips: ShowtimeClip[];
  titles: ShowtimeTitle[];
  /** Track layout is optional so projects from earlier Chatter builds open unchanged. */
  tracks?: ShowtimeTrack[];
  /** Optional rundown guide. It shapes the cut but never creates fake media. */
  programPlan?: ShowtimeProgramPlan;
}

export type PodcastSegmentKind = 'COLD_OPEN' | 'INTRO' | 'STORY' | 'INTERVIEW' | 'BREAK' | 'CREDITS' | 'CUSTOM';
export type PodcastTrackKind = 'VOICE' | 'MUSIC' | 'SFX' | 'AMBIENCE';
export type PodcastVoicePreset = 'NATURAL' | 'CLEAN' | 'WARM' | 'BRIGHT' | 'CLOSE' | 'CHARACTER';
export type PodcastEpisodeType = 'FULL' | 'BONUS' | 'TRAILER';
export type PodcastProjectState = 'DRAFT' | 'REVIEW' | 'FINAL';
export type PodcastFormatId = 'NEWS_ROUNDTABLE' | 'ONE_QUESTION' | 'FIELD_NOTES' | 'FACT_BREAK_DEBATE' | 'CULTURE_REVIEW';

/** The reusable identity and defaults for a podcast series. */
export interface PodcastShow extends Base {
  title: string;
  description: string;
  authorId?: string;
  hostIds: string[];
  coverAssetId?: string;
  themeAssetId?: string;
  outroAssetId?: string;
  defaultVoicePreset: PodcastVoicePreset;
  nextEpisodeNumber: number;
}

/** One card in the editorial rundown. Several story cards may share one episode. */
export interface PodcastSegment {
  id: string;
  kind: PodcastSegmentKind;
  title: string;
  storyId?: string;
  script: string;
  notes: string;
  /** The editorial job this card performs. Optional for older saved episodes. */
  purpose?: string;
  targetSec: number;
  color: string;
}

export interface PodcastTrack {
  id: string;
  name: string;
  kind: PodcastTrackKind;
  color: string;
  volumeDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  voicePreset: PodcastVoicePreset;
  effectAmount: number;
  duckUnderVoice: boolean;
}

/** A non-destructive source recording; pending imports require approval before playback in a mix. */
export interface PodcastClip {
  /** Source-audio seconds of a manually verified shared clap/word. */
  syncCueSec?: number;
  id: string;
  assetId: string;
  trackId: string;
  name: string;
  startSec: number;
  trimInSec: number;
  trimOutSec: number;
  sourceDurationSec: number;
  gainDb: number;
  fadeInSec: number;
  fadeOutSec: number;
  muted: boolean;
  /** Transcript ranges removed from playback without touching the original file. */
  omittedRanges: Array<{ start: number; end: number }>;
}

export interface PodcastChapter {
  id: string;
  title: string;
  atSec: number;
  storyId?: string;
}

/** A complete Chatterbox edit, from rundown through mastering decisions. */
export interface PodcastProject extends Base {
  title: string;
  description: string;
  authorId?: string;
  showId: string;
  storyIds: string[];
  seasonNumber?: number;
  episodeNumber?: number;
  episodeType: PodcastEpisodeType;
  explicit: boolean;
  state: PodcastProjectState;
  /** The editorial format that shaped the rundown. */
  formatId?: PodcastFormatId;
  /** SHOW uses the reusable show cover while EPISODE uses artworkAssetId. */
  artworkMode?: 'SHOW' | 'EPISODE';
  artworkAssetId?: string;
  coverBlastProjectId?: string;
  musicRightsConfirmed?: boolean;
  segments: PodcastSegment[];
  tracks: PodcastTrack[];
  clips: PodcastClip[];
  chapters: PodcastChapter[];
  targetLufs: number;
  truePeakDb: number;
}

/**
 * One log line. It is simultaneously the sync event and the audit event -
 * one mechanism, two jobs. SPEC S9b.
 */
export interface LogEvent {
  id: string;
  deviceId: string;
  lamport: number;
  wallClock: number;   // for humans reading the audit log ONLY, never for merge
  actor?: string;
  action: string;
  target: string;
  payload?: unknown;
}
