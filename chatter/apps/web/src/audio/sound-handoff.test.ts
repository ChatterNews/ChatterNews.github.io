import { describe, expect, test } from 'vitest';
import { MemoryStore, makeSoundProject, createShowtimeProject, normalizeShowtimeProject, makeShowtimeClip, createPodcastProject, createPodcastShow, emptySoundAttribution, type SoundProject } from '@chatter/shared';
import { appendSoundCredits, linkSoundUsage, makeSoundRequest, placePodcastSound, placeShowtimeSound, readSoundRequest, resolveSound, soundConsumerReturnTo, soundCreditsBlock, soundDestinationFingerprint, soundEditUrl, soundReturnUrl, validateSoundLineage } from './sound-handoff.js';

async function setup() {
  const store = new MemoryStore();
  const sourceHash = await store.blobs.put(new Uint8Array([1, 2, 3]));
  const source = await store.assets.unsafeCreate({ kind: 'AUDIO', origin: 'UPLOAD', mime: 'audio/wav', bytes: 3, sha256: sourceHash, path: sourceHash, gateStatus: 'APPROVED', creator: 'Source artist' });
  const renderHash = await store.blobs.put(new Uint8Array([4, 5, 6]));
  const asset = await store.assets.unsafeCreate({ kind: 'AUDIO', origin: 'GENERATED', mime: 'audio/wav', bytes: 3, sha256: renderHash, path: renderHash, gateStatus: 'APPROVED' });
  const snapshot: SoundProject = { ...makeSoundProject('Keys outro'), id: 'sound-project', revision: 1, credits: 'Sam — sound design' };
  const attribution = { ...emptySoundAttribution(), creator: 'Original artist', license: 'CC BY 4.0', sourceUrl: 'https://example.com/source' };
  const revision = await store.soundRevisions.create({ projectId: snapshot.id, assetId: asset.id, snapshot, sourceAssetIds: [source.id], attribution: [attribution], recipeHash: 'recipe:1', duration: 5 });
  const item = await store.soundItems.create({ assetId: asset.id, name: snapshot.name, attribution, tags: ['outro'], collectionIds: [], favorite: false, archived: false, duration: 5, peaks: [], revisionId: revision.id, projectId: snapshot.id });
  return { store, source, asset, item, revision, sound: { item, asset, revision } };
}

