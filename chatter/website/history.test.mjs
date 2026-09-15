import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePublishedRelease, validateHistory } from './history.mjs';
import { retainWebsiteHistory } from '../scripts/website-history.mjs';
function record(id, entries) {
 const files=Object.entries(entries).map(([path,body])=>({path,bytes:Buffer.byteLength(body),mime:'text/javascript',sha256:createHash('sha256').update(body).digest('hex')}));
 const manifest={format:1,releaseId:id,files,totalBytes:files.reduce((n,f)=>n+f.bytes,0)};
 return {manifest,trust:{releaseId:id,manifestSha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}};
}
function moduleText(record) { return `export const manifest = ${JSON.stringify(record.manifest)};\nexport const trust = ${JSON.stringify(record.trust)};\n`; }
test('reads prior metadata only as verified data',async()=>{
 const old=record('web-old',{'index.html':'old'});assert.deepEqual(await parsePublishedRelease(moduleText(old)),old);
 await assert.rejects(parsePublishedRelease(moduleText(old).replace('old"','evil"')));
 await assert.rejects(parsePublishedRelease(moduleText(old)+'globalThis.executed=true;'));
 await assert.rejects(validateHistory([old,old]),/Duplicate/);
});
test('retains old code, reuses unchanged model hashes, and carries earlier history forward',async()=>{
 const site=await mkdtemp(join(tmpdir(),'orbit-history-'));
 const ancient=record('web-ancient',{'index.html':'ancient'});
 const old=record('web-old',{'index.html':'old','models/tool.bin':'model'});
 const next=record('web-next',{'index.html':'next','models/renamed.bin':'model'});
 const requested=[];
 const network=async url=>{
  requested.push(url.pathname);
  if(url.pathname==='/release.mjs')return new Response(moduleText(old));
  if(url.pathname==='/compatibility.json')return Response.json([ancient]);
  if(url.pathname==='/downloads/web-old/index.html')return new Response('old');
  if(url.pathname===`/compat/${ancient.manifest.files[0].sha256}`)return new Response('ancient');
  throw Error('Unexpected network URL');
 };
 try {
  assert.deepEqual(await retainWebsiteHistory({previousBase:'https://example.test/',site,manifest:next.manifest,network}),[ancient,old]);
  assert.equal((await readdir(join(site,'compat'))).length,2);
  assert.equal(await readFile(join(site,'compat',old.manifest.files[0].sha256),'utf8'),'old');
  assert.ok(!requested.some(path=>path.includes('model')));
 } finally {await rm(site,{recursive:true,force:true});}
});
test('bad prior bytes abort publication instead of dropping support for old tabs',async()=>{
 const site=await mkdtemp(join(tmpdir(),'orbit-history-'));const old=record('web-old',{'index.html':'old'});
 try {
  await assert.rejects(retainWebsiteHistory({previousBase:'https://example.test/',site,manifest:record('web-new',{'index.html':'new'}).manifest,network:async url=>url.pathname==='/release.mjs'?new Response(moduleText(old)):url.pathname==='/compatibility.json'?new Response('',{status:404}):new Response('bad')}),/verification/);
 } finally {await rm(site,{recursive:true,force:true});}
});
