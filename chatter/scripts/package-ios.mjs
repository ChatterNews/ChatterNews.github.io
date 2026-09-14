#!/usr/bin/env node
/** Safari Files cartridge and its matching, small HTTPS reader. */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, openAsBlob } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { CARTRIDGE_HEADER_BYTES, CARTRIDGE_MAGIC, MAX_MANIFEST_BYTES, openCartridge } from '../reader/cartridge.mjs';
import { validateManifest } from '../reader/core.mjs';
import { collectModels, collectNpmNotices, createSourceArchive, createZip, fileManifest, run, sha256, verifyModels } from './desktop-package-common.mjs';
import { readerDeployment, writeReaderHosting } from './browser-package.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const defaultReaderURL = 'https://delsaint18.github.io/orbit-mobile/';
const { readerURL, readerBase } = readerDeployment(defaultReaderURL);
const builtAt = new Date().toISOString();
const releaseId = `mobile-pilot-${builtAt.slice(0, 10).replaceAll('-', '')}-${Date.now().toString(16)}`;
const appBase = `${readerBase}r/${releaseId}/`;
const stage = join(root, 'dist', `Orbit-iPhone-iPad-${builtAt.replace(/[:.]/g, '-')}`);
const destination = join(stage, 'Orbit');
const support = join(destination, '_Orbit');
const web = join(stage, 'web');
const hosting = join(support, 'Reader-hosting');
const cartridgePath = join(destination, 'Orbit.orbit');
await mkdir(join(root, 'dist'), { recursive: true });
await mkdir(stage);
await mkdir(join(destination, 'Chatter News'), { recursive: true });
const models = (await collectModels(root)).filter((model) => !model.file.startsWith('onnx-community/whisper-base/'));
run('npm', ['run', 'build', '-w', '@chatter/web', '--', '--base', appBase, '--outDir', web, '--emptyOutDir'], {
  cwd: root, env: { ...process.env, VITE_MODEL_HOST: `${appBase}models`, VITE_DESKTOP: '', VITE_ORBIT_READER: 'true', VITE_ORBIT_MOBILE: 'true', VITE_READER_BASE: readerBase },
});
await rm(join(web, 'models', 'onnx-community', 'whisper-base'), { recursive: true, force: true });
await verifyModels(web, models);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const files = (await fileManifest(web)).map(({ file, ...entry }) => ({ path: file, ...entry, mime: types[extname(file).toLowerCase()] || 'application/octet-stream' }));
const manifest = validateManifest({ format: 1, releaseId, files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) }, releaseId);
const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('The release manifest exceeds the cartridge limit.');
const trust = { releaseId, manifestSha256: createHash('sha256').update(manifestBytes).digest('hex') };
const header = Buffer.alloc(CARTRIDGE_HEADER_BYTES);
header.write(CARTRIDGE_MAGIC, 'utf8');
header.writeUInt32LE(manifestBytes.length, 8);

async function* cartridgeChunks() {
  yield header;
  yield manifestBytes;
  for (const entry of manifest.files) {
    let bytes = 0;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(join(web, entry.path))) {
      bytes += chunk.length;
      hash.update(chunk);
      yield chunk;
    }
    if (bytes !== entry.bytes || hash.digest('hex') !== entry.sha256) throw new Error(`App file changed while packaging: ${entry.path}`);
  }
}

const partial = `${cartridgePath}.part`;
try {
  await pipeline(Readable.from(cartridgeChunks()), createWriteStream(partial, { flags: 'wx' }));
  // Re-open the actual bytes through the same bounded parser used by Safari.
  const cartridge = await openCartridge(await openAsBlob(partial), trust);
  for (const entry of cartridge.manifest.files) {
    const bytes = await cartridge.loadFile(entry.path).arrayBuffer();
    if (createHash('sha256').update(new Uint8Array(bytes)).digest('hex') !== entry.sha256) throw new Error(`Cartridge verification failed: ${entry.path}`);
  }
  await rename(partial, cartridgePath);
} catch (error) {
  await rm(partial, { force: true });
  throw error;
}

