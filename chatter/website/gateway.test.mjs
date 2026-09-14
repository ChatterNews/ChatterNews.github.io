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

// A cache miss must fetch only the manifest's fixed file, verify it, and reuse it.
async function lazySetup(body = 'wave', { rejectSave = false } = {}) {
  const { createHash } = await import('node:crypto');
  const file = { path: 'assets/sound.wasm', bytes: 4, mime: 'application/wasm', sha256: createHash('sha256').update('wave').digest('hex') };
  const cache = new Map(); const outgoing = [];
  const gateway = createWebsiteGateway({ base, manifest: { ...manifest, files: [manifest.files[0], file] }, shellPaths: [],
    appResponse: async (path) => cache.get(path)?.clone(),
    cacheApp: async (path, response) => { if (rejectSave) throw new Error('quota'); cache.set(path, response.clone()); },
    network: async (request) => { outgoing.push(request); return new Response(body, {headers:{'Set-Cookie':'unused=1'}}); },
  });
  return { gateway, outgoing, cache, file };
}
test('a fresh desk fetches and verifies only the requested tool, then reuses it', async () => {
  const { gateway, outgoing, cache } = await lazySetup();
  const url = base+'r/web-1/assets/sound.wasm';
  const response = await gateway(new Request(url, {headers:{'X-Student':'private','Range':'bytes=1-2'}}), base+'r/web-1/#/story/private');
  assert.equal(response.status,206); assert.equal(await response.text(),'av');
  assert.equal(response.headers.get('Content-Range'),'bytes 1-2/4');
  assert.equal(response.headers.get('Set-Cookie'),null);
  assert.equal(outgoing.length,1); const sent=outgoing[0];
  assert.equal(sent.url,'https://chatternews.github.io/downloads/web-1/assets/sound.wasm');
  assert.equal(sent.credentials,'omit'); assert.equal(sent.referrerPolicy,'no-referrer'); assert.equal(sent.redirect,'error');
  assert.equal([...sent.headers].length,0); assert.equal(cache.size,1);
  assert.equal(await (await gateway(new Request(url))).text(),'wave'); assert.equal(outgoing.length,1);
});
test('simultaneous requests for a missing tool share one verified download', async () => {
  const {gateway,outgoing}=await lazySetup();
  const responses=await Promise.all([gateway(new Request(base+'r/web-1/assets/sound.wasm')),gateway(new Request(base+'r/web-1/assets/sound.wasm'))]);
  assert.deepEqual(await Promise.all(responses.map(r=>r.text())),['wave','wave']); assert.equal(outgoing.length,1);
});
for(const body of ['evil','incomplete']) test(`a corrupt download (${body}) is neither served nor cached`,async()=>{
  const {gateway,cache}=await lazySetup(body);
  assert.equal((await gateway(new Request(base+'r/web-1/assets/sound.wasm'))).status,503); assert.equal(cache.size,0);
});
test('verified tools still work online when the browser cannot keep another cached file',async()=>{
  const {gateway,cache}=await lazySetup('wave',{rejectSave:true});
  assert.equal(await (await gateway(new Request(base+'r/web-1/assets/sound.wasm'))).text(),'wave'); assert.equal(cache.size,0);
});
