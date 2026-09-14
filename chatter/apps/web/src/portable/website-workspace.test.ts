import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const id='11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_ORBIT_WEB','true'); vi.stubEnv('VITE_ORBIT_READER','true'); vi.stubEnv('VITE_ORBIT_MOBILE','');
  vi.stubEnv('VITE_READER_BASE','/'); vi.stubEnv('BASE_URL','/r/web-1/');
  const values=new Map([['orbit-web-workspace-id',id]]);
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)};
  vi.stubGlobal('localStorage',storage);
  vi.stubGlobal('window',{crossOriginIsolated:true,location:{pathname:'/r/web-1/',origin:'https://chatternews.github.io'},sessionStorage:{getItem:()=>JSON.stringify({workspaceId:id,releaseId:'web-1'})}});
  vi.stubGlobal('navigator',{serviceWorker:{controller:{scriptURL:'https://chatternews.github.io/sw.js'}},storage:{getDirectory:async()=>({})},locks:{request:async(_name:string,_opts:unknown,run:(lock:unknown)=>unknown)=>run({})}});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
test('a prepared website opens device recovery without requiring a USB workspace database',async()=>{
  const {connectReaderDrive,getReaderDrive}=await import('./reader-drive.js');
  await expect(connectReaderDrive()).resolves.toBeUndefined();
  expect(getReaderDrive()).toBeUndefined();
});
test('a website cannot open a workspace selected for another browser context',async()=>{
  localStorage.setItem('orbit-web-workspace-id','22222222-2222-4222-8222-222222222222');
  const {connectReaderDrive}=await import('./reader-drive.js');
  await expect(connectReaderDrive()).rejects.toThrow(/device|desk/i);
});
test('a website requires its own controller before mounting any student store',async()=>{
  Object.assign(navigator.serviceWorker.controller!,{scriptURL:'https://chatternews.github.io/other/sw.js'});
  const {connectReaderDrive}=await import('./reader-drive.js');
  await expect(connectReaderDrive()).rejects.toThrow(/prepared|reader/i);
});
