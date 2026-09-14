#!/usr/bin/env node
/** Build a complete, static Pages site. This never publishes or includes workspaces. */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest, validateReleaseId, APP_HEADERS } from '../reader/core.mjs';
import { collectModels, collectNpmNotices, createSourceArchive, fileManifest, run, verifyModels } from './desktop-package-common.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const builtAt = new Date().toISOString();
const releaseId = validateReleaseId(process.env.ORBIT_WEB_RELEASE || `web-${builtAt.slice(0, 10)}-${Date.now().toString(16)}`);
const stage = join(root, 'dist', `Orbit-Website-${releaseId}`);
const site = join(stage, 'site');
const appBase = `/r/${releaseId}/`;
const app = join(site, 'downloads', releaseId);
await mkdir(join(root, 'dist'), { recursive: true });
await mkdir(stage); // Fail if this release already exists. Never overwrite a package.
await mkdir(site);
const models = await collectModels(root);
run('npm', ['run', 'build', '-w', '@chatter/web', '--', '--base', appBase, '--outDir', app, '--emptyOutDir'], {
  cwd: root, env: { ...process.env, VITE_MODEL_HOST: `${appBase}models`, VITE_DESKTOP: '', VITE_ORBIT_READER: 'true', VITE_ORBIT_MOBILE: '', VITE_ORBIT_WEB: 'true', VITE_READER_BASE: '/' },
});
await verifyModels(app, models);
const index = join(app, 'index.html');
let html = await readFile(index, 'utf8');
if (!html.includes('http-equiv="Content-Security-Policy"')) throw new Error('The web app is missing its CSP template.');
html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)/, `$1${APP_HEADERS['Content-Security-Policy']}$2`)
  .replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="referrer" content="no-referrer">');
await writeFile(index, html);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const files = (await fileManifest(app)).map(({ file, ...entry }) => ({ path: file, ...entry, mime: types[extname(file).toLowerCase()] || 'application/octet-stream' }));
const manifest = validateManifest({ format: 1, releaseId, files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) }, releaseId);
const manifestJSON = JSON.stringify(manifest);
const trust = { releaseId, manifestSha256: createHash('sha256').update(manifestJSON).digest('hex') };
for (const name of ['index.html', 'offline.html', 'start.js', 'sw.js', 'gateway.mjs', 'launch.mjs', 'offline.mjs', 'privacy.html']) await cp(join(root, 'website', name), join(site, name));
for (const name of ['reader.css', 'core.mjs', 'control.mjs', 'icon.svg', 'manifest.webmanifest']) await cp(join(root, 'reader', name), join(site, name));
await writeFile(join(site, 'release.mjs'), `export const manifest = ${manifestJSON};\nexport const trust = ${JSON.stringify(trust)};\n`);
await writeFile(join(site, '.nojekyll'), '');
await writeFile(join(site, '404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Open Orbit</title><h1>Let’s open Orbit.</h1><p><a href="/">Open Orbit</a>. This bookmark may point to an older release; the homepage opens the current app. Keep your saved story files.</p></html>');
await cp(join(root, 'desktop', 'licenses'), join(site, 'licenses'), { recursive: true });
await collectNpmNotices(root, join(site, 'licenses', 'npm'));
await cp(join(root, 'THIRD_PARTY_NOTICES.md'), join(site, 'THIRD_PARTY_NOTICES.md'));
run('python3', ['-c', 'import pathlib,sys,zipfile\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"x",compression=zipfile.ZIP_DEFLATED) as z:\n for p in sorted(root.rglob("*")):\n  if p.is_file(): z.write(p,"licenses/"+p.relative_to(root).as_posix())', join(site, 'licenses'), join(site, 'Orbit-licenses.zip')]);
createSourceArchive(root, join(site, 'Orbit-app-source.zip'));
await writeFile(join(site, 'REBUILD.txt'), `Orbit ${releaseId}. Install Node.js 22+ and Python 3, extract Orbit-app-source.zip, then run npm ci, npm run fetch-models, and npm run package:website in chatter. Models are pinned by scripts/fetch-models.mjs. Only the generated site folder goes to Pages. No student work belongs in the repository.\n`);
const publishedFiles = await fileManifest(site);
const totalBytes = publishedFiles.reduce((sum, file) => sum + file.bytes, 0);
if (totalBytes > 900 * 1024 * 1024) throw new Error('The website exceeds its Pages size budget.');
await writeFile(join(stage, 'BUILD.json'), JSON.stringify({ builtAt, releaseId, ...trust, appBase, appBytes: manifest.totalBytes, totalBytes, models, files: publishedFiles }, null, 2));
const repository = join(stage, 'repository');
await mkdir(join(repository, '.github', 'workflows'), { recursive: true });
run('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as z: z.extractall(sys.argv[2])', join(site, 'Orbit-app-source.zip'), repository]);
await cp(join(root, 'website', 'pages.yml'), join(repository, '.github', 'workflows', 'orbit-pages.yml'));
await cp(join(root, 'website', 'DEPLOY.md'), join(repository, 'README.md'));
await writeFile(join(repository, '.gitignore'), '**/node_modules/\n**/dist/\n**/.DS_Store\nchatter/apps/web/public/models/\n*.chatter\n.env*\n');
console.log(JSON.stringify({ releaseId, site, stage, totalBytes, manifestSha256: trust.manifestSha256 }, null, 2));
