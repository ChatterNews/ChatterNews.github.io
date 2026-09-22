/**
 * Retention. SPEC S3: "enforced by a nightly job, not by policy prose."
 *
 * The COPPA rule this implements is that children's data may be kept only as
 * long as it is needed for the purpose it was collected for. Raw takes expire.
 * Published work is a different class of thing and persists.
 */
import { soundSourceAssetIds } from './sound.js';
import type { Store } from './store.js';
import type { Asset, Take, Transcript, Episode, User, Release, Appearance, Credit } from './types.js';

export interface RetentionOptions {
  /** Injectable so the whole policy can be time-travelled in a test. */
  now?: number;
  /**
   * Month a new school year begins, 0-indexed. August (7) by default, so the
   * roster turns over on 1 August.
   */
  rolloverMonth?: number;
}

export interface RetentionResult {
  assetsDeleted: number;
  /** Expired, but referenced by something published, so kept. */
  assetsSpared: number;
  usersPurged: number;
}

/**
 * Every asset that a published Episode depends on, directly or through a take.
 * These are exempt from expiry no matter how old they are.
 */
async function publishedAssetIds(store: Store): Promise<Set<string>> {
  const [episodes, takes] = await Promise.all([
    store.episodes.list() as Promise<Episode[]>,
    store.takes.list() as Promise<Take[]>,
  ]);

  const publishedStories = new Set(episodes.flatMap((e) => e.storyIds));
  const protectedAssets = new Set<string>();

  for (const take of takes) {
    if (publishedStories.has(take.storyId)) protectedAssets.add(take.assetId);
  }

  // A picture used in a published story is protected the same way.
  const appearances = await store.appearances.list() as Appearance[];
  for (const appearance of appearances) {
    if (appearance.storyId && publishedStories.has(appearance.storyId)) {
      protectedAssets.add(appearance.assetId);
    }
  }

  // Archived library items still protect bytes: archive is reversible.
  for (const item of await store.soundItems.list()) protectedAssets.add(item.assetId);
  for (const project of await store.soundProjects.list()) for (const id of soundSourceAssetIds(project)) protectedAssets.add(id);
  for (const revision of await store.soundRevisions.list()) {
    protectedAssets.add(revision.assetId);
    for (const id of [...revision.sourceAssetIds, ...soundSourceAssetIds(revision.snapshot)]) protectedAssets.add(id);
  }
  for (const operation of await store.soundOperations.list()) if (operation.state === 'STAGED') {
    if (operation.item) protectedAssets.add(operation.item.assetId);
    for (const item of operation.imported?.items ?? []) protectedAssets.add(item.assetId);
    for (const project of operation.imported?.projects ?? []) for (const id of soundSourceAssetIds(project)) protectedAssets.add(id);
    for (const revision of [...(operation.imported?.revisions ?? []), ...(operation.revision ? [operation.revision] : [])]) {
      protectedAssets.add(revision.assetId);
      for (const id of [...revision.sourceAssetIds, ...soundSourceAssetIds(revision.snapshot)]) protectedAssets.add(id);
    }
  }
  return protectedAssets;
}

/** The most recent 1st-of-the-rollover-month at or before `now`. */
function schoolYearStart(now: number, rolloverMonth: number): number {
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const thisYear = Date.UTC(year, rolloverMonth, 1);
  return thisYear <= now ? thisYear : Date.UTC(year - 1, rolloverMonth, 1);
}

export async function runRetention(
  store: Store,
  options: RetentionOptions = {},
): Promise<RetentionResult> {
  const now = options.now ?? Date.now();
  const rolloverMonth = options.rolloverMonth ?? 7;   // August

  const protectedAssets = await publishedAssetIds(store);
  const assets = await store.assets.list() as Asset[];

  let assetsDeleted = 0;
  let assetsSpared = 0;

  for (const asset of assets) {
    if (asset.expiresAt === undefined || asset.expiresAt > now) continue;

    if (protectedAssets.has(asset.id)) {
      assetsSpared++;
      continue;
    }

    // Bytes first: a record without bytes is recoverable, bytes without a
    // record are not accounted for anywhere.
    await store.blobs.remove(asset.sha256);

    const [takes, transcripts, credits] = await Promise.all([
      store.takes.list() as Promise<Take[]>,
      store.transcripts.list() as Promise<Transcript[]>,
      store.credits.list() as Promise<Credit[]>,
    ]);

    for (const take of takes.filter((t) => t.assetId === asset.id)) {
      await store.takes.remove(take.id);
    }
    for (const transcript of transcripts.filter((t) => t.assetId === asset.id)) {
      await store.transcripts.remove(transcript.id);
    }
    for (const credit of credits.filter((c) => c.assetId === asset.id)) {
      await store.credits.remove(credit.id);
    }

    await store.assets.remove(asset.id);
    assetsDeleted++;
  }

  // The roster and its permission slips are wiped at the year rollover.
  // Anyone added before the most recent turnover is last year's roster.
  let usersPurged = 0;
  const boundary = schoolYearStart(now, rolloverMonth);

  {
    const [users, releases] = await Promise.all([
      store.users.list() as Promise<User[]>,
      store.releases.list() as Promise<Release[]>,
    ]);

    for (const user of users) {
      // Advisers keep their accounts; it is the children's data that expires.
      if (user.role !== 'STUDENT') continue;
      if (user.createdAt >= boundary) continue;

      for (const release of releases.filter((r) => r.userId === user.id)) {
        await store.releases.remove(release.id);
      }
      await store.users.remove(user.id);
      usersPurged++;
    }
  }

  const result = { assetsDeleted, assetsSpared, usersPurged };

  await store.events.append({
    action: 'retention.swept',
    target: 'school',
    payload: result,
  });

  return result;
}
