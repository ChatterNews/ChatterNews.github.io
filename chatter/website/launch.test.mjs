import test from 'node:test';
import assert from 'node:assert/strict';
import { launchWebsite } from './launch.mjs';
const id='11111111-1111-4111-8111-111111111111';
function storage(initial={}) { const entries=new Map(Object.entries(initial)); return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)}; }
function setup(existing=id) {
  const local=storage(existing ? {'orbit-web-workspace-id':existing}:{}); const session=storage(); const visited=[];
  return {local,session,visited,options:{base:new URL('https://chatternews.github.io/'),releaseId:'web-next',local,session,navigate:url=>visited.push(url),newId:()=>id}};
}
test('the website automatically enters after its small browser gateway is ready, preserving the desk',async()=>{
  const {options,local,session,visited}=setup(); let ready; const connection=new Promise(resolve=>{ready=resolve;});
  const launch=launchWebsite({...options,connect:()=>connection});
  assert.deepEqual(visited,[]); ready(); await launch;
  assert.deepEqual(visited,['https://chatternews.github.io/r/web-next/']);
  assert.equal(local.getItem('orbit-web-workspace-id'),id);
  assert.deepEqual(JSON.parse(session.getItem('orbit-reader-current')),{workspaceId:id,releaseId:'web-next'});
});
test('a fresh website creates its local desk without a complete toolkit or USB mount',async()=>{
  const {options,local,visited}=setup(null);
  await launchWebsite({...options,connect:async()=>{}});
  assert.equal(local.getItem('orbit-web-workspace-id'),id); assert.equal(visited.length,1);
});
test('failed gateway installation never mounts the student workspace',async()=>{
  const {options,session,visited}=setup();
  await assert.rejects(launchWebsite({...options,connect:async()=>{throw new Error('blocked');}}),/blocked/);
  assert.equal(session.getItem('orbit-reader-current'),null); assert.deepEqual(visited,[]);
});
test('an invalid desk reference is preserved and stops launch rather than silently replacing recovery',async()=>{
  const {options,local,visited}=setup('invalid');
  await assert.rejects(launchWebsite({...options,connect:async()=>{}}),/desk reference/i);
  assert.equal(local.getItem('orbit-web-workspace-id'),'invalid'); assert.deepEqual(visited,[]);
});
