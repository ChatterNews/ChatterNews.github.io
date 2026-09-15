/** Only fixed worker URLs are checked. No story data leaves the browser. */
export async function activeWebsiteRelease(serviceWorker, timeoutMs = 1500) {
  if (!serviceWorker.controller) return undefined;
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const done = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    channel.port1.onmessage = ({ data }) => done(data?.type === 'ORBIT_RELEASE' && typeof data.releaseId === 'string' && /^[a-z0-9][a-z0-9._-]{0,95}$/i.test(data.releaseId) ? data.releaseId : undefined);
    try { serviceWorker.controller.postMessage({ type: 'ORBIT_RELEASE' }, [channel.port2]); }
    catch { channel.port2.close(); done(undefined); }
  });
}

export async function checkWebsiteUpdate(base, { serviceWorker = navigator.serviceWorker, timeoutMs = 6000 } = {}) {
  let timer;
  const update = (async () => {
    const registration = await serviceWorker.register(new URL('sw.js', base), { type: 'module', scope: base.pathname, updateViaCache: 'none' });
    await registration.update();
    const worker = registration.installing || registration.waiting;
    if (worker && !['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
      const done = () => { if (['activated', 'redundant'].includes(worker.state)) { worker.removeEventListener('statechange', done); resolve(); } };
      worker.addEventListener('statechange', done); done();
    });
  })();
  // A weak connection must not hold an already usable offline desk hostage.
  try { await Promise.race([update, new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]); }
  catch { /* Keep the current verified release offline or after a failed install. */ }
  finally { clearTimeout(timer); }
  return activeWebsiteRelease(serviceWorker);
}