await writeReaderHosting(join(root, 'reader'), hosting, { edition: 'mobile', releaseId });
await writeFile(join(hosting, 'trusted-release.json'), JSON.stringify(trust));
await writeFile(join(destination, 'Start Orbit.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Start Orbit</title><style>body{font:18px system-ui;background:#211b36;color:#fff4cc;margin:10vh auto;padding:24px;max-width:580px}a{display:inline-block;background:#ffc755;color:#211b36;padding:18px 26px;border-radius:12px;font-weight:bold}p{line-height:1.6}</style><h1>Chatter News · Orbit</h1><p>Your next mission starts here.</p><a href="${readerURL}">Open Orbit in Safari →</a><p>Save <b>Orbit.orbit</b> in Files. If you downloaded the ZIP, tap it in Files to unpack it first. Open the link above in Safari and choose <b>Share → Add to Home Screen</b>. Open the new Orbit icon, then choose <b>Orbit.orbit</b> when prompted. First preparation needs internet for the small reader.</p><p>Keep students’ exported work in <b>Chatter News</b>. The session save screen helps you export an editable copy through Files. This package is for the Safari web app; it is not an App Store installer.</p></html>`);
await cp(join(root, 'desktop', 'licenses'), join(support, 'licenses'), { recursive: true });
await collectNpmNotices(root, join(support, 'licenses', 'npm'));
await cp(join(root, 'THIRD_PARTY_NOTICES.md'), join(support, 'THIRD_PARTY_NOTICES.md'));
await writeFile(join(support, 'TESTING.txt'), (await readFile(join(root, 'reader', 'TESTING-MOBILE.txt'), 'utf8')).replaceAll(defaultReaderURL, readerURL));
await mkdir(join(support, 'source'), { recursive: true });
createSourceArchive(root, join(support, 'source', 'Orbit-app-source.zip'));
await writeFile(join(support, 'source', 'REBUILD.txt'), `Install Node.js 22+ and Python 3 on a development computer. Extract Orbit-app-source.zip, then run npm ci and npm run fetch-models in chatter. This package was built using npm run package:ios -- --reader-url ${readerURL}\nMODEL-FILES.json records the exact model files shipped in this pilot. Rebuilding creates a new release and matching reader. Choose a new, unused --reader-url path for that release; do not replace an existing release reader. An iPhone or iPad needs Safari and the hosted reader, not Node.js.\n`);
await writeFile(join(support, 'DEPLOY.txt'), `Host only Reader-hosting contents at ${readerURL}. Preserve existing release paths; do not overwrite a different release's reader. Do not upload Chatter News, the cartridge, browser recovery data, or the whole package to the reader website. Share Orbit.orbit as a download alongside this companion kit of source and notices. The reader pins the exact manifest hash and verifies each cartridge file before activating it. Distribute this cartridge and its matching reader together.\n`);
await writeFile(join(support, 'RELEASE.json'), manifestBytes);
await writeFile(join(support, 'MODEL-FILES.json'), JSON.stringify(models, null, 2));
const cartridgeSha256 = await sha256(cartridgePath);
await writeFile(join(support, 'BUILD.json'), JSON.stringify({ builtAt, releaseId, ...trust, readerURL, appBase, platform: 'ios-safari', iosDeviceVerified: false, cartridgeFormat: 1, cartridgeSha256, files: await fileManifest(destination) }, null, 2));

async function availablePath(extension) {
  const simple = join(root, 'dist', `Orbit-iPhone-iPad-pilot-${builtAt.slice(0, 10)}.${extension}`);
  return await stat(simple).catch(() => undefined) ? join(root, 'dist', `Orbit-iPhone-iPad-${releaseId}.${extension}`) : simple;
}
const cartridge = await availablePath('orbit');
await cp(cartridgePath, cartridge, { force: false, errorOnExist: true });
if (await sha256(cartridge) !== cartridgeSha256) throw new Error('The final cartridge copy failed verification.');
await writeFile(`${cartridge}.sha256`, `${cartridgeSha256}  ${basename(cartridge)}\n`);
const zip = await availablePath('zip');
createZip(destination, zip, ['Start Orbit.html', 'Orbit.orbit', 'Chatter News', '_Orbit']);
const zipSha256 = await sha256(zip);
await writeFile(`${zip}.sha256`, `${zipSha256}  ${basename(zip)}\n`);
console.log(JSON.stringify({ cartridge, cartridgeBytes: (await stat(cartridge)).size, cartridgeSha256, zip, zipBytes: (await stat(zip)).size, zipSha256, hosting, destination, releaseId, manifestSha256: trust.manifestSha256, readerURL }, null, 2));
