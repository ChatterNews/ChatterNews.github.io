import test from 'node:test';
import assert from 'node:assert/strict';
import { activeWebsiteRelease, checkWebsiteUpdate } from './update.mjs';
const base=new URL('https://chatternews.github.io/');
function setup(update=async()=>{}) {
 const calls=[]; const worker={scope:base.href,update,installing:null,waiting:null};
 const serviceWorker={register:async(...args)=>{calls.push(args);return worker;},controller:{postMessage:(_message,[port])=>{port.postMessage({type:'ORBIT_RELEASE',releaseId:'web-new'});port.close();}}};
 return {calls,worker,serviceWorker};
}
test('startup checks the fixed worker without browser cache and reads its active release',async()=>{
 const {calls,serviceWorker}=setup();assert.equal(await checkWebsiteUpdate(base,{serviceWorker}),'web-new');
 assert.equal(String(calls[0][0]),base+'sw.js');assert.deepEqual(calls[0][1],{type:'module',scope:'/',updateViaCache:'none'});
});
test('offline update failure still opens the existing release',async()=>{
 const {serviceWorker}=setup(async()=>{throw Error('offline')});assert.equal(await checkWebsiteUpdate(base,{serviceWorker}),'web-new');
});
test('a stalled update is bounded and does not block cached work',async()=>{
 const {serviceWorker}=setup(()=>new Promise(()=>{}));assert.equal(await checkWebsiteUpdate(base,{serviceWorker,timeoutMs:5}),'web-new');
});
test('waits for installed replacement to activate before choosing a release',async()=>{
 const {serviceWorker,worker}=setup();const installing=new EventTarget();installing.state='installing';worker.installing=installing;
 const pending=checkWebsiteUpdate(base,{serviceWorker});let complete=false;pending.then(()=>complete=true);
 await new Promise(setImmediate);assert.equal(complete,false);installing.state='activated';installing.dispatchEvent(new Event('statechange'));
 assert.equal(await pending,'web-new');
});
test('legacy controllers and missing controllers safely report no release',async()=>{
 assert.equal(await activeWebsiteRelease({controller:null}),undefined);
 assert.equal(await activeWebsiteRelease({controller:{postMessage:(_message,[port])=>port.close()}},5),undefined);
});
test('a disappearing controller cannot turn an update check into a startup error', async () => {
  assert.equal(await activeWebsiteRelease({ controller: { postMessage() { throw new Error('detached'); } } }), undefined);
});
