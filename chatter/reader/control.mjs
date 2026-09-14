/** Wait for this reader's worker; a broader, older reader can control this URL. */
export async function ensureReaderController(base, { serviceWorker = navigator.serviceWorker, timeoutMs = 20000 } = {}) {
  const scriptURL = new URL('sw.js', base).href;
  let registration = await serviceWorker.getRegistration(base.href);
  if (!registration || registration.scope !== base.href) {
    registration = await serviceWorker.register(scriptURL, { type: 'module', scope: base.pathname });
  } else {
    // Offline reopening uses the active worker. Updates wait until its tabs close.
    void registration.update().catch(() => {});
  }
  if (serviceWorker.controller?.scriptURL !== scriptURL) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        serviceWorker.removeEventListener('controllerchange', check);
        reject(new Error('The reader did not finish its first setup. Reload this page while connected to the internet.'));
      }, timeoutMs);
      function check() {
        if (serviceWorker.controller?.scriptURL !== scriptURL) return;
        clearTimeout(timeout);
        serviceWorker.removeEventListener('controllerchange', check);
        resolve();
      }
      serviceWorker.addEventListener('controllerchange', check);
      check();
    });
  }
  return registration;
}
