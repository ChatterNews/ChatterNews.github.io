#!/usr/bin/env node
/** USB cartridge plus the small GitHub Pages reader that opens it. */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectModels, collectNpmNotices, createSourceArchive, createZip, fileManifest, run, sha256, verifyModels } from './desktop-package-common.mjs';
import { readerDeployment, writeReaderHosting } from './browser-package.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const defaultReaderURL = 'https://delsaint18.github.io/orbit-reader/';
const { readerURL, readerBase } = readerDeployment(defaultReaderURL);
const builtAt = new Date().toISOString();
const releaseId = `pilot-${builtAt.slice(0, 10).replaceAll('-', '')}-${Date.now().toString(16)}`;
const appBase = `${readerBase}r/${releaseId}/`;
const stage = join(root, 'dist', `Orbit-Chromebook-${builtAt.replace(/[:.]/g, '-')}`);
const destination = join(stage, 'Orbit');
const support = join(destination, '_Orbit');
const web = join(support, 'app');
const hosting = join(support, 'Reader-hosting');
await mkdir(join(destination, 'Chatter News'), { recursive: true });
const models = await collectModels(root);
run('npm', ['run', 'build', '-w', '@chatter/web', '--', '--base', appBase, '--outDir', web, '--emptyOutDir'], {
  cwd: root, env: { ...process.env, VITE_MODEL_HOST: `${appBase}models`, VITE_DESKTOP: '', VITE_ORBIT_MOBILE: '', VITE_ORBIT_READER: 'true', VITE_READER_BASE: readerBase },
});
await verifyModels(web, models);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const files = (await fileManifest(web)).map(({ file, ...entry }) => ({ path: file, ...entry, mime: types[extname(file).toLowerCase()] || 'application/octet-stream' }));
if (files.some(file => file.bytes > 256 * 1024 * 1024)) throw new Error('A release file exceeds the reader memory bound.');
const manifest = JSON.stringify({ format: 1, releaseId, files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) });
const manifestSha256 = createHash('sha256').update(manifest).digest('hex');
await writeFile(join(support, 'RELEASE.json'), manifest);
await writeReaderHosting(join(root, 'reader'), hosting, { edition: 'chromebook', releaseId });
await writeFile(join(hosting, 'trusted-release.json'), JSON.stringify({ releaseId, manifestSha256 }));
await writeFile(join(destination, 'Start Orbit.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Start Orbit</title><style>body{font:18px system-ui;background:#211b36;color:#fff4cc;margin:12vh auto;padding:24px;max-width:580px}a{display:inline-block;background:#ffc755;color:#211b36;padding:18px 26px;border-radius:12px;font-weight:bold}p{line-height:1.6}</style><h1>Chatter News · Orbit</h1><p>Your next mission starts here.</p><a href="${readerURL}">Open Orbit →</a><p>Choose <b>Open Story Drive</b>, then select this whole <b>Orbit</b> folder. Keep its files together. Finish session saves the kids’ work in <b>Chatter News</b>.</p><p>First use needs internet to prepare the small reader. After preparation, bookmark the reader so you can return offline. School browser permissions still apply.</p></html>`);
await cp(join(root, 'desktop', 'licenses'), join(support, 'licenses'), { recursive: true });
await collectNpmNotices(root, join(support, 'licenses', 'npm'));
await cp(join(root, 'THIRD_PARTY_NOTICES.md'), join(support, 'THIRD_PARTY_NOTICES.md'));
await writeFile(join(support, 'TESTING.txt'), (await readFile(join(root, 'reader', 'TESTING.txt'), 'utf8')).replaceAll(defaultReaderURL, readerURL));
await mkdir(join(support, 'source'), { recursive: true });
createSourceArchive(root, join(support, 'source', 'Orbit-app-source.zip'));
await writeFile(join(support, 'source', 'REBUILD.txt'), `Install Node.js 22+ and Python 3 on a development computer. Extract Orbit-app-source.zip, then run npm ci in chatter. Copy _Orbit/app/models from this package to apps/web/public/models. This package was built using npm run package:chromebook -- --reader-url ${readerURL}\nRebuilding creates a new release and matching reader. Choose a new, unused --reader-url path for that release; do not replace an existing release reader. The Chromebook itself needs only Chrome and the hosted reader.\n`);
await writeFile(join(support, 'DEPLOY.txt'), `The small reader is hosted at ${readerURL}. Only Reader-hosting contents belong at the website's ${readerBase} path. Preserve existing release paths; do not overwrite a different release's reader. Never upload Chatter News, workspace.json, the app cartridge, or browser recovery data. The HTTPS reader pins the exact release manifest hash before allowing executable app files from USB. Each release's reader and cartridge must be distributed together.\n`);
await writeFile(join(support, 'MODEL-FILES.json'), JSON.stringify(models, null, 2));
await writeFile(join(support, 'BUILD.json'), JSON.stringify({ builtAt, releaseId, manifestSha256, readerURL, appBase, platform: 'chromeos-browser', schoolDeviceVerified: false, files: await fileManifest(destination) }, null, 2));
let zip = join(root, 'dist', `Orbit-Chromebook-pilot-${builtAt.slice(0, 10)}.zip`);
if (await stat(zip).catch(() => undefined)) zip = join(root, 'dist', `Orbit-Chromebook-pilot-${releaseId}.zip`);
createZip(destination, zip, ['Start Orbit.html', 'Chatter News', '_Orbit']);
const hash = await sha256(zip);
await writeFile(`${zip}.sha256`, `${hash}  ${basename(zip)}\n`);
console.log(JSON.stringify({ zip, bytes: (await stat(zip)).size, sha256: hash, hosting, destination, releaseId, manifestSha256, readerURL }, null, 2));
