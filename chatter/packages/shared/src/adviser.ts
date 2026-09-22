/**
 * The Front Desk: everything the adviser can do that a student cannot.
 *
 * Two things live here. The WRITES an adviser needs and the app never had -
 * recording a permission slip, saying who is identifiable in a picture,
 * pulling a published piece back - and the QUEUE that decides what the Front
 * Desk shows first.
 *
 * Why this module exists at all: `publish.ts` blocks release when an
 * identifiable minor lacks a valid Release, and until now nothing outside the
 * seed and the .chatter import ever wrote a Release or an Appearance. The
 * block was real, tested, and never armed. These writes arm it.
 */
import type { Store } from './store.js';
import type { Appearance, Release, Story, User } from './types.js';
import { verifyAdviserPin } from './first-run.js';
import { canPublish } from './publish.js';
import { quarantined, type Decider } from './quarantine.js';
import { reviewMediaKey, reviewProgress } from './newsroom.js';

/**
 * Adviser entry requires the general authorization code and the device PIN.
 * These local checks deter casual access; a public client is not a server-enforced
 * identity boundary. Adviser writes also record who made the decision.
 */
function mustBeAdviser(decider: Decider): void {
  if (decider.role && decider.role !== 'ADVISER' && decider.role !== 'ADMIN') {
    throw new Error('Only a teacher can change this one.');
  }
}

// ---------------------------------------------------------------- permissions

async function setRelease(
  store: Store,
  userId: string,
  patch: Pick<Release, 'status'> & { expiresAt?: number },
  decider: Decider,
  action: string,
): Promise<Release> {
  mustBeAdviser(decider);

  const user = await store.users.get(userId);
  if (!user) throw new Error(`no user ${userId}`);

  // One release per student, updated in place. A second row for the same kid
  // would make `canPublish` depend on which one it happened to find first.
  const existing = (await store.releases.list()).find((item) => item.userId === userId);
  const release = existing
    ? await store.releases.update(existing.id, patch)
    : await store.releases.create({ userId, ...patch });

  await store.events.append({
    action,
    target: release.id,
    actor: decider.actor,
    payload: { userId, status: patch.status, ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}) },
  });
  return release;
}

/** A signed slip came back. This is the write the app has never had. */
export function recordRelease(
  store: Store, userId: string, decider: Decider, expiresAt?: number,
): Promise<Release> {
  return setRelease(
    store, userId,
    { status: 'ON_FILE', ...(expiresAt !== undefined ? { expiresAt } : {}) },
    decider, 'release.recorded',
  );
}

/** A family said no. That is allowed, and it is not a problem to be fixed. */
export function refuseRelease(store: Store, userId: string, decider: Decider): Promise<Release> {
  return setRelease(store, userId, { status: 'REFUSED' }, decider, 'release.refused');
}

/** Retire a permission early - a family changed their mind mid-year. */
export function expireRelease(store: Store, userId: string, decider: Decider): Promise<Release> {
  return setRelease(store, userId, { status: 'EXPIRED' }, decider, 'release.expired');
}

// ---------------------------------------------------------------- appearances

/**
 * Who is in this picture, and can you tell it is them.
 *
 * Nothing else in the app writes an Appearance, so without this the publish
 * block has nothing to check and never fires.
 */
export async function setAppearance(
  store: Store,
  input: { assetId: string; userId: string; identifiable: boolean; storyId?: string },
  decider: Decider,
): Promise<Appearance> {
  mustBeAdviser(decider);

  const asset = await store.assets.get(input.assetId);
  if (!asset) throw new Error(`no asset ${input.assetId}`);

  const existing = (await store.appearances.list())
    .find((item) => item.assetId === input.assetId && item.userId === input.userId);

  const appearance = existing
    ? await store.appearances.update(existing.id, {
        identifiable: input.identifiable,
        ...(input.storyId !== undefined ? { storyId: input.storyId } : {}),
      })
    : await store.appearances.create({
        assetId: input.assetId,
        userId: input.userId,
        identifiable: input.identifiable,
        ...(input.storyId !== undefined ? { storyId: input.storyId } : {}),
      });

  await store.events.append({
    action: 'appearance.set',
    target: appearance.id,
    actor: decider.actor,
    payload: { assetId: input.assetId, userId: input.userId, identifiable: input.identifiable },
  });
  return appearance;
}

