/**
 * The publish block. SPEC S6, Green Light: publish is BLOCKED when an
 * identifiable minor lacks a valid Release.
 *
 * A block, not a reminder. Nothing here warns and continues.
 */
import type { Store } from './store.js';
import type { Appearance, PublishingReceiptInput, Release, User } from './types.js';
import { reviewMediaKey, reviewProgress } from './newsroom.js';
import { prosePlainText } from './readtime.js';
import { saveDeliverable } from './deliverables.js';
import { publishingReceipt } from './publishing-receipt.js';
import { recipeOutputRequirement } from './recipe-output.js';

export type BlockReason =
  | 'no-release'
  | 'release-expired'
  | 'release-refused'
  | 'missing-media'
  | 'take-edit-not-rendered'
  | 'picture-not-checked';

export interface Blocker {
  reason: BlockReason;
  userId?: string;
  penName?: string;
  assetId: string;
  /** What Green Light actually shows. Plain, and never blaming a kid. */
  say: string;
}

export interface PublishVerdict {
  ok: boolean;
  blockers: Blocker[];
}

function releaseFor(releases: Release[], userId: string): Release | undefined {
  return releases.find((r) => r.userId === userId);
}

function checkRelease(release: Release | undefined, now: number): BlockReason | undefined {
  if (!release || release.status === 'NONE') return 'no-release';
  if (release.status === 'REFUSED') return 'release-refused';
  if (release.status === 'EXPIRED') return 'release-expired';
  if (release.expiresAt !== undefined && release.expiresAt < now) return 'release-expired';
  return undefined;
}

function say(reason: BlockReason, who: string): string {
  switch (reason) {
    case 'no-release':
      return `You can tell it is ${who} in this one. Until a grown-up at home says yes, this waits. Nobody messed up.`;
    case 'release-expired':
      return `The yes we had for ${who} has run out. Somebody needs to ask their family again.`;
    case 'release-refused':
      return `${who}'s family said no, and that is allowed. Use a different picture.`;
    case 'picture-not-checked':
      return 'One media file has not been through the checker yet. It goes out once a teacher has looked.';
    case 'missing-media':
      return 'One attached media file is missing. Restore it or remove its reference before release.';
    case 'take-edit-not-rendered':
      return 'The chosen take has new audio edits. Open the Booth and send the edited take to review so the audience hears the right version.';
  }
}

/**
 * Can this story go out? Returns every reason it cannot, so Green Light shows
 * the whole list rather than one problem at a time.
 */
export async function canPublish(store: Store, storyId: string, now = Date.now()): Promise<PublishVerdict> {
  const [appearances, releases, users, assets, credits, takes] = await Promise.all([
    store.appearances.list() as Promise<Appearance[]>,
    store.releases.list() as Promise<Release[]>,
    store.users.list() as Promise<User[]>,
    store.assets.list(),
    store.credits.list(),
    store.takes.list(),
  ]);

  const mine = appearances.filter((a) => a.storyId === storyId);
  const blockers: Blocker[] = [];
  const linkedAssets = new Set([
    ...mine.map((item) => item.assetId),
    ...credits.filter((item) => item.storyId === storyId).map((item) => item.assetId),
    ...takes.filter((item) => item.storyId === storyId).flatMap((item) => [item.assetId, ...(item.renderedAssetId ? [item.renderedAssetId] : [])]),
  ]);
  for (const assetId of linkedAssets) {
    const asset = assets.find((item) => item.id === assetId);
    const reason = !asset ? 'missing-media' : asset.gateStatus !== 'APPROVED' ? 'picture-not-checked' : undefined;
    if (reason) blockers.push({ reason, assetId, say: say(reason, '') });
  }
  const story = await store.stories.get(storyId);
  const chosen = takes.find((take) => take.id === story?.selectedTakeId);
  if (chosen?.edits && (!chosen.renderedAssetId || chosen.renderedEditKey !== JSON.stringify(chosen.edits))) blockers.push({ reason: 'take-edit-not-rendered', assetId: chosen.assetId, say: say('take-edit-not-rendered', '') });

  for (const appearance of mine) {
    if (!appearance.identifiable) continue;

    const reason = checkRelease(releaseFor(releases, appearance.userId), now);
    if (!reason) continue;

    const who = users.find((u) => u.id === appearance.userId)?.penName ?? 'somebody';
    blockers.push({
      reason,
      userId: appearance.userId,
      penName: who,
      assetId: appearance.assetId,
      say: say(reason, who),
    });
  }

  return { ok: blockers.length === 0, blockers };
}

