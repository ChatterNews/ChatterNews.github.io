// @vitest-environment jsdom
import { act, createElement, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { lazyNamed } from './room-loaders.js';

test('an unavailable website room leaves the shell and save controls usable', async () => {
  vi.stubEnv('VITE_ORBIT_WEB','true'); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const Room=lazyNamed(async()=>{throw new TypeError('Failed to fetch dynamically imported module');},'Room');
  try {
    await act(async()=>root.render(createElement('main',null,
      createElement('button',null,'Files'),
      createElement(Suspense,{fallback:'Loading'},createElement(Room)))));
    expect(host.textContent).toContain('Files');
    expect(host.textContent).toContain('This room has not loaded yet');
    expect([...host.querySelectorAll('button')].map(b=>b.textContent)).toContain('Reload Orbit');
  } finally {await act(async()=>root.unmount());host.remove();vi.unstubAllEnvs();vi.unstubAllGlobals();}
});
