// @vitest-environment jsdom
import {describe,expect,it} from 'vitest';
import {MemoryStore,Gate,DEFAULT_GATE_CONFIG,type Credit} from '@chatter/shared';
import {listStoryPictures,pickStoryPicture} from './picture-assets.js';
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
async function setup(){const store=new MemoryStore();await store.open();const story=await store.stories.create({title:'Pictures'});const gate=new Gate(store,DEFAULT_GATE_CONFIG,{ready:true,async classify(){return 0;}});return {store,story,gate};}
describe('collected story pictures',()=>{
 it('lists only approved supported story pictures and embeds durable bytes with attribution',async()=>{
  const {store,story,gate}=await setup();const asset=await gate.ingest({source:'upload',bytes:png,ownDevice:false,meta:{kind:'IMAGE',mime:'image/png',origin:'UPLOAD',creator:'Maya',license:'CC BY 4.0'}});await store.stories.update(story.id,{attachedAssetIds:[asset.assetId!]});
  const unrelated=await gate.ingest({source:'upload',bytes:new Uint8Array([...png,1]),ownDevice:false,meta:{kind:'IMAGE',mime:'image/png',origin:'UPLOAD'}});
  expect((await listStoryPictures(store,story.id)).map(p=>p.id)).toEqual([asset.assetId]);const chosen=await pickStoryPicture(store,story.id,asset.assetId!);expect(chosen.src).toMatch(/^data:image\/png;base64,/);expect(chosen.credit).toContain('Maya');expect(chosen.credit).toContain('CC BY 4.0');expect((await store.credits.list()).filter((c:Credit)=>c.storyId===story.id)).toHaveLength(1);
  await pickStoryPicture(store,story.id,asset.assetId!);expect((await store.credits.list()).filter((c:Credit)=>c.storyId===story.id)).toHaveLength(1);await expect(pickStoryPicture(store,story.id,unrelated.assetId!)).rejects.toThrow();
 });
 it('uses credited photos but rechecks changed approval, missing bytes and raster content when selected',async()=>{
  const {store,story,gate}=await setup();const result=await gate.ingest({source:'upload',bytes:png,ownDevice:false,meta:{kind:'IMAGE',mime:'image/png',origin:'UPLOAD'}});const id=result.assetId!;await store.credits.create({assetId:id,storyId:story.id,usedIn:'Lunchroom.jpg'});expect((await listStoryPictures(store,story.id))[0]?.label).toContain('Lunchroom.jpg');await store.assets.update(id,{gateStatus:'QUARANTINED'});expect(await listStoryPictures(store,story.id)).toEqual([]);await expect(pickStoryPicture(store,story.id,id)).rejects.toThrow(/approved/i);await store.assets.update(id,{gateStatus:'APPROVED'});const asset=(await store.assets.get(id))!;await store.blobs.remove(asset.sha256);await expect(pickStoryPicture(store,story.id,id)).rejects.toThrow(/missing/i);
  const svg=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');const forged=await gate.ingest({source:'upload',bytes:svg,ownDevice:false,meta:{kind:'IMAGE',mime:'image/png',origin:'UPLOAD'}});await store.stories.update(story.id,{attachedAssetIds:[forged.assetId!]});await expect(pickStoryPicture(store,story.id,forged.assetId!)).rejects.toThrow(/PNG|image/i);await store.assets.update(forged.assetId!,{mime:'image/svg+xml'});expect(await listStoryPictures(store,story.id)).toEqual([expect.objectContaining({id})]);
 });
});
