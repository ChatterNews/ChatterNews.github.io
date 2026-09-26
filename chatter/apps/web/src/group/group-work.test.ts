import { describe, it, expect } from 'vitest';
import { MemoryStore, Gate, DEFAULT_GATE_CONFIG, prosePlainText, type Credit } from '@chatter/shared';
import { startGroup, joinGroup, makeGroupPiece, captureGroupRevision, collectGroupEntries, groupEntries, openGroupRevision, adoptGroupWriting } from './group-work.js';
import { exportPortableStory, importPortableStory } from '../portable/portable-project.js';
const doc = (text:string) => ({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
const gate = (store:MemoryStore) => new Gate(store, DEFAULT_GATE_CONFIG, {ready:true,async classify(){return 0;}});
async function desk(name:string) {const store=new MemoryStore();await store.open();const user=await store.users.create({name,penName:name,role:'STUDENT',active:true});return {store,user};}
describe('offline group work',()=>{
 it('collects four separate perspectives without changing main, and ignores repeat receipts',async()=>{
  const lead=await desk('Lead');const main=await lead.store.stories.create({title:'Lunch',ownerId:lead.user.id,body:doc('Main stays here')});const group=await startGroup(lead.store,main,lead.user);
  for(let n=0;n<4;n++){const child=await desk('Sam');const joined=await joinGroup(child.store,group.group!.code,child.user);expect((await joinGroup(child.store,group.group!.code,child.user)).id).toBe(joined.id);const piece=await makeGroupPiece(child.store,joined,child.user,`Perspective ${n}`);await child.store.stories.update(piece.id,{body:doc(`My view ${n}`)});await captureGroupRevision(child.store,piece.id);const entries=await groupEntries(child.store,group.group!.code);expect((await collectGroupEntries(lead.store,entries)).added).toBe(1);expect((await collectGroupEntries(lead.store,entries)).already).toBe(1);}
  expect((await lead.store.groupRevisions.list())).toHaveLength(4);expect(prosePlainText((await lead.store.stories.get(main.id))!.body)).toBe('Main stays here');
 });
 it('keeps previous main writing when explicitly adopting and carries all revisions in portable save',async()=>{
  const lead=await desk('Lead');const group=await startGroup(lead.store,await lead.store.stories.create({title:'Same name',ownerId:lead.user.id,body:doc('First main')}),lead.user);const piece=await makeGroupPiece(lead.store,group,lead.user,'Another view');await lead.store.stories.update(piece.id,{body:doc('Second view')});const received=await captureGroupRevision(lead.store,piece.id);await adoptGroupWriting(lead.store,group.id,received.id,lead.user);expect(prosePlainText((await lead.store.stories.get(group.id))!.body)).toBe('Second view');expect((await lead.store.groupRevisions.list()).some(r=>prosePlainText(r.body)==='First main')).toBe(true);
  const portable=await exportPortableStory(lead.store,(await lead.store.stories.get(group.id))!);const dest=await desk('Receiver');await importPortableStory(dest.store,gate(dest.store),new File([portable.blob],portable.fileName));expect((await dest.store.groupRevisions.list()).length).toBeGreaterThanOrEqual(3);
 });
 it('keeps unused attached bytes and opens a received project as a separate editable copy',async()=>{
  const a=await desk('A');const group=await startGroup(a.store,await a.store.stories.create({title:'Media',ownerId:a.user.id}),a.user);const piece=await makeGroupPiece(a.store,group,a.user,'Unused photo');const asset=await gate(a.store).ingest({source:'upload',bytes:new Uint8Array([1,2,3]),ownDevice:false,meta:{kind:'IMAGE',mime:'image/png',origin:'UPLOAD'}});await a.store.stories.update(piece.id,{attachedAssetIds:[asset.assetId!]});const rev=await captureGroupRevision(a.store,piece.id);const b=await desk('B');await collectGroupEntries(b.store,await groupEntries(a.store,group.group!.code));const copy=await openGroupRevision(b.store,gate(b.store),rev.id,b.user);expect(copy.attachedAssetIds).toHaveLength(1);expect(await b.store.blobs.get((await b.store.assets.get(copy.attachedAssetIds![0]!))!.sha256)).toEqual(new Uint8Array([1,2,3]));expect(copy.id).not.toBe(piece.id);
 });
 it('does not create another snapshot for unchanged work and rejects corrupt entry before storage',async()=>{
  const a=await desk('A');const group=await startGroup(a.store,await a.store.stories.create({title:'Stable',ownerId:a.user.id}),a.user);const one=await captureGroupRevision(a.store,group.id);expect((await captureGroupRevision(a.store,group.id)).id).toBe(one.id);const entries=await groupEntries(a.store,group.group!.code);entries[0]!.snapshot[0]=0;const b=await desk('B');await expect(collectGroupEntries(b.store,entries)).rejects.toThrow();expect(await b.store.groupRevisions.list()).toHaveLength(0);expect(await b.store.stories.list()).toHaveLength(0);
 });
});

describe('group safety',()=>{
 it('flushes before starting and guards completed stories',async()=>{
  const {registerSessionCheckpoint}=await import('../store/session-checkpoint.js');const a=await desk('A');const s=await a.store.stories.create({title:'Old'});const stop=registerSessionCheckpoint(a.store,async()=>{await a.store.stories.update(s.id,{title:'Fresh'});});
  const g=await startGroup(a.store,s,a.user);expect(g.title).toBe('Fresh');stop();const rev=await captureGroupRevision(a.store,g.id);await a.store.stories.update(g.id,{status:'DONE'});
  await expect(adoptGroupWriting(a.store,g.id,rev.id,a.user)).rejects.toThrow(/completed|published|finished/i);
  await expect(startGroup(a.store,(await a.store.stories.get(g.id))!,a.user)).rejects.toThrow(/completed|published|finished/i);
 });
 it('rejects forged root and author metadata before creating stories',async()=>{
  const a=await desk('A');const g=await startGroup(a.store,await a.store.stories.create({title:'Original'}),a.user);await captureGroupRevision(a.store,g.id);const entries=await groupEntries(a.store,g.group!.code);const b=await desk('B');
  for(const patch of [{rootId:'forged'},{authorId:'forged'}])await expect(collectGroupEntries(b.store,[{...entries[0]!,record:{...entries[0]!.record,...patch}}])).rejects.toThrow();
  expect(await b.store.groupRevisions.list()).toEqual([]);const forged={...entries[0]!.record,authorName:'Impostor'};await b.store.blobs.put(entries[0]!.snapshot);await b.store.groupRevisions.create(forged);
  await expect(openGroupRevision(b.store,gate(b.store),forged.id,b.user)).rejects.toThrow();expect(await b.store.stories.list()).toEqual([]);
 });
 it('serializes overlapping collections into one receipt and one duplicate',async()=>{
  const a=await desk('A');const g=await startGroup(a.store,await a.store.stories.create({title:'Original'}),a.user);await captureGroupRevision(a.store,g.id);const entries=await groupEntries(a.store,g.group!.code);const b=await desk('B');
  const results=await Promise.all([collectGroupEntries(b.store,entries),collectGroupEntries(b.store,entries)]);expect(results.map(r=>r.added).sort()).toEqual([0,1]);expect(await b.store.groupRevisions.list()).toHaveLength(1);
 });
 it('keeps main ancestry separate from adopted piece provenance',async()=>{
  const a=await desk('A');const main=await startGroup(a.store,await a.store.stories.create({title:'Main',body:doc('Before')}),a.user);const before=await captureGroupRevision(a.store,main.id);const piece=await makeGroupPiece(a.store,main,a.user);await a.store.stories.update(piece.id,{body:doc('Piece')});const source=await captureGroupRevision(a.store,piece.id);
  await adoptGroupWriting(a.store,main.id,source.id,a.user);const after=await captureGroupRevision(a.store,main.id);expect(after.parentRevisionId).toBe(before.id);expect((await a.store.stories.get(main.id))!.group!.usedRevisionIds).toContain(source.id);
 });
 it('attaches collected source bytes and credits without unrelated media',async()=>{
  const {attachGroupMedia}=await import('./group-work.js');const a=await desk('A');const g=await startGroup(a.store,await a.store.stories.create({title:'Media'}),a.user);const p=await makeGroupPiece(a.store,g,a.user);
  const photo=await gate(a.store).ingest({source:'upload',bytes:new Uint8Array([1,2,3]),ownDevice:false,meta:{kind:'IMAGE',mime:'image/png',origin:'UPLOAD'}});await a.store.stories.update(p.id,{attachedAssetIds:[photo.assetId!]});await a.store.credits.create({storyId:p.id,assetId:photo.assetId!,usedIn:'Photographed by Maya'});const audio=await gate(a.store).ingest({source:'upload',bytes:new Uint8Array([4,5,6]),ownDevice:false,meta:{kind:'AUDIO',mime:'audio/wav',origin:'UPLOAD'}});await a.store.takes.create({storyId:p.id,userId:a.user.id,assetId:audio.assetId!,durationSec:1});const rev=await captureGroupRevision(a.store,p.id);
  const b=await desk('B');const target=await joinGroup(b.store,g.group!.code,b.user);await collectGroupEntries(b.store,await groupEntries(a.store,g.group!.code));const unrelated=await gate(b.store).ingest({source:'upload',bytes:new Uint8Array([8,9]),ownDevice:false,meta:{kind:'IMAGE',mime:'image/png',origin:'UPLOAD'}});
  const updated=await attachGroupMedia(b.store,gate(b.store),rev.id,target.id,b.user);expect(updated.attachedAssetIds).toHaveLength(2);expect(updated.attachedAssetIds).not.toContain(unrelated.assetId);expect((await b.store.credits.list()).filter((c:Credit)=>c.storyId===target.id)).toEqual(expect.arrayContaining([expect.objectContaining({usedIn:expect.stringContaining('Photographed by Maya')})]));expect(updated.group!.usedRevisionIds).toContain(rev.id);expect(await b.store.groupRevisions.get(rev.id)).toEqual(rev);
 });
});

it('keeps unowned adoption adviser-only and claims the new owner',async()=>{
 const a=await desk('Author');const source=await startGroup(a.store,await a.store.stories.create({title:'Source'}),a.user);const rev=await captureGroupRevision(a.store,source.id);const b=await desk('Student');const inbox=await joinGroup(b.store,source.group!.code,b.user);await b.store.stories.update(inbox.id,{ownerId:undefined});await collectGroupEntries(b.store,await groupEntries(a.store,source.group!.code));
 await expect(adoptGroupWriting(b.store,inbox.id,rev.id,b.user)).rejects.toThrow(/lead|adviser/i);
 const adviser=await b.store.users.create({name:'Teacher',penName:'Teacher',role:'ADVISER',active:true});expect((await adoptGroupWriting(b.store,inbox.id,rev.id,adviser)).ownerId).toBe(adviser.id);
 await expect(adoptGroupWriting(b.store,inbox.id,rev.id,b.user)).rejects.toThrow(/lead|adviser/i);
});
it('rejects a distinct root using the code of a local unsaved main draft',async()=>{
 const a=await desk('A');const local=await startGroup(a.store,await a.store.stories.create({title:'Local'}),a.user);const b=await desk('B');const other=await startGroup(b.store,await b.store.stories.create({title:'Other'}),b.user);await b.store.stories.update(other.id,{group:{...other.group!,code:local.group!.code}});await captureGroupRevision(b.store,other.id);
 await expect(collectGroupEntries(a.store,await groupEntries(b.store,local.group!.code))).rejects.toThrow(/code/i);expect(await a.store.groupRevisions.list()).toEqual([]);
});
it('validates joined wrappers only when explicitly requested',async()=>{
 const {inspectGroupSnapshot}=await import('./group-work.js');const a=await desk('A');const main=await startGroup(a.store,await a.store.stories.create({title:'Group'}),a.user);const b=await desk('B');const joined=await joinGroup(b.store,main.group!.code,b.user);
 const packed=await exportPortableStory(b.store,joined,{omitGroupHistory:true});const bytes=new Uint8Array(await packed.blob.arrayBuffer());await expect(inspectGroupSnapshot(bytes)).rejects.toThrow(/identity/i);expect((await inspectGroupSnapshot(bytes,{allowJoined:true})).project.story.group!.kind).toBe('joined');await expect(captureGroupRevision(b.store,joined.id)).rejects.toThrow();
});
it('rejects missing or malformed editable sound before recording a contribution',async()=>{
 const JSZip=(await import('jszip')).default;const {inspectGroupSnapshot}=await import('./group-work.js');const a=await desk('A');const group=await startGroup(a.store,await a.store.stories.create({title:'Sound'}),a.user);const packed=await exportPortableStory(a.store,group,{omitGroupHistory:true});const zip=await JSZip.loadAsync(await packed.blob.arrayBuffer());const manifest=JSON.parse(await zip.file('story.chatter.json')!.async('string'));
 manifest.showtimeProjects=[{titles:[],clips:[{soundProjectId:'missing'}]}];zip.file('story.chatter.json',JSON.stringify(manifest));await expect(inspectGroupSnapshot(await zip.generateAsync({type:'uint8array'}))).rejects.toThrow(/sound/i);
 manifest.showtimeProjects=[];manifest.soundPack='sounds.soundpack';const sounds=new JSZip();sounds.file('soundpack.json',JSON.stringify({format:'orbit-soundpack',version:1,assets:[]}));zip.file('sounds.soundpack',await sounds.generateAsync({type:'uint8array'}));zip.file('story.chatter.json',JSON.stringify(manifest));await expect(inspectGroupSnapshot(await zip.generateAsync({type:'uint8array'}))).rejects.toThrow(/sound/i);
});
it('makes collected rendered media selectable through Gate with source credits',async()=>{
 const {attachGroupMedia}=await import('./group-work.js');const a=await desk('A');const group=await startGroup(a.store,await a.store.stories.create({title:'Rendered'}),a.user);const piece=await makeGroupPiece(a.store,group,a.user);const bytes=new Uint8Array([9,8,7]);const hash=await a.store.blobs.put(bytes);await a.store.deliverables.create({storyId:piece.id,title:'Final video',fileName:'final.webm',kind:'VIDEO',room:'SHOWTIME',stage:'FINAL',mime:'video/webm',bytes:bytes.length,blobHash:hash});const rev=await captureGroupRevision(a.store,piece.id);
 const b=await desk('B');const target=await joinGroup(b.store,group.group!.code,b.user);await collectGroupEntries(b.store,await groupEntries(a.store,group.group!.code));const updated=await attachGroupMedia(b.store,gate(b.store),rev.id,target.id,b.user);expect(updated.attachedAssetIds).toHaveLength(1);const asset=await b.store.assets.get(updated.attachedAssetIds![0]!);expect(asset).toMatchObject({kind:'VIDEO',mime:'video/webm'});expect(await b.store.blobs.get(asset!.sha256)).toEqual(bytes);expect((await b.store.credits.list()).filter((c:Credit)=>c.storyId===target.id).some((c:Credit)=>c.usedIn.includes(rev.id)&&c.usedIn.includes('Final video'))).toBe(true);
});
it('copies writing without loading foreign image URLs and preserves the immutable source',async()=>{
 const a=await desk('A');const main=await startGroup(a.store,await a.store.stories.create({title:'Main'}),a.user);const piece=await makeGroupPiece(a.store,main,a.user);const body={type:'doc',content:[...doc('Safe words').content,{type:'image',attrs:{src:'https://foreign.example/track.png'}}]};await a.store.stories.update(piece.id,{body});const rev=await captureGroupRevision(a.store,piece.id);
 const adopted=await adoptGroupWriting(a.store,main.id,rev.id,a.user);expect(JSON.stringify(adopted.body)).not.toContain('foreign.example');expect(prosePlainText(adopted.body)).toBe('Safe words');const copy=await openGroupRevision(a.store,gate(a.store),rev.id,a.user);expect(JSON.stringify(copy.body)).not.toContain('foreign.example');expect((await a.store.groupRevisions.get(rev.id))!.body).toEqual(body);
});