// ----------------------------------------------------------------- pull back

/**
 * Take a published piece back out of public view.
 *
 * The frozen Episode snapshot STAYS. Pulling back removes the piece from the
 * public list and leaves the record that it was published, because destroying
 * that record is the one thing an audit log cannot survive.
 *
 * This does not contradict SPEC S9b. That rule stops a STUDENT device moving
 * status backwards past an adviser gate; an adviser's own device un-approving
 * is the exception the rule is written around.
 */
export async function holdStory(store: Store, storyId: string, decider: Decider): Promise<Story> {
  mustBeAdviser(decider);

  const story = await store.stories.get(storyId);
  if (!story) throw new Error(`no story ${storyId}`);
  if (story.status !== 'DONE') {
    throw new Error('Only a piece that is already out can be pulled back.');
  }

  const held = await store.stories.update(storyId, { status: 'HELD' });
  await store.events.append({ action: 'story.held', target: storyId, actor: decider.actor });
  return held;
}

// ------------------------------------------------------------------ settings

export interface NewsroomSettings {
  /** Device-local grants; never transferred in newsroom/project exports. */
  studentAccessExceptions?: import('./access.js').StudentAccessException[];
  /** Device-local marker for the Newsroom Check-In contract. */
  setupVersion?: 1;
  /** Which entrance this computer offered most recently. It grants no authority. */
  preferredDesk?: 'STUDENT' | 'ADVISER';
  /** How long a raw take lives before the sweep takes it. One number, on purpose. */
  takeRetentionDays: number;
  /** Month a new school year begins, 0-indexed. August by default. */
  rolloverMonth: number;
  showName: string;
  /**
   * Four digits, or empty for no PIN. A speed bump that stops a curious
   * sixth-grader reaching the quarantine queue - NOT security, and the copy
   * beside it must not imply otherwise.
   */
  adviserPin: string;
  /**
   * What the last sweep did. Not a setting - a record, kept here because the
   * sweep runs on app open and its result was previously thrown away, leaving
   * nobody able to say which of a student's takes had been deleted.
   */
  lastSweep?: { at: number; assetsDeleted: number; assetsSpared: number; usersPurged: number };
}

export const DEFAULT_SETTINGS: NewsroomSettings = {
  takeRetentionDays: 90,
  rolloverMonth: 7,
  showName: 'Chatter',
  adviserPin: '',
};

export async function getSettings(store: Store): Promise<NewsroomSettings> {
  return { ...DEFAULT_SETTINGS, ...(await store.settings.get()) };
}

export async function saveSettings(
  store: Store, patch: Partial<NewsroomSettings>, decider: Decider,
): Promise<NewsroomSettings> {
  mustBeAdviser(decider);

  if (patch.studentAccessExceptions !== undefined) throw new Error('Use the authorized extra-days control to change student access.');
  if (patch.adviserPin !== undefined && patch.adviserPin !== '' && !/^\d{4}$/.test(patch.adviserPin)) {
    throw new Error('A PIN is four digits, or empty for no PIN.');
  }
  if (patch.takeRetentionDays !== undefined && patch.takeRetentionDays < 1) {
    throw new Error('Takes have to live at least a day.');
  }

  const next = await store.settings.save(patch);
  await store.events.append({
    action: 'settings.saved',
    target: 'newsroom',
    actor: decider.actor,
    // The PIN itself never reaches the audit log.
    payload: { changed: Object.keys(patch).filter((key) => key !== 'adviserPin') },
  });
  return { ...DEFAULT_SETTINGS, ...next };
}

// -------------------------------------------------------------------- backup

export interface NewsroomBackup {
  format: 'chatter-newsroom';
  version: 1;
  exportedAt: number;
  deviceId: string;
  records: Record<string, unknown[]>;
  /**
   * Hashes only. The bytes themselves stay on this computer - a backup that
   * inlined every recording would be gigabytes, and the `.chatter` story
   * package already exists for carrying media to another machine.
   */
  blobHashes: string[];
}