describe('Foley version handoff', () => {
  test('places once on the selected Stinger audio track and preserves authored credits', async () => {
    const { sound } = await setup(); const project = createShowtimeProject(); project.credits = 'Lee — camera';
    const request = makeSoundRequest(project, 'a3', 7.25);
    const placed = placeShowtimeSound(project, sound, request);
    expect(placed.clips).toHaveLength(1); expect(placed.clips[0]).toMatchObject({ assetId: sound.asset.id, trackId: 'a3', startSec: 7.25, soundRevisionId: sound.revision.id });
    expect(placed.credits).toBe('Lee — camera'); expect(project.clips).toHaveLength(0);
    expect(placeShowtimeSound(placed, sound, request)).toBe(placed);
  });
  test('detects changed destination content but permits save timestamps', async () => {
    const { sound } = await setup(); const project = createShowtimeProject(); const request = makeSoundRequest(project, 'a3', 1);
    expect(soundDestinationFingerprint({ ...project, updatedAt: 999 })).toBe(request.destinationFingerprint);
    expect(() => placeShowtimeSound({ ...project, title: 'Other edit' }, sound, request)).toThrow('edit changed');
    expect(() => placeShowtimeSound({ ...project, id: 'other' }, sound, request)).toThrow('destination project changed');
    expect(() => placeShowtimeSound(project, sound, { ...request, trackId: 'v1' })).toThrow('audio track');
    project.tracks!.find(track => track.id === 'a3')!.locked = true;
    expect(() => placeShowtimeSound(project, sound, makeSoundRequest(project, 'a3', 1))).toThrow('audio track');
  });
  test('accepts legacy video projects after ordinary editor normalization', async () => {
    const { sound } = await setup(); const project = createShowtimeProject(); delete project.tracks; project.clips.push(makeShowtimeClip({ assetId: 'old-video', name: 'Old video', durationSec: 10 })); delete project.clips[0]!.startSec;
    const displayed = normalizeShowtimeProject(project);
    expect(soundDestinationFingerprint(displayed)).toBe(soundDestinationFingerprint(project));
    expect(placeShowtimeSound(project, sound, makeSoundRequest(displayed, 'a3', 2)).clips).toHaveLength(2);
  });
  test('pins the podcast revision and explicitly replaces only this use with compatible trim', async () => {
    const { sound } = await setup(); const project = createPodcastProject(createPodcastShow()); const track = project.tracks.find(track => track.kind === 'SFX')!;
    const placed = placePodcastSound(project, sound, makeSoundRequest(project, track.id, 8));
    const clip = placed.clips[0]!; clip.trimInSec = 1; clip.trimOutSec = 4; clip.fadeInSec = .2;
    const newer = { ...sound, item: { ...sound.item, revisionId: 'v2', duration: 3 }, revision: { ...sound.revision, id: 'v2' } };
    expect(placed.clips[0]?.soundRevisionId).toBe(sound.revision.id);
    const request = makeSoundRequest(placed, track.id, 99, clip.id);
    expect(() => placePodcastSound(placed, newer, request)).toThrow('Confirm shortening');
    const replaced = placePodcastSound(placed, newer, request, true);
    expect(replaced.clips[0]).toMatchObject({ id: clip.id, startSec: 8, trimInSec: 1, trimOutSec: 3, fadeInSec: .2, soundRevisionId: 'v2' });
    expect(placed.clips[0]?.trimOutSec).toBe(4);
    expect(placePodcastSound(replaced, newer, request, true)).toBe(replaced);
  });
  test('rechecks actual rendered and parent approval, missing bytes and pinned identity', async () => {
    const { store, source, asset, item } = await setup();
    await expect(resolveSound(store, item.id)).resolves.toMatchObject({ item: { id: item.id } });
    await store.assets.update(source.id, { gateStatus: 'QUARANTINED' });
    await expect(resolveSound(store, item.id)).rejects.toThrow('approval');
    await expect(validateSoundLineage(store, [{ assetId: asset.id }])).rejects.toThrow('approval');
    await store.assets.update(source.id, { gateStatus: 'APPROVED' });
    await expect(validateSoundLineage(store, [{ assetId: asset.id, soundRevisionId: item.revisionId, soundProjectId: 'wrong' }])).rejects.toThrow('frozen source');
    await store.blobs.remove(source.sha256); await expect(resolveSound(store, item.id)).rejects.toThrow('missing or damaged');
  });
  test('retains frozen source/member attribution when current library metadata changes', async () => {
    const { store, sound } = await setup(); const project = createShowtimeProject(); project.storyId = 'story';
    const placed = placeShowtimeSound(project, sound, makeSoundRequest(project, 'a3', 0));
    await store.soundItems.update(sound.item.id, { attribution: emptySoundAttribution(), name: 'Renamed library item' });
    const block = await soundCreditsBlock(store, placed);
    expect(block).toContain('Sam — sound design'); expect(block).toContain('Original artist'); expect(block).toContain('CC BY 4.0'); expect(block).toContain('Keys outro');
    expect(appendSoundCredits('Lee — camera\n', block)).toBe(`Lee — camera\n\n\n${block}`);
    expect(appendSoundCredits(block, block)).toBe(block);
    await linkSoundUsage(store, sound, project); await linkSoundUsage(store, sound, project);
    expect(await store.credits.list()).toHaveLength(2);
    await linkSoundUsage(store, sound, { ...project, id: 'another-project', storyId: 'another-story' });
    expect(await store.credits.list()).toHaveLength(4);
  });
  test('uses a safe exact-project return URL and opens the frozen arrangement', () => {
    const project = createShowtimeProject(); const request = makeSoundRequest(project, 'a3', 9);
    const returnTo = soundConsumerReturnTo('STINGER', request); const url = soundReturnUrl(returnTo, 'saved-item');
    const parsed = new URL(url, 'https://orbit.invalid');
    expect(parsed.pathname).toBe('/stinger'); expect(parsed.searchParams.get('project')).toBe(project.id); expect(readSoundRequest(parsed.searchParams.get('soundRequest'))).toEqual(request);
    expect(parsed.searchParams.get('soundItem')).toBe('saved-item');
    expect(new URL(soundEditUrl(returnTo, { soundProjectId: 'source-project', soundRevisionId: 'v1' }), 'https://orbit.invalid').searchParams.get('revision')).toBe('v1');
    expect(() => soundReturnUrl('https://evil.example/stinger', 'item')).toThrow();
    expect(() => soundReturnUrl(returnTo.replace(project.id, 'other'), 'item')).toThrow();
    expect(readSoundRequest('{"at":null}')).toBeUndefined();
  });
  test('ordinary existing audio clips without sound metadata continue unchanged', async () => {
    const { store } = await setup(); await expect(validateSoundLineage(store, [{ assetId: 'legacy-source' }])).resolves.toBeUndefined();
  });
});
