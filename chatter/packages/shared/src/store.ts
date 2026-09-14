/**
 * The data layer, behind an interface. SPEC S11 step 1: Tier 1 sync must be
 * able to slot underneath this without room code changing.
 */
import type { Story, Asset, Take, Transcript, Credit, Release, RoleAssign, Badge, Episode, User, LogEvent, Appearance, BlastProject, CrewTask, StoryReview, MotionPackage, Deliverable, ShowtimeProject, PodcastShow, PodcastProject } from './types.js';
import type { GarageSamplerPreset, StudioProject } from './garage.js';

export interface Collection<T> {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface StoryCollection extends Collection<Story> {
  create(input: { title: string } & Partial<Story>): Promise<Story>;
  bySlug(slug: string): Promise<Story | undefined>;
}

/**
 * Assets are created ONLY by the Gate. There is deliberately no `create` here;
 * `gate.ingest` reaches for `unsafeCreate`, and a test asserts nothing else does.
 */
export interface AssetCollection extends Collection<Asset> {
  bySha256(sha256: string): Promise<Asset | undefined>;
  unsafeCreate(input: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>): Promise<Asset>;
}

export interface EventLog {
  append(input: { action: string; target: string; actor?: string; payload?: unknown }): Promise<LogEvent>;
  all(): Promise<LogEvent[]>;
  since(lamport: number): Promise<LogEvent[]>;
}

/** Content-addressed bytes. OPFS in the browser, memory in tests. */
export interface BlobStore {
  put(bytes: Uint8Array): Promise<string>;
  get(hash: string): Promise<Uint8Array | undefined>;
  has(hash: string): Promise<boolean>;
  remove(hash: string): Promise<void>;
  /** Every hash held locally. Tier 1 uses it to answer "do you have this?". */
  list(): Promise<string[]>;
}

/**
 * One row of newsroom-wide settings, not a collection. It rides in the `meta`
 * object store the browser already has, so adding it costs no DB_VERSION bump.
 */
export interface SettingsStore {
  get(): Promise<Partial<import('./adviser.js').NewsroomSettings>>;
  save(patch: Partial<import('./adviser.js').NewsroomSettings>): Promise<Partial<import('./adviser.js').NewsroomSettings>>;
}

export interface Store {
  readonly deviceId: string;
  open(): Promise<void>;
  settings: SettingsStore;
  stories: StoryCollection;
  assets: AssetCollection;
  users: Collection<User> & { create(input: Partial<User> & { name: string; penName: string }): Promise<User> };
  takes: Collection<Take> & { create(input: Omit<Take, keyof import('./types.js').Base>): Promise<Take> };
  transcripts: Collection<Transcript> & { create(input: Omit<Transcript, keyof import('./types.js').Base>): Promise<Transcript> };
  credits: Collection<Credit> & { create(input: Omit<Credit, keyof import('./types.js').Base>): Promise<Credit> };
  appearances: Collection<Appearance> & {
    create(input: Omit<Appearance, keyof import('./types.js').Base>): Promise<Appearance>;
  };
  releases: Collection<Release> & { create(input: Omit<Release, keyof import('./types.js').Base>): Promise<Release> };
  roleAssigns: Collection<RoleAssign> & { create(input: Omit<RoleAssign, keyof import('./types.js').Base>): Promise<RoleAssign> };
  badges: Collection<Badge> & { create(input: Omit<Badge, keyof import('./types.js').Base>): Promise<Badge> };
  episodes: Collection<Episode> & { create(input: Omit<Episode, keyof import('./types.js').Base>): Promise<Episode> };
  deliverables: Collection<Deliverable> & { create(input: Omit<Deliverable, keyof import('./types.js').Base>): Promise<Deliverable> };
  blasts: Collection<BlastProject> & { create(input: Omit<BlastProject, keyof import('./types.js').Base>): Promise<BlastProject> };
  motionPackages: Collection<MotionPackage> & { create(input: Omit<MotionPackage, keyof import('./types.js').Base>): Promise<MotionPackage> };
  showtimeProjects: Collection<ShowtimeProject> & { create(input: Omit<ShowtimeProject, keyof import('./types.js').Base>): Promise<ShowtimeProject> };
  podcastShows: Collection<PodcastShow> & { create(input: Omit<PodcastShow, keyof import('./types.js').Base>): Promise<PodcastShow> };
  podcastProjects: Collection<PodcastProject> & { create(input: Omit<PodcastProject, keyof import('./types.js').Base>): Promise<PodcastProject> };
  samplerPresets: Collection<GarageSamplerPreset> & { create(input: Omit<GarageSamplerPreset, keyof import('./types.js').Base>): Promise<GarageSamplerPreset> };
  studioProjects: Collection<StudioProject> & { create(input: Omit<StudioProject, keyof import('./types.js').Base>): Promise<StudioProject> };
  crewTasks: Collection<CrewTask> & { create(input: Omit<CrewTask, keyof import('./types.js').Base>): Promise<CrewTask> };
  reviews: Collection<StoryReview> & { create(input: Omit<StoryReview, keyof import('./types.js').Base>): Promise<StoryReview> };
  jobs: Collection<import('./jobs.js').Job> & {
    create(input: Omit<import('./jobs.js').Job, keyof import('./types.js').Base>): Promise<import('./jobs.js').Job>;
  };
  events: EventLog;
  blobs: BlobStore;
}
