import { expect, test, vi } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { addAudioClip, addTrack, emptyProject } from './garage.js';
import { flushStudioSaves, linkStudioSession, loadStudioSession, saveStudioSession } from './studio-session.js';

test('rapid edits serialize to one durable song, keeping scratch and story sessions separate', async () => {
  const store = new MemoryStore('studio'); await store.open();
  const song = emptyProject('First', 100);
  const first = saveStudioSession(store, 'story', song);
  song.name = 'Last'; song.bpm = 125;
  const last = saveStudioSession(store, 'story', song);
  await flushStudioSaves(store);
  expect((await first).project.name).toBe('First');
  expect((await last).project.name).toBe('Last');
  expect(await store.studioProjects.list()).toHaveLength(1);
  await saveStudioSession(store, undefined, emptyProject('Scratch'));
  expect(await store.studioProjects.list()).toHaveLength(2);
});

test('failed saves stay visible and a later retry recovers', async () => {
  const store = new MemoryStore('failure'); await store.open();
  vi.spyOn(store.studioProjects, 'create').mockRejectedValueOnce(new Error('Quota exceeded'));
  await expect(saveStudioSession(store, 'story', emptyProject('Song'))).rejects.toThrow('Quota');
  await expect(flushStudioSaves(store)).rejects.toThrow('Quota');
  await saveStudioSession(store, 'story', emptyProject('Recovered'));
  await expect(flushStudioSaves(store)).resolves.toBeUndefined();
});

test('initial Studio selection waits for stored stories instead of opening an accidental scratch session', async () => {
  const store = new MemoryStore('late-story-list'); await store.open();
  const done = await store.stories.create({ title: 'Earlier edition', status: 'DONE' });
  const current = await store.stories.create({ title: 'Taco investigation' });
  let releaseStories!: () => void;
  const waiting = new Promise<void>((resolve) => { releaseStories = resolve; });
  const originalList = store.stories.list.bind(store.stories);
  vi.spyOn(store.stories, 'list').mockImplementationOnce(async () => { await waiting; return originalList(); });
  let opened = false;
  const opening = loadStudioSession(store, null).then((result) => { opened = true; return result; });
  await Promise.resolve();
  expect(opened).toBe(false);
  releaseStories();
  const selected = await opening;
  expect(selected.storyId).toBe(current.id);
  expect(selected.story?.title).toBe('Taco investigation');
  expect(await store.studioProjects.list()).toEqual([]);
  expect((await loadStudioSession(store, null, done.id)).storyId).toBe(done.id);
  expect((await loadStudioSession(store, '')).storyId).toBe('');
});

test('linking a saved scratch session preserves the latest MIDI, mix and project identity', async () => {
  const store = new MemoryStore('link-scratch'); await store.open();
  const story = await store.stories.create({ title: 'Music desk' });
  let song = addTrack(emptyProject('Recovered song', 113), 'Keys', 'engine-track', 'KEYS');
  song = addAudioClip(song, song.tracks[0]!.id, { engineId: 'engine-clip', name: 'Melody', source: 'INSTRUMENT', startSec: 2, sourceDurationSec: 4, notes: [{ engineId: 'engine-note', pitch: 64, startBeat: 1, durationBeats: 2, velocity: .6 }] });
  song.tracks[0]!.pan = -.35; song.tracks[0]!.gain = .43; song.masterGain = .72;
  const saved = await saveStudioSession(store, undefined, song);
  const latest = { ...song, name: 'Final recovered song' };
  const editing = saveStudioSession(store, undefined, latest);
  const linked = await linkStudioSession(store, song.id, story.id);
  await editing;
  expect(linked.id).toBe(saved.id);
  expect(linked.storyId).toBe(story.id);
  expect(linked.project).toEqual(latest);
  expect(await store.studioProjects.list()).toHaveLength(1);
  expect((await loadStudioSession(store, story.id)).saved?.project).toEqual(latest);
});

test('linking cannot replace another story session or lose either saved project', async () => {
  const store = new MemoryStore('occupied-story'); await store.open();
  const story = await store.stories.create({ title: 'Already composing' });
  const existing = await saveStudioSession(store, story.id, emptyProject('Existing song'));
  const scratch = await saveStudioSession(store, undefined, emptyProject('Keep this too'));
  await expect(linkStudioSession(store, scratch.project.id, story.id)).rejects.toThrow(/already has a Studio session/i);
  expect(await store.studioProjects.get(existing.id)).toEqual(existing);
  expect(await store.studioProjects.get(scratch.id)).toEqual(scratch);
  await expect(linkStudioSession(store, scratch.project.id, 'missing-story')).rejects.toThrow(/story/i);
  expect(await store.studioProjects.get(scratch.id)).toEqual(scratch);
});
