import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { MemoryStore } from '@chatter/shared';
import { registerSessionCheckpoint } from '../store/session-checkpoint.js';
import { selectWebsiteRelease, saveBeforeWebsiteUpdate, websiteRelease } from './website-update.js';
const id='11111111-1111-4111-8111-111111111111';
function storage(values: Record<string,string>={}) { const entries=new Map(Object.entries(values));return {getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value)}; }
beforeEach(()=>vi.stubEnv('VITE_ORBIT_WEB','true'));
afterEach(()=>vi.unstubAllEnvs());
test('updating changes only this tab’s release reference, preserving the device and saved work',()=>{
 const local=storage({'orbit-web-workspace-id':id,[`orbit:${id}:draft`]:'Student words'});const session=storage({'orbit-reader-current':JSON.stringify({workspaceId:id,releaseId:'web-old'})});
 selectWebsiteRelease('web-new',local,session);
 expect(JSON.parse(session.getItem('orbit-reader-current')!)).toEqual({workspaceId:id,releaseId:'web-new'});
 expect(local.getItem('orbit-web-workspace-id')).toBe(id);expect(local.getItem(`orbit:${id}:draft`)).toBe('Student words');
 expect(websiteRelease('/r/web-new/')).toBe('web-new');
});
test('invalid identity or release cannot create a replacement empty desk',()=>{
 const local=storage({'orbit-web-workspace-id':'broken'});const session=storage();
 expect(()=>selectWebsiteRelease('web-new',local,session)).toThrow(/homepage/);expect(session.getItem('orbit-reader-current')).toBeNull();
 expect(()=>selectWebsiteRelease('../bad',storage({'orbit-web-workspace-id':id}),session)).toThrow();
});
test('save and update waits for real editor checkpoints before navigating',async()=>{
 const store=new MemoryStore();const story=await store.stories.create({title:'Before'});const navigate=vi.fn();
 registerSessionCheckpoint(store,async()=>{await store.stories.update(story.id,{title:'Saved words'});});
 await saveBeforeWebsiteUpdate(store,navigate);
 expect((await store.stories.get(story.id))?.title).toBe('Saved words');expect(navigate).toHaveBeenCalledTimes(1);
});
test('active recording or failed editor save blocks navigation',async()=>{
 const store=new MemoryStore();const navigate=vi.fn();registerSessionCheckpoint(store,async()=>{throw Error('Stop and save the take');});
 await expect(saveBeforeWebsiteUpdate(store,navigate)).rejects.toThrow(/Stop and save/);expect(navigate).not.toHaveBeenCalled();
});
