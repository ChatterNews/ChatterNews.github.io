/** @vitest-environment jsdom */
import { describe, expect, test } from 'vitest';
import JSZip from 'jszip';
import { addAudioClip, addTrack, DEFAULT_GATE_CONFIG, emptyProject, Gate, MemoryStore, type Release, type Store } from '@chatter/shared';
import { element } from '../rooms/blast-model.js';
import { exportPortableStory, importPortableStory, type PortableStoryProject } from './portable-project.js';

const classifier = { ready: true, async classify() { return 0; } };
const gateFor = (store: Store) => new Gate(store, DEFAULT_GATE_CONFIG, classifier);

async function newsroomWithStory() {
  const store = new MemoryStore('computer-one');
  await store.open();
  const kid = await store.users.create({ name: 'Maya Rivera', penName: 'Maya R.', role: 'STUDENT', active: true });
  const story = await store.stories.create({
    title: 'Gym floor',
    status: 'WORK',
    ownerId: kid.id,
    bylineIds: [kid.id],
    channels: ['pod'],
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The gym floor reopens Friday.' }] }] },
  });
  return { store, kid, story };
}

async function tamper(blob: Blob, edit: (project: PortableStoryProject) => void): Promise<File> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const project = JSON.parse(await zip.file('story.chatter.json')!.async('string')) as PortableStoryProject;
  edit(project);
  zip.file('story.chatter.json', JSON.stringify(project));
  return new File([await zip.generateAsync({ type: 'blob' })], 'tampered.chatter');
}

async function exportedStudioStory() {
  const context = await newsroomWithStory();
  const result = await gateFor(context.store).ingest({ source: 'recording', ownDevice: true, bytes: new Uint8Array([3, 1]), meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'RECORDING', storyId: context.story.id } });
  let song = addTrack(emptyProject('Theme'), 'Voice', 'runtime-track');
  song = addAudioClip(song, song.tracks[0]!.id, { engineId: 'runtime-clip', name: 'Lead', source: 'RECORDING', sourceAssetId: result.assetId!, startSec: 0, sourceDurationSec: 2 });
  await context.store.studioProjects.create({ storyId: context.story.id, project: song });
  return { ...context, assetId: result.assetId!, exported: await exportPortableStory(context.store, context.story) };
}

async function expectEmptyImport(receiving: MemoryStore) {
  expect(await receiving.stories.list()).toHaveLength(0);
  expect(await receiving.users.list()).toHaveLength(0);
  expect(await receiving.assets.list()).toHaveLength(0);
  expect(await receiving.studioProjects.list()).toHaveLength(0);
}

