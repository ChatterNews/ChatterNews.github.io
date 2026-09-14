import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readerDeployment, writeReaderHosting } from './browser-package.mjs';

const defaultURL = 'https://delsaint18.github.io/orbit-reader/';
test('reader URL sets the exact nested base and preserves the existing default', () => {
  assert.deepEqual(readerDeployment(defaultURL, []), { readerURL: defaultURL, readerBase: '/orbit-reader/' });
  const readerURL = `${defaultURL}releases/monday-2026-09-14/`;
  assert.deepEqual(readerDeployment(defaultURL, ['--reader-url', readerURL]), { readerURL, readerBase: '/orbit-reader/releases/monday-2026-09-14/' });
});

test('invalid or ambiguous deployment URLs and unknown arguments fail before packaging', () => {
  for (const url of ['http://example.test/reader/', 'https://example.test/reader', 'https://example.test/a/../reader/', 'https://example.test/a%2Fb/', 'https://example.test\\reader/', 'https://user:pass@example.test/reader/', 'https://example.test/reader/?v=2', 'https://example.test/reader/#x']) {
    assert.throws(() => readerDeployment(defaultURL, ['--reader-url', url]));
  }
  assert.throws(() => readerDeployment(defaultURL, ['--reader-urll', defaultURL]));
});

test('hosting copies only each edition\'s explicit files and stamps its worker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orbit-reader-hosting-test-'));
  try {
    const source = join(root, 'reader');
    await mkdir(source);
    const names = ['index.html', 'reader.js', 'reader.css', 'core.mjs', 'control.mjs', 'sw.js', 'icon.svg', 'manifest.webmanifest', 'mobile.html', 'mobile.js', 'cartridge.mjs', 'unrelated.js', 'core.test.mjs'];
    await Promise.all(names.map((name) => writeFile(join(source, name), `${name} __ORBIT_READER_BUILD__ __ORBIT_READER_EXTRA__`)));
    const chrome = join(root, 'chromebook');
    const mobile = join(root, 'mobile');
    await writeReaderHosting(source, chrome, { edition: 'chromebook', releaseId: 'monday-test' });
    assert.deepEqual((await readdir(chrome)).sort(), ['control.mjs', 'core.mjs', 'icon.svg', 'index.html', 'manifest.webmanifest', 'reader.css', 'reader.js', 'sw.js']);
    assert.equal(await readFile(join(chrome, 'sw.js'), 'utf8'), 'sw.js monday-test []');
    await writeReaderHosting(source, mobile, { edition: 'mobile', releaseId: 'mobile-test' });
    assert.deepEqual((await readdir(mobile)).sort(), ['cartridge.mjs', 'control.mjs', 'core.mjs', 'icon.svg', 'index.html', 'manifest.webmanifest', 'reader.css', 'reader.js', 'sw.js']);
    assert.equal(await readFile(join(mobile, 'index.html'), 'utf8'), 'mobile.html mobile-test ["cartridge.mjs"]');
    assert.equal(await readFile(join(mobile, 'reader.js'), 'utf8'), 'mobile.js mobile-test ["cartridge.mjs"]');
  } finally { await rm(root, { recursive: true, force: true }); }
});
