import type { Store } from './store.js';
import type { GarageProject, StudioProject } from './garage.js';

const pending = new WeakMap<Store, Promise<unknown>>();

export async function flushStudioSaves(store: Store): Promise<void> {
  await pending.get(store);
}

/** Resolve against durable stories: room props may still be loading on entry. */
export async function loadStudioSession(store: Store, selection: string | null, requestedStoryId?: string) {
  await flushStudioSaves(store);
  const [stories, sessions] = await Promise.all([store.stories.list(), store.studioProjects.list()]);
  const story = selection === null
    ? stories.find((row) => row.id === requestedStoryId) ?? stories.find((row) => row.status !== 'DONE') ?? stories[0]
    : stories.find((row) => row.id === selection);
  const storyId = selection === null ? story?.id ?? '' : selection;
  return { storyId, story, stories, saved: sessions.find((row) => row.storyId === (storyId || undefined)) };
}

/** Attach the saved scratch song in place; a different song is never replaced. */
export function linkStudioSession(store: Store, projectId: string, storyId: string): Promise<StudioProject> {
  const previous = pending.get(store) ?? Promise.resolve();
  const write = previous.then(async () => {
    if (!storyId || !await store.stories.get(storyId)) throw new Error('Choose a story that is still on this desk before linking the session.');
    const sessions = await store.studioProjects.list();
    const source = sessions.find((row) => row.project.id === projectId);
    if (!source) throw new Error('Save this Studio session before linking it.');
    if (source.storyId === storyId) return source;
    if (source.storyId) throw new Error('This Studio session is already linked to another story.');
    if (sessions.some((row) => row.storyId === storyId && row.id !== source.id)) {
      throw new Error('That story already has a Studio session. Choose another story, or create one in Slate. Both songs have been kept.');
    }
    return store.studioProjects.update(source.id, { storyId });
  });
  // A rejected attachment leaves the previous saved song intact. Preserve any
  // earlier save failure, but do not make a occupied-target error block Finish.
  pending.set(store, write.catch(() => previous));
  return write;
}

export function saveStudioSession(store: Store, storyId: string | undefined, project: GarageProject): Promise<StudioProject> {
  const snapshot = structuredClone(project);
  const write = (pending.get(store) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const current = (await store.studioProjects.list()).find((row) => row.storyId === storyId);
    return current
      ? store.studioProjects.update(current.id, { project: snapshot })
      : store.studioProjects.create({ ...(storyId ? { storyId } : {}), project: snapshot });
  });
  pending.set(store, write);
  return write;
}
