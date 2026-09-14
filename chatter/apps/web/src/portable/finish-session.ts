import { flushStudioSaves, type Store } from '@chatter/shared';
import { flushSessionCheckpoints } from '../store/session-checkpoint.js';
import { flushPodcastSaves } from '../rooms/podcast-workspace.js';
import { exportPortableStory } from './portable-project.js';

export interface StoryFileHandle {
  createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  getFile(): Promise<{ size: number; slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> } }>;
}
export interface SessionDirectory {
  name: string;
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<SessionDirectory>;
  getFileHandle(name: string, options: { create: boolean }): Promise<StoryFileHandle>;
}

export async function writeVerifiedFile(handle: StoryFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  try { await writable.write(blob); await writable.close(); }
  catch (error) { await writable.abort?.().catch(() => undefined); throw error; }
  const saved = await handle.getFile();
  if (saved.size !== blob.size) throw new Error('The saved file is incomplete. Keep Orbit open and retry.');
  // Compare in chunks so a large video does not require two extra whole-file buffers.
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    const end = offset + 1024 * 1024;
    const expected = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
    const actual = new Uint8Array(await saved.slice(offset, end).arrayBuffer());
    if (expected.some((byte, index) => byte !== actual[index])) throw new Error('The saved file did not match. Keep Orbit open and retry.');
  }
}

async function checkStoryLinks(store: Store, ids: Set<string>): Promise<void> {
  const single = await Promise.all([store.blasts.list(), store.motionPackages.list(), store.showtimeProjects.list(), store.studioProjects.list(), store.deliverables.list(), store.samplerPresets.list()]);
  const loose = single.flat().filter((item) => !item.storyId || !ids.has(item.storyId));
  const podcasts = (await store.podcastProjects.list()).filter((item) => !item.storyIds.some((id) => ids.has(id)));
  if (loose.length || podcasts.length) {
    const names = [...loose.map((item) => 'title' in item ? item.title : 'name' in item ? item.name : 'Studio project'), ...podcasts.map((item) => item.title)];
    throw new Error(`Link these projects or outputs to a story before finishing: ${names.join(', ')}. They would otherwise stay on this computer.`);
  }
}

export async function finishSession(store: Store, destination: SessionDirectory, onProgress: (text: string) => void = () => {}) {
  onProgress('Saving open edits…');
  await flushSessionCheckpoints(store);
  await flushStudioSaves(store);
  await flushPodcastSaves(store);
  const stories = await store.stories.list();
  if (!stories.length) throw new Error('Create a story in Slate before finishing a session.');
  await checkStoryLinks(store, new Set(stories.map((story) => story.id)));
  const folderName = `Orbit-session-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  // Every attempt gets its own folder; a failed attempt cannot overwrite a previous handoff.
  const folder = await destination.getDirectoryHandle(folderName, { create: true });
  const files: { title: string; file: string; bytes: number }[] = [];
  for (const [index, story] of stories.entries()) {
    onProgress(`Packing and verifying ${index + 1} of ${stories.length}: ${story.title}`);
    const packed = await exportPortableStory(store, story);
    const file = `${index + 1}-${packed.fileName}`;
    await writeVerifiedFile(await folder.getFileHandle(file, { create: true }), packed.blob);
    files.push({ title: story.title, file, bytes: packed.blob.size });
  }
  const receipt = new Blob([JSON.stringify({ format: 'orbit-session-receipt', version: 1, completedAt: new Date().toISOString(), files }, null, 2)], { type: 'application/json' });
  await writeVerifiedFile(await folder.getFileHandle('SESSION-COMPLETE.json', { create: true }), receipt);
  return { folderName, files };
}
