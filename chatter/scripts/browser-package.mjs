import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

/** A reader URL also determines every built asset URL and service worker scope. */
export function readerDeployment(defaultURL, args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { 'reader-url': { type: 'string' } }, allowPositionals: false });
  const value = values['reader-url'] ?? defaultURL;
  const url = new URL(value);
  // Match the app's workspace-context base contract, rejecting URL normalization.
  if (!/^https:\/\/[^/\\\s]+\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)
    || url.username || url.password || url.search || url.hash) {
    throw new Error('--reader-url must be an HTTPS URL with a trailing slash, no credentials/query/fragment, and path segments using letters, numbers, underscores or hyphens.');
  }
  return { readerURL: url.href, readerBase: url.pathname };
}

const commonFiles = ['reader.css', 'core.mjs', 'control.mjs', 'sw.js', 'icon.svg', 'manifest.webmanifest'];
const readerFiles = {
  chromebook: { 'index.html': 'index.html', 'reader.js': 'reader.js' },
  mobile: { 'mobile.html': 'index.html', 'mobile.js': 'reader.js', 'cartridge.mjs': 'cartridge.mjs' },
};

/** Only bootstrap files belong on the website, with one entry point per edition. */
export async function writeReaderHosting(sourceDir, destination, { edition, releaseId }) {
  if (!Object.hasOwn(readerFiles, edition)) throw new Error(`Unknown reader edition: ${edition}`);
  const files = { ...Object.fromEntries(commonFiles.map((name) => [name, name])), ...readerFiles[edition] };
  await mkdir(destination, { recursive: true });
  for (const [sourceName, targetName] of Object.entries(files)) {
    const source = await readFile(join(sourceDir, sourceName), 'utf8');
    await writeFile(join(destination, targetName), source.replaceAll('__ORBIT_READER_BUILD__', releaseId)
      .replaceAll('__ORBIT_READER_EXTRA__', JSON.stringify(edition === 'mobile' ? ['cartridge.mjs'] : [])));
  }
}
