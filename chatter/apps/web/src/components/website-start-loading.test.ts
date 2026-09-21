// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';

const homepage = readFileSync('website/index.html', 'utf8');
const script = readFileSync('website/start.js', 'utf8')
  .replace(/^import .*;\n/gm, '').replace('import.meta.url', "'https://example.test/start.js'")
  .replace(/void setup\(\).catch\(showError\);\s*$/, 'return { setup, showError };');
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });
function boot(connect: () => Promise<unknown>) {
  document.documentElement.innerHTML = homepage;
  vi.stubGlobal('caches', {});
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  const launchWebsite = vi.fn(async ({ connect }) => { await connect(); });
  const run = new Function('navigator', 'verifyManifest', 'ensureReaderController', 'checkWebsiteUpdate', 'launchWebsite', 'manifest', 'trust', script);
  const api = run({ serviceWorker: {}, storage: { getDirectory() {} }, locks: {} }, async () => {}, connect, async () => 'release-new', launchWebsite, {}, { releaseId: 'release-old' });
  return { ...api, launchWebsite };
}
test('homepage shows immediate progress and opens the desk automatically after connecting', async () => {
  let release!: (value: unknown) => void;
  const pending = new Promise(resolve => { release = resolve; });
  const app = boot(() => pending);
  const work = app.setup();
  expect(document.body.textContent).not.toMatch(/Big ideas|MAKE ROOM FOR AN IDEA|YOUR TOOLKIT/);
  expect(document.querySelector('progress')?.hidden).toBe(false);
  expect(document.querySelector('progress')?.hasAttribute('value')).toBe(false);
  expect(app.launchWebsite).not.toHaveBeenCalled();
  release({ addEventListener() {}, waiting: false });
  await work;
  expect(app.launchWebsite).toHaveBeenCalledOnce();
  expect(app.launchWebsite.mock.calls[0][0].releaseId).toBe('release-new');
});
test('failed startup removes progress, offers retry, and resumes its loading state', async () => {
  const connect = vi.fn().mockRejectedValueOnce(new Error('Connection unavailable')).mockResolvedValue({ addEventListener() {}, waiting: false });
  const app = boot(connect);
  await app.setup().catch(app.showError);
  expect(document.body.dataset.state).toBe('error');
  expect(document.querySelector('progress')?.hidden).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('#resume')?.hidden).toBe(false);
  expect(document.body.textContent).toContain('Connection unavailable');
  await app.setup();
  expect(document.querySelector('progress')?.hidden).toBe(false);
  expect(document.querySelector<HTMLButtonElement>('#resume')?.hidden).toBe(true);
  expect(app.launchWebsite).toHaveBeenCalledOnce();
});