export class NewsroomBackupAccessError extends Error {
  constructor(reason: 'setup' | 'pin') {
    super(reason === 'setup'
      ? 'Set up adviser access and a PIN before saving a whole-newsroom backup.'
      : 'Enter the correct adviser PIN. No backup was created.');
    this.name = 'NewsroomBackupAccessError';
  }
}

/**
 * Everything this newsroom knows, as one file.
 *
 * SPEC Tier 1a asks for a backup to be a button rather than a documented
 * habit. This is the Tier 0 form of that button.
 */
export async function newsroomBackup(store: Store, pin: string): Promise<NewsroomBackup> {
  // Authorize before reading any newsroom records, including for non-UI callers.
  if (!(await store.settings.get()).adviserPin) throw new NewsroomBackupAccessError('setup');
  if (!await verifyAdviserPin(store, pin)) throw new NewsroomBackupAccessError('pin');
  const [
    stories, assets, users, takes, transcripts, credits, appearances, releases,
    roleAssigns, badges, episodes, deliverables, blasts, motionPackages, showtimeProjects,
    podcastShows, podcastProjects, samplerPresets, studioProjects, crewTasks, reviews, events, blobHashes, settings,
  ] = await Promise.all([
    store.stories.list(), store.assets.list(), store.users.list(), store.takes.list(),
    store.transcripts.list(), store.credits.list(), store.appearances.list(),
    store.releases.list(), store.roleAssigns.list(), store.badges.list(),
    store.episodes.list(), store.deliverables.list(), store.blasts.list(),
    store.motionPackages.list(), store.showtimeProjects.list(), store.podcastShows.list(), store.podcastProjects.list(), store.samplerPresets.list(), store.studioProjects.list(), store.crewTasks.list(), store.reviews.list(),
    store.events.all(), store.blobs.list(), store.settings.get(),
  ]);

  // The PIN is a door on this computer, not part of the newsroom's record.
  const {
    studentAccessExceptions: _exceptions,
    adviserPin: _pin,
    setupVersion: _setupVersion,
    preferredDesk: _preferredDesk,
    ...keptSettings
  } = settings as Record<string, unknown>;

  const [soundProjects, soundItems, soundRevisions, soundCollections, soundOperations] = await Promise.all([store.soundProjects.list(), store.soundItems.list(), store.soundRevisions.list(), store.soundCollections.list(), store.soundOperations.list()]);
  return {
    format: 'chatter-newsroom',
    version: 1,
    exportedAt: Date.now(),
    deviceId: store.deviceId,
    records: {
      soundProjects, soundItems, soundRevisions, soundCollections, soundOperations,
      stories, assets, users, takes, transcripts, credits, appearances, releases,
      roleAssigns, badges, episodes, deliverables, blasts, motionPackages, showtimeProjects,
      podcastShows, podcastProjects, samplerPresets, studioProjects, crewTasks, reviews, events, settings: [keptSettings],
    },
    blobHashes,
  };
}

// --------------------------------------------------------------- the queue

export type FrontDeskKind =
  | 'QUARANTINE'
  | 'BLOCKED'
  | 'RELEASE_EXPIRING'
  | 'READY_FOR_RELEASE';

export interface FrontDeskItem {
  id: string;
  kind: FrontDeskKind;
  /** What the adviser reads first. Says the thing, not the number. */
  title: string;
  detail: string;
  actionLabel: string;
  /** Where the action goes: a route, or a panel on the Front Desk itself. */
  route?: string;
  panel?: 'permissions' | 'media' | 'records';
  count: number;
}

export interface FrontDeskQueue {
  items: FrontDeskItem[];
  /** Real items that did not fit under the cap. */
  more: number;
}

/** The hard cap from the design. A sixth item collapses into `more`. */
export const FRONT_DESK_LIMIT = 5;

/** A permission inside this window is a dated obligation, so it earns a slot. */
export const EXPIRY_WARNING_DAYS = 14;

const DAY = 24 * 60 * 60 * 1000;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * What needs the adviser, most urgent first.
 *
 * Only two things earn a place: something is blocking a student right now, or
 * it is a safety obligation with a date on it. One editorial line is allowed,
 * always last, because an adviser who has to leave the room to find out that
 * three pieces are waiting on them is exactly the hunting this room removes.
 */
