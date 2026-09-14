/**
 * Optional demo content, taken from the prototype's fixtures so a person can
 * try a populated newsroom. It is installed only from Newsroom Check-In.
 */
import { slugify } from '@chatter/shared';
import type { Store, Status, StoryCreationRecipeId } from '@chatter/shared';

interface SeedStory {
  title: string;
  headline: string;
  who: string;
  due: string;
  channels: string[];
  status: Status;
  creationRecipeId: StoryCreationRecipeId;
}

const STORIES: SeedStory[] = [
  { title: 'Taco bar', headline: 'Cafeteria adds a taco bar on Wednesdays', who: 'Maya R.', due: 'Friday', channels: ['pod', 'web'], status: 'BOOTH', creationRecipeId: 'podcast' },
  { title: 'Gym floor', headline: 'Why has the gym floor been taped off for three weeks?', who: 'Deshawn T.', due: 'Friday', channels: ['web', 'social'], status: 'HELD', creationRecipeId: 'article' },
  { title: 'Solar race', headline: 'Fifth grade solar car race, in eleven photos', who: 'Priya K.', due: 'Friday', channels: ['web', 'social'], status: 'REVIEW', creationRecipeId: 'poster' },
  { title: 'Mr. Alvarez', headline: 'Mr. Alvarez is retiring after 22 years', who: 'Nina F.', due: 'Monday', channels: ['pod', 'web'], status: 'WORK', creationRecipeId: 'article' },
  { title: 'Mascot vote', headline: 'Kids will vote on a new mascot name', who: 'Sam O.', due: 'Monday', channels: ['web'], status: 'WORK', creationRecipeId: 'article' },
  { title: 'Book fair', headline: 'The book fair is back and it is bigger', who: 'Ivy L.', due: 'Wednesday', channels: ['social'], status: 'WORK', creationRecipeId: 'poster' },
  { title: 'Lost jackets', headline: 'Where do 200 lost jackets actually go?', who: 'Theo B. and Ivy L.', due: 'Wednesday', channels: ['pod'], status: 'WORK', creationRecipeId: 'podcast' },
];

/**
 * Guards against two callers seeding at once. React's StrictMode invokes the
 * opening effect twice, and without this both runs see an empty store and both
 * seed - which is how you get every story twice.
 */
let inFlight: Promise<void> | undefined;

/** The club, from the prototype's roster. 1 = a slip is on file. */
const ROSTER: [string, string, 'ON_FILE' | 'NONE' | 'EXPIRED'][] = [
  ['Maya R.', '6th', 'ON_FILE'],
  ['Deshawn T.', '7th', 'ON_FILE'],
  ['Priya K.', '7th', 'ON_FILE'],
  ['Jordan P.', '5th', 'NONE'],
  ['Aisha M.', '6th', 'EXPIRED'],
  ['Nina F.', '8th', 'ON_FILE'],
  ['Marcus D.', '8th', 'ON_FILE'],
  ['Ivy L.', '5th', 'ON_FILE'],
];

/**
 * Who has done what so far. Marcus is deliberately stuck on the microphone
 * and Jordan has not had a turn at anything - the two cases the Crew room
 * exists to make visible.
 */
const WORK_DONE: [string, string][] = [
  ['Marcus D.', 'voice'], ['Marcus D.', 'voice'], ['Marcus D.', 'voice'], ['Marcus D.', 'voice'],
  ['Maya R.', 'write'], ['Maya R.', 'voice'], ['Maya R.', 'report'],
  ['Deshawn T.', 'report'], ['Deshawn T.', 'picture'],
  ['Priya K.', 'picture'], ['Priya K.', 'edit'],
  ['Nina F.', 'write'], ['Nina F.', 'produce'],
  ['Ivy L.', 'report'],
];

export function seedDemoNewsroom(store: Store): Promise<void> {
  inFlight ??= runSeed(store).finally(() => { inFlight = undefined; });
  return inFlight;
}

async function runSeed(store: Store): Promise<void> {
  const existing = await store.stories.list();
  if (existing.length > 0) {
    for (const story of existing) {
      const fixture = STORIES.find((seed) => seed.title === story.title && seed.channels.join('|') === story.channels.join('|'));
      if (fixture && !story.creationRecipeId) await store.stories.update(story.id, { creationRecipeId: fixture.creationRecipeId });
    }
    return;
  }

  const slugs = new Set(existing.map((s) => s.slug));

  // The adviser. Not a child, so no permission slip and no year-end purge.
  await store.users.create({
    name: 'Ms. Boone', penName: 'Ms. Boone', role: 'ADVISER', active: true,
  });

  for (const [penName, gradeBand, releaseStatus] of ROSTER) {
    const user = await store.users.create({
      name: penName, penName, gradeBand, role: 'STUDENT', active: true,
    });
    await store.releases.create({
      userId: user.id,
      status: releaseStatus,
      // An expired slip is one that ran out at the end of last school year.
      ...(releaseStatus === 'EXPIRED'
        ? { expiresAt: Date.now() - 60 * 24 * 60 * 60 * 1000 }
        : {}),
    });
  }

  // Role assignments hang off stories that already exist, so this runs after
  // the stories are in.
  const seededStories: { id: string; title: string }[] = [];

  for (const seed of STORIES) {
    // Idempotent per story, so a half-finished seed can be resumed safely.
    if (slugs.has(slugify(seed.title))) continue;
    const story = await store.stories.create({
      title: seed.title,
      status: seed.status,
      channels: seed.channels,
      creationRecipeId: seed.creationRecipeId,
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: seed.headline }] }],
      },
      bylineIds: [seed.who],
    });
    seededStories.push({ id: story.id, title: story.title });

    // The gym floor story is the one held at the red light in the prototype:
    // two kids are identifiable in a photo and neither has a usable slip.
    if (seed.title === 'Gym floor') {
      const users = await store.users.list();
      const jordan = users.find((u: any) => u.penName === 'Jordan P.');
      const aisha = users.find((u: any) => u.penName === 'Aisha M.');
      if (jordan && aisha) {
        // The photo itself lives on the device that took it. Only its
        // metadata has reached this machine, which is the ordinary Tier 0
        // state described in SPEC S9b: metadata travels everywhere, bytes
        // travel only where they are needed. No Asset row is invented here -
        // an Asset may only be created by the Gate.
        const photoId = 'sha256:seed-gym-photo';
        for (const kid of [jordan, aisha]) {
          await store.appearances.create({
            assetId: photoId, storyId: story.id, userId: kid.id, identifiable: true,
          });
        }
      }
    }
  }

  const roster = await store.users.list();
  for (const [penName, role] of WORK_DONE) {
    const user = roster.find((u: any) => u.penName === penName);
    const story = seededStories[Math.floor(Math.random() * seededStories.length)];
    if (user && story) {
      await store.roleAssigns.create({
        userId: user.id, storyId: story.id, role, cycle: 'week-1',
      });
    }
  }
}
