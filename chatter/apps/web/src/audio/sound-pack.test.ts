import { recoverSoundOperations, saveSoundProject, saveSoundVersion } from './sound-repository.js';
import { encodeTakeWav } from './take-audio.js';
import { describe, it, expect, vi, test } from 'vitest';
import JSZip from 'jszip';
import { MemoryStore, Gate, DEFAULT_GATE_CONFIG, makeSoundProject, emptySoundAttribution, runRetention } from '@chatter/shared';
import { exportSoundPack, importSoundPack } from './sound-pack.js';
const setup = () => { const store = new MemoryStore(); return { store, gate: new Gate(store, DEFAULT_GATE_CONFIG, { ready: false, classify: async () => 0 }) }; };
describe('sound packs', () => {
  it('round trips actual bytes, collections, editable snapshots and attribution through local Gate', async () => {
    const { store, gate } = setup(); const bytes = encodeTakeWav({ channels: [new Float32Array([0, .2, -.2, 0])], sampleRate: 8000, duration: .0005 });
    const asset = await gate.ingest({ bytes, source: 'generated', ownDevice: true, meta: { kind: 'AUDIO', origin: 'GENERATED', mime: 'audio/wav' } });
    const c = await store.soundCollections.create({ name: 'Signals' });
    await store.soundItems.create({ assetId: asset.assetId!, name: 'Signal', attribution: { ...emptySoundAttribution(), creator: 'Lee', license: 'CC0' }, tags: ['beep'], collectionIds: [c.id], favorite: true, archived: false, duration: 1, peaks: [] });
    const p = makeSoundProject('News cue'); p.credits = 'Lee: recording'; p.clips = [{ id: 'c', name: 'Signal', trackId: p.tracks[0]!.id, assetId: asset.assetId!, start: 0, sourceIn: 0, sourceOut: 1, rate: 1, repeats: 1, gainDb: 0, fadeIn: 0, fadeOut: 0 }]; await store.soundProjects.create(p);
    const packed = await exportSoundPack(store); const target = setup(); const result = await importSoundPack(target.store, target.gate, packed.blob);
    expect(result.itemCount).toBe(1); const item = (await target.store.soundItems.list())[0]!;
    expect(item.id).not.toBe((await store.soundItems.list())[0]!.id); expect(item.attribution.creator).toBe('Lee');
    const savedAsset = await target.store.assets.get(item.assetId); expect(savedAsset?.gateStatus).toBe('QUARANTINED');
    expect(await target.store.blobs.get(savedAsset!.sha256)).toEqual(bytes);
    const project = (await target.store.soundProjects.list())[0]!; expect(project.credits).toBe(p.credits); expect(project.clips[0]!.assetId).toBe(item.assetId);
    expect(item.collectionIds[0]).toBe((await target.store.soundCollections.list())[0]!.id);
    await importSoundPack(target.store, target.gate, packed.blob);
    expect(await target.store.soundItems.list()).toHaveLength(1); expect(await target.store.soundProjects.list()).toHaveLength(1);
  });
  it('resumes an interrupted pack commit without duplicate records', async () => {
    const source = setup(); const p = makeSoundProject('Silent editable cue'); await source.store.soundProjects.create(p);
    const pack = await exportSoundPack(source.store); const target = setup();
    const original = target.store.soundProjects.create.bind(target.store.soundProjects);
    const failure = vi.spyOn(target.store.soundProjects, 'create').mockRejectedValueOnce(new Error('quota'));
    await expect(importSoundPack(target.store, target.gate, pack.blob)).rejects.toThrow('quota');
    failure.mockImplementation(original);
    await importSoundPack(target.store, target.gate, pack.blob); await importSoundPack(target.store, target.gate, pack.blob);
    expect(await target.store.soundProjects.list()).toHaveLength(1);
    expect((await target.store.soundOperations.list())[0]?.state).toBe('COMMITTED');
  });
  it('refuses damaged bytes before writing any records', async () => {
    const { store, gate } = setup(); const asset = await gate.ingest({ bytes: new Uint8Array([1]), source: 'upload', meta: { kind: 'AUDIO', mime: 'audio/wav' } });
    await store.soundItems.create({ assetId: asset.assetId!, name: 'A', attribution: emptySoundAttribution(), tags: [], collectionIds: [], favorite: false, archived: false, duration: 1, peaks: [] });
    const packed = await exportSoundPack(store); const zip = await JSZip.loadAsync(await packed.blob.arrayBuffer()); zip.file('media/0.audio', new Uint8Array([2]));
    const target = setup(); await expect(importSoundPack(target.store, target.gate, await zip.generateAsync({ type: 'blob' }))).rejects.toThrow('damaged'); expect(await target.store.assets.list()).toHaveLength(0);
  });
});

