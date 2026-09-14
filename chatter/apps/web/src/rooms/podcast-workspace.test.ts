import { describe, expect, it } from 'vitest';
import { DEFAULT_GATE_CONFIG, Gate, MemoryStore, createPodcastProject, createPodcastShow, storyPath } from '@chatter/shared';
import JSZip from 'jszip';
import { ensurePodcastWorkspace, readActivePodcastId, rememberActivePodcastId, savePodcastProject, selectPodcastWorkspace } from './podcast-workspace.js';
import { exportPortableStory, importPortableStory } from '../portable/portable-project.js';
import { finishSession } from '../portable/finish-session.js';
import { sessionDownloadDirectory } from '../portable/mobile-session.js';

describe('Chatterbox workspace recovery', () => {
  const shows = [
    { id: 'show-old', updatedAt: 10 },
    { id: 'show-new', updatedAt: 20 },
  ];
  const projects = [
    { id: 'pod-old', showId: 'show-old', updatedAt: 50 },
    { id: 'pod-new', showId: 'show-new', updatedAt: 100 },
  ];

  it('restores the episode the student was actually using', () => {
    expect(selectPodcastWorkspace(shows, projects, 'pod-old')).toEqual({
      show: shows[0],
      project: projects[0],
    });
  });

  it('falls back to the latest valid episode when the remembered one is gone', () => {
    expect(selectPodcastWorkspace(shows, projects, 'missing')).toEqual({
      show: shows[1],
      project: projects[1],
    });
  });

  it('persists the active episode id in session storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    rememberActivePodcastId(storage, 'pod-old');
    expect(readActivePodcastId(storage)).toBe('pod-old');
  });
});

