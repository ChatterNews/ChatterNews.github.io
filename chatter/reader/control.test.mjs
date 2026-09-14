import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureReaderController } from './control.mjs';

const base = new URL('https://example.test/orbit-reader/releases/monday-2026-09-14/');
function workers({ owned = false } = {}) {
  const events = new EventTarget();
  const parent = { scope: 'https://example.test/orbit-reader/' };
  const child = { scope: base.href, update: async () => { child.updates++; }, updates: 0 };
  const serviceWorker = {
    controller: { scriptURL: owned ? new URL('sw.js', base).href : `${parent.scope}sw.js` },
    ready: Promise.resolve(parent), // A resolved parent registration is not readiness.
    getRegistration: async () => owned ? child : parent,
    register: async (url, options) => { serviceWorker.registrations.push({ url: String(url), options }); return child; },
    registrations: [],
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    takeControl(url) { serviceWorker.controller = { scriptURL: url }; events.dispatchEvent(new Event('controllerchange')); },
  };
  return { serviceWorker, child };
}

test('a parent controller cannot make the nested reader ready', async () => {
  const { serviceWorker, child } = workers();
  let ready = false;
  const promise = ensureReaderController(base, { serviceWorker, timeoutMs: 1000 }).then((value) => { ready = true; return value; });
  await new Promise(setImmediate);
  assert.equal(ready, false);
  assert.deepEqual(serviceWorker.registrations, [{ url: new URL('sw.js', base).href, options: { type: 'module', scope: base.pathname } }]);
  serviceWorker.takeControl('https://example.test/orbit-reader/sw.js');
  await new Promise(setImmediate);
  assert.equal(ready, false);
  serviceWorker.takeControl(new URL('sw.js', base).href);
  assert.equal(await promise, child);
});

test('failed nested setup times out instead of accepting the old reader', async () => {
  const { serviceWorker } = workers();
  await assert.rejects(ensureReaderController(base, { serviceWorker, timeoutMs: 10 }), /reader did not finish/i);
});

test('an existing matching controller works offline without replacing its registration', async () => {
  const { serviceWorker, child } = workers({ owned: true });
  child.update = async () => { throw new Error('Offline'); };
  assert.equal(await ensureReaderController(base, { serviceWorker, timeoutMs: 100 }), child);
  assert.equal(serviceWorker.registrations.length, 0);
});