describe('portable story trust boundary', () => {
  test('rejects hostile nested Studio numbers and control keys before writing records', async () => {
    const { exported } = await exportedStudioStory();
    const file = await tamper(exported.blob, (project) => {
      const track = project.studioProjects![0]!.project.tracks[0]!;
      track.instrumentControls = { tone: 0.5, character: 0.5, attack: 0, release: 0.3, motion: 0, width: 0.5, arbitrary: 1 } as typeof track.instrumentControls;
      track.clips[0]!.sourceDurationSec = 1e300;
    });
    const receiving = new MemoryStore('hostile-studio'); await receiving.open();
    await expect(importPortableStory(receiving, gateFor(receiving), file)).rejects.toThrow(/unsupported|damaged/);
    await expectEmptyImport(receiving);
  });

  test('rejects partial Studio instrument controls before writing records', async () => {
    const { exported } = await exportedStudioStory();
    const file = await tamper(exported.blob, (project) => {
      project.studioProjects![0]!.project.tracks[0]!.instrumentControls = { tone: 0.5, character: 0.5, attack: 0, release: 0.3, motion: 0 } as never;
    });
    const receiving = new MemoryStore('partial-studio-controls'); await receiving.open();
    await expect(importPortableStory(receiving, gateFor(receiving), file)).rejects.toThrow(/unsupported|damaged/);
    await expectEmptyImport(receiving);
  });

  test('rejects a Studio source omitted from the package before writing records', async () => {
    const { exported } = await exportedStudioStory();
    const file = await tamper(exported.blob, (project) => { project.studioProjects![0]!.project.tracks[0]!.clips[0]!.sourceAssetId = 'not-packaged'; });
    const receiving = new MemoryStore('missing-studio-source'); await receiving.open();
    await expect(importPortableStory(receiving, gateFor(receiving), file)).rejects.toThrow(/missing a Studio source asset/);
    await expectEmptyImport(receiving);
  });
  test('a file cannot grant a local permission release', async () => {
    const { store, kid, story } = await newsroomWithStory();
    const exported = await exportPortableStory(store, story);
    const file = await tamper(exported.blob, (project) => {
      project.releases = [{ id: 'r1', userId: kid.id, status: 'ON_FILE', createdAt: 1, updatedAt: 1 } as Release];
    });
    const receiving = new MemoryStore('computer-two');
    await receiving.open();

    await importPortableStory(receiving, gateFor(receiving), file);

    expect(await receiving.releases.list()).toHaveLength(0);
    expect((await receiving.events.all()).some((event) => event.action === 'portable.release.ignored')).toBe(true);
  });

  test('a refusal travels and overrides a local yes', async () => {
    const { store, kid, story } = await newsroomWithStory();
    const exported = await exportPortableStory(store, story);
    const file = await tamper(exported.blob, (project) => {
      project.releases = [{ id: 'r1', userId: kid.id, status: 'REFUSED', createdAt: 1, updatedAt: 1 } as Release];
    });
    const receiving = new MemoryStore('computer-two');
    await receiving.open();
    const localKid = await receiving.users.create({ name: 'Maya Rivera', penName: 'Maya R.', role: 'STUDENT', active: true });
    await receiving.releases.create({ userId: localKid.id, status: 'ON_FILE' });

    await importPortableStory(receiving, gateFor(receiving), file);

    expect((await receiving.releases.list())[0]!.status).toBe('REFUSED');
  });

  test('media claiming to be a recording is quarantined on the receiving computer', async () => {
    const { store, story } = await newsroomWithStory();
    const result = await gateFor(store).ingest({
      source: 'recording', bytes: new Uint8Array([1, 2, 3, 4]), ownDevice: true,
      meta: { kind: 'AUDIO', mime: 'audio/webm', origin: 'RECORDING', storyId: story.id },
    });
    await store.credits.create({ assetId: result.assetId!, storyId: story.id, usedIn: 'story' });
    const exported = await exportPortableStory(store, story);
    const receiving = new MemoryStore('computer-two');
    await receiving.open();

    await importPortableStory(receiving, gateFor(receiving), new File([exported.blob], exported.fileName));

    expect((await receiving.assets.list())[0]!.gateStatus).toBe('QUARANTINED');
  });

  test('imported Blast rich text is sanitized before persistence', async () => {
    const { store, kid, story } = await newsroomWithStory();
    await store.blasts.create({
      title: 'Gym front page', authorId: kid.id, storyId: story.id, format: 'LETTER_PORTRAIT', width: 816, height: 1056,
      pages: [{ id: 'page-one', name: 'Front', background: '#fff', elements: [element({ kind: 'TEXT', x: 10, y: 10, width: 300, height: 100 })] }],
    });
    const exported = await exportPortableStory(store, story);
    const file = await tamper(exported.blob, (project) => {
      project.blasts![0]!.pages[0]!.elements[0]!.richText = '<p><img src=x onerror="alert(1)"></p>';
    });
    const receiving = new MemoryStore('computer-two');
    await receiving.open();

    await importPortableStory(receiving, gateFor(receiving), file);

    expect((await receiving.blasts.list())[0]!.pages[0]!.elements[0]!.richText).not.toMatch(/onerror|<img/i);
  });
});