describe('Chatterbox story entry', () => {
  it('links a new episode to the durable requested story and loads its script', async () => {
    const store = new MemoryStore();
    const story = await store.stories.create({ title: 'The new playground', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The climbing wall opens Monday.' }] }] } });
    const { project } = await ensurePodcastWorkspace(store, { requestedStoryId: story.id });
    expect(project.storyIds).toEqual([story.id]);
    expect(project.segments.find(segment => segment.storyId === story.id)).toMatchObject({ title: 'The new playground', script: 'The climbing wall opens Monday.' });
    expect((await store.podcastProjects.get(project.id))?.storyIds).toEqual([story.id]);
  });

  it.each([undefined, 'missing-story'])('does not store an untouched starter for story selection %s', async (requestedStoryId) => {
    const store = new MemoryStore();
    await store.stories.create({ title: 'An unrelated story' });
    const ready = await ensurePodcastWorkspace(store, { requestedStoryId });
    expect(ready.project.storyIds).toEqual([]);
    expect(await store.podcastProjects.list()).toEqual([]);
  });

  it('opens the story episode instead of a remembered scratch or another story', async () => {
    const store = new MemoryStore();
    const story = await store.stories.create({ title: 'The requested story' });
    const otherStory = await store.stories.create({ title: 'Other crew' });
    const show = await store.podcastShows.create(createPodcastShow());
    const scratch = await store.podcastProjects.create(createPodcastProject(show, { title: 'My scratch recording' }));
    const other = await store.podcastProjects.create({ ...createPodcastProject(show), storyIds: [otherStory.id] });
    const linked = await store.podcastProjects.create({ ...createPodcastProject(show), storyIds: [story.id] });
    for (const rememberedProjectId of [scratch.id, other.id]) {
      expect((await ensurePodcastWorkspace(store, { requestedStoryId: story.id, rememberedProjectId })).project.id).toBe(linked.id);
    }
    expect(await store.podcastProjects.get(scratch.id)).toEqual(scratch);
    expect(await store.podcastProjects.get(other.id)).toEqual(other);
    expect(await store.podcastProjects.list()).toHaveLength(3);
  });

  it('preserves an explicitly opened episode even when the route also suggests a story', async () => {
    const store = new MemoryStore();
    const story = await store.stories.create({ title: 'Suggested story' });
    const show = await store.podcastShows.create(createPodcastShow());
    const scratch = await store.podcastProjects.create(createPodcastProject(show, { title: 'Keep this draft' }));
    expect((await ensurePodcastWorkspace(store, { requestedStoryId: story.id, requestedProjectId: scratch.id })).project).toEqual(scratch);
    expect(await store.podcastProjects.get(scratch.id)).toEqual(scratch);
  });

  it('serializes repeated and different story entries without duplicate or wrongly linked episodes', async () => {
    const store = new MemoryStore();
    const first = await store.stories.create({ title: 'First story' });
    const second = await store.stories.create({ title: 'Second story' });
    const [a, b, c] = await Promise.all([
      ensurePodcastWorkspace(store, { requestedStoryId: first.id }),
      ensurePodcastWorkspace(store, { requestedStoryId: first.id }),
      ensurePodcastWorkspace(store, { requestedStoryId: second.id }),
    ]);
    expect(a.project.id).toBe(b.project.id);
    expect(a.project.storyIds).toEqual([first.id]);
    expect(c.project.id).not.toBe(a.project.id);
    expect(c.project.storyIds).toEqual([second.id]);
    expect(await store.podcastProjects.list()).toHaveLength(2);
  });

  it('saves overlapping starter edits once under the same ID and preserves the latest snapshot', async () => {
    const store = new MemoryStore();
    const { project, show } = await ensurePodcastWorkspace(store);
    project.title = 'First words';
    const first = savePodcastProject(store, project);
    project.title = 'Latest words';
    const second = savePodcastProject(store, project);
    await Promise.all([first, second]);
    expect(await store.podcastProjects.list()).toHaveLength(1);
    expect(await store.podcastProjects.get(project.id)).toMatchObject({ title: 'Latest words', storyIds: [] });
    expect((await store.podcastShows.get(show.id))!.nextEpisodeNumber).toBe(2);
    await store.podcastProjects.remove(project.id);
    await expect(savePodcastProject(store, project)).rejects.toThrow('no longer');
    expect(await store.podcastProjects.list()).toHaveLength(0);
  });

  it('creates a separate linked episode while preserving meaningful scratch work and its Finish guard', async () => {
    const store = new MemoryStore();
    const story = await store.stories.create({ title: 'New report' });
    const { project } = await ensurePodcastWorkspace(store);
    project.title = 'Unfinished interview'; project.segments[0]!.script = 'Ask about the new classroom.';
    const scratch = await savePodcastProject(store, project);
    const linked = await ensurePodcastWorkspace(store, { requestedStoryId: story.id, rememberedProjectId: scratch.id });
    expect(linked.project.storyIds).toEqual([story.id]);
    expect(linked.project.id).not.toBe(scratch.id);
    expect(await store.podcastProjects.get(scratch.id)).toEqual(scratch);
    await expect(finishSession(store, sessionDownloadDirectory().directory)).rejects.toThrow('Unfinished interview');
  });

  it('finishes an imported story after its Chatterbox route opens without a preexisting episode', async () => {
    const original = new MemoryStore();
    const story = await original.stories.create({ title: 'Monday field report', creationRecipeId: 'podcast', workflowStepId: 'edit', channels: ['pod'], status: 'WORK' });
    const packed = await exportPortableStory(original, story);
    const store = new MemoryStore();
    const gate = new Gate(store, DEFAULT_GATE_CONFIG, { ready: true, async classify() { return 0; } });
    const imported = await importPortableStory(store, gate, new File([packed.blob], packed.fileName));
    const route = new URL(storyPath(imported.story), 'https://orbit.example');
    expect(route.pathname).toBe('/chatterbox');
    const ready = await ensurePodcastWorkspace(store, { requestedStoryId: route.searchParams.get('story') });
    const destination = sessionDownloadDirectory();
    const result = await finishSession(store, destination.directory);
    expect(result.files).toHaveLength(1);
    expect([...destination.entries.keys()].some(name => name.endsWith('/SESSION-COMPLETE.json'))).toBe(true);
    const archive = await JSZip.loadAsync(await destination.entries.get(`${result.folderName}/${result.files[0]!.file}`)!.arrayBuffer());
    const manifest = JSON.parse(await archive.file('story.chatter.json')!.async('string'));
    expect(manifest.podcastProjects).toHaveLength(1);
    expect(manifest.podcastProjects[0]).toMatchObject({ id: ready.project.id, storyIds: [imported.story.id] });
  });
});
