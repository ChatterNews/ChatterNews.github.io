import { createPodcastProject, createPodcastShow, prosePlainText, type PodcastProject, type PodcastShow, type Store } from '@chatter/shared';

export const ACTIVE_PODCAST_KEY = 'chatter.chatterbox.activeProjectId';

type ShowRecord = { id: string; updatedAt: number };
type ProjectRecord = { id: string; showId: string; updatedAt: number };
type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

export function selectPodcastWorkspace<S extends ShowRecord, P extends ProjectRecord>(shows: S[], projects: P[], preferredProjectId?: string | null) {
  const validProjects = projects
    .filter((project) => shows.some((show) => show.id === project.showId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const project = validProjects.find((item) => item.id === preferredProjectId) ?? validProjects[0];
  const show = project
    ? shows.find((item) => item.id === project.showId)
    : [...shows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return { show, project };
}

export function readActivePodcastId(storage: StorageReader) {
  return storage.getItem(ACTIVE_PODCAST_KEY);
}

export function rememberActivePodcastId(storage: StorageWriter, projectId: string) {
  storage.setItem(ACTIVE_PODCAST_KEY, projectId);
}

interface PodcastSelection {
  authorId?: string;
  requestedProjectId?: string | null;
  rememberedProjectId?: string | null;
  requestedStoryId?: string | null;
}

function omitBase<T extends { id: string; createdAt: number; updatedAt: number }>(value: T): Omit<T, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = value;
  return rest;
}

const pending = new WeakMap<Store, Promise<unknown>>();
const starterIds = new WeakMap<Store, Set<string>>();
const failedProjects = new WeakMap<Store, Map<string, { snapshot: PodcastProject; error: unknown }>>();
const failedShows = new WeakMap<Store, Map<string, { snapshot: PodcastShow; error: unknown }>>();

/** An editor's unmount removes its checkpoint before its final write completes. */
export async function flushPodcastSaves(store: Store): Promise<void> {
  let last: Promise<unknown> | undefined;
  do { last = pending.get(store); await last; } while (last !== pending.get(store));
  const failure = failedProjects.get(store)?.values().next().value ?? failedShows.get(store)?.values().next().value;
  if (failure) throw failure.error;
}

function serialPodcastWork<T>(store: Store, run: () => Promise<T>): Promise<T> {
  // Route changes and Strict Mode may initialize at the same time. Each selection
  // gets its own result, after earlier writes become visible.
  const work = (pending.get(store) ?? Promise.resolve()).catch(() => undefined).then(run);
  pending.set(store, work);
  // Unmount cannot await a save. Retain its failure for the handoff barrier and
  // recovery, while callers that can await still receive the rejected promise.
  void work.catch(() => undefined);
  return work;
}

async function saveProject(store: Store, project: PodcastProject): Promise<PodcastProject> {
  try {
    const saved = await persistProject(store, project);
    failedProjects.get(store)?.delete(project.id);
    return saved;
  } catch (error) {
    const failures = failedProjects.get(store) ?? new Map();
    failures.set(project.id, { snapshot: project, error }); failedProjects.set(store, failures);
    throw error;
  }
}

async function persistProject(store: Store, project: PodcastProject): Promise<PodcastProject> {
  if (await store.podcastProjects.get(project.id)) return store.podcastProjects.update(project.id, omitBase(project));
  if (!starterIds.get(store)?.has(project.id)) throw new Error('This episode is no longer on this desk. Reopen it before editing.');
  const show = await store.podcastShows.get(project.showId);
  if (!show) throw new Error('This episode’s show is missing. Keep this tab open and retry.');
  await store.podcastShows.update(show.id, { nextEpisodeNumber: Math.max(show.nextEpisodeNumber, (project.episodeNumber ?? 0) + 1) });
  // Both Store implementations accept a full record and preserve its identity.
  // Takes and cover handoffs may already refer to this starter's project ID.
  const saved = await store.podcastProjects.create(project);
  starterIds.get(store)?.delete(project.id);
  return saved;
}

export function savePodcastProject(store: Store, project: PodcastProject): Promise<PodcastProject> {
  const snapshot = structuredClone(project);
  return serialPodcastWork(store, () => saveProject(store, snapshot));
}

export function savePodcastShow(store: Store, show: PodcastShow): Promise<PodcastShow> {
  const snapshot = structuredClone(show);
  return serialPodcastWork(store, async () => {
    try {
      const { nextEpisodeNumber: _next, ...edits } = omitBase(snapshot);
      const saved = await store.podcastShows.update(snapshot.id, edits);
      failedShows.get(store)?.delete(snapshot.id);
      return saved;
    } catch (error) {
      const failures = failedShows.get(store) ?? new Map();
      failures.set(snapshot.id, { snapshot, error }); failedShows.set(store, failures);
      throw error;
    }
  });
}

export function ensurePodcastWorkspace(store: Store, selection: PodcastSelection = {}) {
  return serialPodcastWork(store, async () => {
    const [savedShows, savedProjects, story] = await Promise.all([
      store.podcastShows.list(), store.podcastProjects.list(),
      selection.requestedStoryId ? store.stories.get(selection.requestedStoryId) : undefined,
    ]);
    // Keep failed drafts available when the room is reopened. Reading another
    // episode does not clear a failed write or turn it into somebody else's work.
    const shows = [...new Map([...savedShows, ...[...failedShows.get(store)?.values() ?? []].map(item => item.snapshot)].map(item => [item.id, item])).values()];
    const projects = [...new Map([...savedProjects, ...[...failedProjects.get(store)?.values() ?? []].map(item => item.snapshot)].map(item => [item.id, item])).values()];
    const explicit = projects.find(project => project.id === selection.requestedProjectId && shows.some(show => show.id === project.showId));
    const candidates = explicit ? [explicit] : story ? projects.filter(project => project.storyIds.includes(story.id)) : projects;
    let { show, project } = selectPodcastWorkspace(shows, candidates, selection.requestedProjectId ?? selection.rememberedProjectId);
    if (!show) show = await store.podcastShows.create(omitBase(createPodcastShow({ authorId: selection.authorId })));
    if (!project) {
      project = createPodcastProject(show, { authorId: selection.authorId });
      const starters = starterIds.get(store) ?? new Set<string>();
      starters.add(project.id); starterIds.set(store, starters);
      if (story) {
        project.storyIds = [story.id];
        const card = project.segments.find(segment => segment.kind === 'STORY')!;
        card.storyId = story.id; card.title = story.title; card.script = prosePlainText(story.body);
        project = await saveProject(store, project);
        show = (await store.podcastShows.get(show.id))!;
      }
    }
    return { show, project, starter: starterIds.get(store)?.has(project.id) ?? false, unsavedProject: failedProjects.get(store)?.has(project.id) ?? false, unsavedShow: failedShows.get(store)?.has(show.id) ?? false };
  });
}
