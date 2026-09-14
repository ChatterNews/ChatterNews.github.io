import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebsiteGateway } from './gateway.mjs';
const base = new URL('https://chatternews.github.io/');
const manifest = { releaseId: 'web-1', files: [{ path: 'index.html', bytes: 8, mime: 'text/html', sha256: 'a'.repeat(64) }, { path: 'assets/sound.wasm', bytes: 4, mime: 'application/wasm', sha256: 'b'.repeat(64) }] };
function setup() {
  const outgoing = [];
  const gateway = createWebsiteGateway({ base, manifest, shellPaths: ['/', '/index.html', '/start.js'],
    shellResponse: async () => new Response('start'),
    appResponse: async (path) => new Response(path === 'index.html' ? 'newsroom' : 'wave'),
    network: async (request) => { outgoing.push(request); return new Response('file'); },
  });
  return {gateway,outgoing};
}
// An unexpected network fallback here would transmit student-controlled text.
for (const [name,url,method,clientURL] of [
  ['external fetch','https://example.com/student-writing','GET',base.href],
  ['same-origin unknown path',base+'student-writing','GET',base.href],
  ['query on allowed download',base+'downloads/web-1/assets/sound.wasm?student=writing','GET',base.href],
  ['fragment on allowed download',base+'downloads/web-1/assets/sound.wasm#student-writing','GET',base.href],
  ['post to allowed download',base+'downloads/web-1/assets/sound.wasm','POST',base.href],
  ['app fetch to download path',base+'downloads/web-1/assets/sound.wasm','GET',base+'r/web-1/'],
  ['unidentified caller',base+'downloads/web-1/assets/sound.wasm','GET',''],
  ['wrong release',base+'downloads/old/assets/sound.wasm','GET',base.href],
  ['worker caller',base+'downloads/web-1/assets/sound.wasm','GET',base+'r/web-1/assets/worker.js'],
]) test(`blocks ${name} before the network`,async()=>{
  const {gateway,outgoing}=setup();
  const response=await gateway(new Request(url,{method}),clientURL);
  assert.equal(response.status,403); assert.equal(outgoing.length,0);
});
test('preparation downloads only a named public resource with no caller headers or credentials',async()=>{
  const {gateway,outgoing}=setup();
  const response=await gateway(new Request(base+'downloads/web-1/assets/sound.wasm',{headers:{'X-Student':'private','Range':'bytes=0-3'}}),base.href);
  assert.equal(response.status,200); assert.equal(outgoing.length,1);
  const sent=outgoing[0];
  assert.equal(sent.url,'https://chatternews.github.io/downloads/web-1/assets/sound.wasm');
  assert.equal(sent.method,'GET'); assert.equal(sent.credentials,'omit'); assert.equal(sent.referrerPolicy,'no-referrer');
  assert.equal(sent.redirect,'error'); assert.equal([...sent.headers].length,0);
});
test('work and lazy model requests resolve locally without network fallback',async()=>{
  const {gateway,outgoing}=setup();
  assert.equal(await (await gateway(new Request(base+'r/web-1/'),base.href)).text(),'newsroom');
  assert.equal(await (await gateway(new Request(base+'r/web-1/assets/sound.wasm'),base+'r/web-1/')).text(),'wave');
  assert.equal((await gateway(new Request(base+'r/web-1/assets/missing.js'),base+'r/web-1/')).status,403);
  assert.equal(outgoing.length,0);
});
test('a story fragment reload resolves its app locally without putting the route on the network',async()=>{
  const {gateway,outgoing}=setup();
  const response=await gateway(new Request(base+'r/web-1/#/studio?story=practice'),base+'r/web-1/');
  assert.equal(response.status,200); assert.equal(await response.text(),'newsroom');
  assert.equal(outgoing.length,0);
});
test('missing app or shell cache fails closed instead of fetching',async()=>{
  let requests=0;
  const gateway=createWebsiteGateway({base,manifest,shellPaths:['/'],shellResponse:async()=>undefined,appResponse:async()=>undefined,network:async()=>{requests++;return new Response('leak');}});
  assert.equal((await gateway(new Request(base+'r/web-1/'),base.href)).status,503);
  assert.equal((await gateway(new Request(base),base.href)).status,503);
  assert.equal(requests,0);
});
