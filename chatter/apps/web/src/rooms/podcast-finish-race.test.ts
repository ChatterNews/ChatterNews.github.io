import { expect, it } from 'vitest';
import { DEFAULT_GATE_CONFIG, Gate, MemoryStore, type PodcastProject } from '@chatter/shared';
import { ensurePodcastWorkspace, savePodcastProject } from './podcast-workspace.js';
import { finishSession } from '../portable/finish-session.js';
import { sessionDownloadDirectory } from '../portable/mobile-session.js';
import { exportPortableStory, importPortableStory } from '../portable/portable-project.js';

async function linkedWorkspace() {
  const store = new MemoryStore();
  const story = await store.stories.create({ title: 'Monday report' });
  const { project } = await ensurePodcastWorkspace(store, { requestedStoryId: story.id });
  return { store, story, project };
}

function pauseNextUpdate(store: MemoryStore, projectId: string) {
  let release!: () => void;
  let entered!: () => void;
  let first = true;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const update = store.podcastProjects.update.bind(store.podcastProjects);
  store.podcastProjects.update = async (id: string, patch: Partial<PodcastProject>) => {
    if (first && id === projectId) { first = false; entered(); await blocked; }
    return update(id, patch);
  };
  return { release, started };
}

function gateFor(store: MemoryStore) {
  return new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0; } });
}

it('Finish waits for a first episode save after Chatterbox unmounts, then checks its story link', async () => {
  const store = new MemoryStore();
  await store.stories.create({ title: 'Monday story' });
  const { project } = await ensurePodcastWorkspace(store);
  project.title = 'The only copy of my interview plan';
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const savingStarted = new Promise<void>(resolve => { entered = resolve; });
  const create = store.podcastProjects.create.bind(store.podcastProjects);
  store.podcastProjects.create = async (input: PodcastProject) => { entered(); await blocked; return create(input); };
  // Unmount starts this save without retaining a mounted-editor checkpoint.
  const saving = savePodcastProject(store, project);
  await savingStarted;
  const destination = sessionDownloadDirectory();
  let completed = false;
  const finishing = finishSession(store, destination.directory).finally(() => { completed = true; });
  void finishing.catch(() => undefined);
  try {
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(completed, 'Finish must not certify the story-only snapshot before the episode is stored').toBe(false);
    expect(destination.entries.size).toBe(0);
  } finally { release(); await saving; }
  await expect(finishing).rejects.toThrow('The only copy of my interview plan');
  expect(await store.podcastProjects.list()).toHaveLength(1);
});

it('individual export waits for an existing episode save and includes its latest script', async () => {
  const { store, story, project } = await linkedWorkspace();
  const paused = pauseNextUpdate(store, project.id);
  project.segments[0]!.script = 'Keep the words typed just before leaving.';
  const saving = savePodcastProject(store, project);
  await paused.started;
  let completed = false;
  const exporting = exportPortableStory(store, story).finally(() => { completed = true; });
  void exporting.catch(() => undefined);
  try {
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(completed, 'Individual export must await the queued draft').toBe(false);
  } finally { paused.release(); await saving; }
  const packed = await exporting;
  expect(packed.project.podcastProjects?.[0]?.segments[0]?.script).toBe(project.segments[0]!.script);
});

it('import waits for the older local save so it cannot overwrite the incoming episode afterward', async () => {
  const { store, story, project } = await linkedWorkspace();
  project.segments[0]!.script = 'The incoming edited script.';
  await savePodcastProject(store, project);
  const packed = await exportPortableStory(store, story);
  const paused = pauseNextUpdate(store, project.id);
  project.segments[0]!.script = 'An older pending local draft.';
  const saving = savePodcastProject(store, project);
  await paused.started;
  let completed = false;
  const importing = importPortableStory(store, gateFor(store), new File([packed.blob], packed.fileName)).finally(() => { completed = true; });
  void importing.catch(() => undefined);
  try {
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(completed, 'Import must not race the older pending local write').toBe(false);
  } finally { paused.release(); await saving; }
  expect((await importing).updated).toBe(true);
  const final = await store.podcastProjects.list();
  expect(final).toHaveLength(1);
  expect(final[0]!.segments[0]!.script).toBe('The incoming edited script.');
});

it.each(['Finish', 'export', 'import'] as const)('%s retains a failed episode save until that same project is successfully retried', async operation => {
  const { store, story, project } = await linkedWorkspace();
  const packed = await exportPortableStory(store, story);
  const update = store.podcastProjects.update.bind(store.podcastProjects);
  store.podcastProjects.update = async () => { throw new Error('Disk temporarily full.'); };
  project.segments[0]!.script = 'The unsaved interview question must survive.';
  await expect(savePodcastProject(store, project)).rejects.toThrow('Disk temporarily full.');
  store.podcastProjects.update = update;
  const reopened = await ensurePodcastWorkspace(store, { requestedProjectId: project.id });
  expect(reopened.project.segments[0]!.script).toBe(project.segments[0]!.script);
  const otherStory = await store.stories.create({ title: 'Another crew report' });
  const other = await ensurePodcastWorkspace(store, { requestedStoryId: otherStory.id });
  other.project.description = 'A different episode saved successfully.';
  await savePodcastProject(store, other.project);
  const run = () => operation === 'Finish'
    ? finishSession(store, sessionDownloadDirectory().directory)
    : operation === 'export' ? exportPortableStory(store, story)
      : importPortableStory(store, gateFor(store), new File([packed.blob], packed.fileName));
  await expect(run()).rejects.toThrow();
  await savePodcastProject(store, reopened.project);
  await expect(run()).resolves.toBeDefined();
});
