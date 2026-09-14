import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOffline } from './offline.mjs';
const base=new URL('https://chatternews.github.io/');
const manifest={format:1,releaseId:'web-1',files:[{path:'index.html',bytes:4,sha256:'a'.repeat(64),mime:'text/html'},{path:'model.bin',bytes:4,sha256:'b'.repeat(64),mime:'application/octet-stream'}],totalBytes:8};
function fixture(){
 const saved=new Map(); const requests=[]; const progress=[];
 const cache={match:async url=>saved.get(String(url))?.clone()};
 function keep(file){saved.set(`https://chatternews.github.io/r/web-1/${file.path}`,new Response('tool',{headers:{'X-Orbit-SHA256':file.sha256,'Content-Length':'4'}}));}
 const options={base,manifest,cache,onProgress:p=>progress.push(p),fetchResource:async url=>{requests.push(url);keep(manifest.files.find(f=>url.endsWith(f.path)));return new Response('tool');}};
 return {options,requests,progress,saved,keep};
}
test('optional offline preparation fills missing tools and reuses already verified files',async()=>{
 const {options,requests,progress,keep}=fixture();keep(manifest.files[0]);
 await prepareOffline(options);
 assert.deepEqual(requests,['https://chatternews.github.io/r/web-1/model.bin']);
 assert.equal(progress.at(-1).bytes,8);assert.equal(progress.at(-1).totalBytes,8);
});
test('offline readiness is not claimed when storage cannot retain a downloaded tool',async()=>{
 const {options}=fixture();
 await assert.rejects(prepareOffline({...options,fetchResource:async()=>new Response('tool')}),/keep|storage/i);
});
test('cancelled offline preparation leaves already loaded tools intact and can resume',async()=>{
 const {options,requests,saved,keep}=fixture();keep(manifest.files[0]); const controller=new AbortController();controller.abort();
 await assert.rejects(prepareOffline({...options,signal:controller.signal}),{name:'AbortError'});
 assert.equal(saved.size,1);assert.equal(requests.length,0);
 await prepareOffline(options);assert.equal(saved.size,2);
});