export interface PublishOptions {
  actor: string;
  role?: 'STUDENT' | 'ADVISER' | 'ADMIN';
  channel?: string;
  receipt: PublishingReceiptInput;
}

/**
 * Put a story out. This is the ONLY way a story reaches DONE, so the block
 * cannot be walked around by setting a status somewhere else.
 *
 * Throws rather than returning a flag: a caller that ignores the result must
 * not be able to publish by accident.
 */
export async function publishStory(
  store: Store,
  storyId: string,
  options: PublishOptions,
): Promise<{ episodeId: string }> {
  // At Tier 0 this is the adviser's own device. See SPEC S12 question 6.
  if (options.role && options.role !== 'ADVISER' && options.role !== 'ADMIN') {
    throw new Error('Only a teacher can send this one out.');
  }
  const receipt = publishingReceipt(options.receipt, options.actor);

  const story = await store.stories.get(storyId);
  if (!story) throw new Error(`no story ${storyId}`);
  if (story.creationRecipeId === 'podcast') throw new Error('Release a podcast episode from Chatterbox so its listening master, notes, and artwork stay together.');

  const verdict = await canPublish(store, storyId);

  if (!verdict.ok) {
    await store.events.append({
      action: 'publish.refused',
      target: storyId,
      actor: options.actor,
      payload: { reasons: verdict.blockers.map((b) => b.reason) },
    });
    throw new Error(
      `This one cannot go out yet. ${verdict.blockers.map((b) => b.say).join(' ')}`,
    );
  }

  // Older projects can still use the legacy release path. Once the crew has
  // started a review, unfinished notes or an outdated version cannot bypass it.
  const review = (await store.reviews.list()).find((item) => item.storyId === storyId);
  if (review && (review.state !== 'READY' || !reviewProgress(review, story, await reviewMediaKey(store, storyId)).ready)) {
    await store.events.append({ action: 'publish.refused', target: storyId, actor: options.actor, payload: { reasons: ['crew-review-incomplete'] } });
    throw new Error('Finish the crew review of the current version in Green Light before release.');
  }

  if (story.creationRecipeId) {
    const output = recipeOutputRequirement(story, await store.deliverables.list());
    if (!output.ready) {
      await store.events.append({ action: 'publish.refused', target: storyId, actor: options.actor, payload: { reasons: ['recipe-output-missing'], room: output.room } });
      throw new Error(`Make the ${output.label} in ${output.room === 'CHATTERBOX' ? 'Chatterbox' : output.room[0] + output.room.slice(1).toLowerCase()} before release.`);
    }
  }

  const users = await store.users.list();
  const episode = await store.episodes.create({
    title: story.title,
    publishedAt: receipt.publishedAt,
    channel: options.channel ?? story.channels[0] ?? 'web',
    storyIds: [storyId],
    stories: [{
      storyId: story.id,
      title: story.title,
      slug: story.slug,
      channels: [...story.channels],
      body: structuredClone(story.body),
      readTimeSec: story.readTimeSec,
      ...(story.durationSec !== undefined ? { durationSec: story.durationSec } : {}),
      bylines: story.bylineIds.map((id) => users.find((user) => user.id === id)?.penName ?? id),
      ...(story.brief?.angle ? { angle: story.brief.angle } : {}),
    }],
    receipt,
  });

  const bylines = story.bylineIds.map((id) => users.find((user) => user.id === id)?.penName ?? id);
  const publishedText = [story.title, bylines.length ? `By ${bylines.join(', ')}` : '', story.brief?.angle ?? '', prosePlainText(story.body)].filter(Boolean).join('\n\n');
  await saveDeliverable(store, { bytes: new TextEncoder().encode(publishedText), title: `${story.title} · published copy`, fileName: `${story.slug}-published.txt`, kind: 'DOCUMENT', room: 'GREENLIGHT', stage: 'PUBLISHED', mime: 'text/plain', storyId: story.id, authorId: options.actor });

  await store.stories.update(storyId, { status: 'DONE', workflowStepId: 'out' });

  await store.events.append({
    action: 'publish.done',
    target: storyId,
    actor: options.actor,
    payload: { episodeId: episode.id, destinations: receipt.destinations },
  });

  return { episodeId: episode.id };
}