export async function frontDeskQueue(store: Store, now = Date.now()): Promise<FrontDeskQueue> {
  const [waiting, stories, users, releases, reviews] = await Promise.all([
    quarantined(store),
    store.stories.list(),
    store.users.list() as Promise<User[]>,
    store.releases.list() as Promise<Release[]>,
    store.reviews.list(),
  ]);

  const items: FrontDeskItem[] = [];

  // 1. Quarantined media. Nothing that uses it can publish until a person looks.
  if (waiting.length > 0) {
    const first = waiting[0]!;
    items.push({
      id: 'quarantine',
      kind: 'QUARANTINE',
      title: `${waiting.length} ${plural(waiting.length, 'picture is', 'pictures are')} waiting on you`,
      detail: `Nothing that uses ${plural(waiting.length, 'it', 'them')} publishes until you look. The oldest has been waiting since ${new Date(first.createdAt).toLocaleDateString()}.`,
      actionLabel: plural(waiting.length, 'Review it', 'Review them'),
      panel: 'media',
      count: waiting.length,
    });
  }

  // 2. Pieces a student has finished that cannot go out for a permission reason.
  const live = stories.filter((story) => story.status !== 'DONE');
  const verdicts = await Promise.all(
    live.map(async (story) => [story, await canPublish(store, story.id, now)] as const),
  );
  for (const [story, verdict] of verdicts) {
    const permission = verdict.blockers.filter(
      (blocker) => blocker.reason === 'no-release' || blocker.reason === 'release-expired' || blocker.reason === 'release-refused',
    );
    if (permission.length === 0) continue;
    const first = permission[0]!;
    items.push({
      id: `blocked:${story.id}`,
      kind: 'BLOCKED',
      title: `“${story.title}” cannot go out yet`,
      detail: first.say,
      actionLabel: first.reason === 'release-refused' ? 'Open the piece' : 'Record a permission',
      ...(first.reason === 'release-refused' ? { route: `/greenlight/${story.id}` } : { panel: 'permissions' as const }),
      count: permission.length,
    });
  }

  // 3. Permissions with a date on them, running out soon.
  for (const release of releases) {
    if (release.status !== 'ON_FILE' || release.expiresAt === undefined) continue;
    const daysLeft = Math.ceil((release.expiresAt - now) / DAY);
    if (daysLeft > EXPIRY_WARNING_DAYS) continue;
    const who = users.find((user) => user.id === release.userId)?.penName ?? 'a student';
    items.push({
      id: `expiring:${release.userId}`,
      kind: 'RELEASE_EXPIRING',
      title: daysLeft <= 0
        ? `${who}'s permission has run out`
        : `${who}'s permission runs out in ${daysLeft} ${plural(daysLeft, 'day', 'days')}`,
      detail: 'Somebody needs to ask their family again before anything new with them in it goes out.',
      actionLabel: 'Renew it',
      panel: 'permissions',
      count: 1,
    });
  }

  // Most urgent first, and stable within a kind so the list does not shuffle
  // between visits.
  const rank: Record<FrontDeskKind, number> = {
    QUARANTINE: 0, BLOCKED: 1, RELEASE_EXPIRING: 2, READY_FOR_RELEASE: 3,
  };
  items.sort((a, b) => rank[a.kind] - rank[b.kind]);

  // 4. The one editorial line, always last.
  const ready = live.filter((story) => {
    const review = reviews.find((item) => item.storyId === story.id);
    return review?.state === 'READY';
  });
  const readyChecked = await Promise.all(
    ready.map(async (story) => {
      const review = reviews.find((item) => item.storyId === story.id);
      return reviewProgress(review, story, await reviewMediaKey(store, story.id)).ready;
    }),
  );
  const readyCount = readyChecked.filter(Boolean).length;
  if (readyCount > 0) {
    items.push({
      id: 'ready',
      kind: 'READY_FOR_RELEASE',
      title: `${readyCount} ${plural(readyCount, 'piece', 'pieces')} finished crew review`,
      detail: `${plural(readyCount, 'It is', 'They are')} waiting on your final yes.`,
      actionLabel: 'Open Green Light',
      route: '/greenlight',
      count: readyCount,
    });
  }

  return {
    items: items.slice(0, FRONT_DESK_LIMIT),
    more: Math.max(0, items.length - FRONT_DESK_LIMIT),
  };
}