test('nested historical render closure includes newly discovered project current sources', async () => {
 const store = new MemoryStore();
 async function asset(n: number) { const gate = new Gate(store, DEFAULT_GATE_CONFIG, {ready:false,classify:async()=>0}); const result=await gate.ingest({bytes:new Uint8Array([n]),source:'generated',ownDevice:true,meta:{kind:'AUDIO',origin:'GENERATED',mime:'audio/wav'}}); return (await store.assets.get(result.assetId!))!; }
 const x=await asset(1), y=await asset(2), b=await asset(3), c=await asset(4);
 function clip(project: import('@chatter/shared').SoundProject, assetId: string) { return {id:crypto.randomUUID(),name:'clip',trackId:project.tracks[0]!.id,assetId,start:0,sourceIn:0,sourceOut:1,rate:1,repeats:1,gainDb:0,fadeIn:0,fadeOut:0}; }
 let B=makeSoundProject('B'); B.clips=[clip(B,x.id)]; B=await store.soundProjects.save(B,0);
 await store.soundRevisions.create({projectId:B.id,assetId:b.id,snapshot:B,sourceAssetIds:[x.id],attribution:[],recipeHash:'rB',duration:1});
 B.clips.push(clip(B,y.id)); B=await store.soundProjects.save(B,1);
 let C=makeSoundProject('C'); C.clips=[clip(C,b.id),clip(C,x.id)]; C=await store.soundProjects.save(C,0);
 await store.soundRevisions.create({projectId:C.id,assetId:c.id,snapshot:C,sourceAssetIds:[b.id,x.id],attribution:[],recipeHash:'rC',duration:1});
 let A=makeSoundProject('A','story'); A.clips=[clip(A,c.id)]; await store.soundProjects.save(A,0);
 const packed=await exportSoundPack(store,'story'); const zip=await JSZip.loadAsync(await packed.blob.arrayBuffer()); const manifest=JSON.parse(await zip.file('soundpack.json')!.async('string'));
 expect(manifest.projects.some((p: {id:string})=>p.id===B.id)).toBe(true);
 expect(manifest.assets.some((a: {record:{id:string}})=>a.record.id===y.id)).toBe(true);
 const target = setup(); await expect(importSoundPack(target.store, target.gate, packed.blob)).resolves.toMatchObject({ projectCount: 3 });
});

test('retention cannot remove snapshot-only originals during staged pack recovery', async () => {
 const store=new MemoryStore();
 async function asset(n: number, expiresAt?: number) { const gate=new Gate(store,DEFAULT_GATE_CONFIG,{ready:false,classify:async()=>0}); const result=await gate.ingest({bytes:new Uint8Array([n]),source:'generated',ownDevice:true,meta:{kind:'AUDIO',origin:'GENERATED',mime:'audio/wav'}}); return store.assets.update(result.assetId!, { expiresAt }); }
 const source=await asset(50,1), output=await asset(51,undefined);
 const project=makeSoundProject('Current blank project');
 const snapshot=structuredClone(project); snapshot.clips=[{id:'clip',name:'old source',trackId:snapshot.tracks[0]!.id,assetId:source.id,start:0,sourceIn:0,sourceOut:1,rate:1,repeats:1,gainDb:0,fadeIn:0,fadeOut:0}];
 const revision={id:'saved-version',createdAt:1,updatedAt:1,projectId:project.id,assetId:output.id,snapshot,sourceAssetIds:[source.id],attribution:[],recipeHash:'old',duration:1};
 const item={id:'item',createdAt:1,updatedAt:1,assetId:output.id,name:'Version',attribution:emptySoundAttribution(),tags:[],collectionIds:[],favorite:false,archived:false,duration:1,peaks:[],projectId:project.id,revisionId:revision.id};
 await store.soundOperations.create({id:'pending-pack',state:'STAGED',imported:{projects:[project],revisions:[revision],items:[item],collections:[],maps:{projects:[],revisions:[],items:[],assets:[]}}});
 await runRetention(store,{now:2});
 await recoverSoundOperations(store);
 expect((await store.soundOperations.get('pending-pack'))!.state).toBe('COMMITTED');
 expect(await store.blobs.has(source.sha256)).toBe(true);
});
test('idempotent version retry rechecks revoked output approval', async () => {
 const store=new MemoryStore(); const gate=new Gate(store,DEFAULT_GATE_CONFIG,{ready:false,classify:async()=>0});
 const p=await saveSoundProject(store,makeSoundProject('Cue'),0); const render={bytes:new Uint8Array([88,89]),duration:.5,peaks:[.2],peak:.2};
 const item=await saveSoundVersion(store,gate,p,render);
 await store.assets.update(item.assetId,{gateStatus:'QUARANTINED'});
 await expect(saveSoundVersion(store,gate,p,render)).rejects.toThrow('review');
});
