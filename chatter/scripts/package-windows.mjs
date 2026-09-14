#!/usr/bin/env node
/** Build a portable Windows pilot. Build tools stay in a temporary cache. */
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectModels, collectNpmNotices, createSourceArchive, createZip, download,
  extractZip, fileManifest, response, run, sha256, verifyModels } from './desktop-package-common.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(tmpdir(), 'orbit-windows-package-cache');
const electronVersion = '44.3.0';
const goVersion = 'go1.27.1';
const flags = new Set(process.argv.slice(2));
for (const flag of flags) {
  if (!['--prepare-only', '--skip-build'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
}


await mkdir(cache, { recursive: true });
const goOS = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform];
const goArch = { arm64: 'arm64', x64: 'amd64' }[process.arch];
if (!goOS || !goArch) throw new Error(`Unsupported packaging host: ${process.platform}/${process.arch}`);
const releases = await (await response('https://go.dev/dl/?mode=json')).json();
let release = releases.find((entry) => entry.version === goVersion);
if (!release) {
  const olderReleases = await (await response('https://go.dev/dl/?mode=json&include=all')).json();
  release = olderReleases.find((entry) => entry.version === goVersion);
}
const goFile = release?.files.find((entry) => entry.os === goOS && entry.arch === goArch && entry.kind === 'archive');
if (!goFile) throw new Error(`Official Go metadata does not list ${goVersion} for this host. Review the pinned packaging toolchain.`);
const goArchive = join(cache, goFile.filename);
await download(`https://go.dev/dl/${goFile.filename}`, goArchive, goFile.sha256);
const goRoot = join(cache, `${goVersion}-${goOS}-${goArch}`);
const goBinary = join(goRoot, 'go', 'bin', process.platform === 'win32' ? 'go.exe' : 'go');
const goReady = join(goRoot, '.verified-extraction');
if (!(await stat(goBinary).catch(() => undefined)) || !(await stat(goReady).catch(() => undefined))) {
  await mkdir(goRoot, { recursive: true });
  if (goFile.filename.endsWith('.zip')) extractZip(goArchive, goRoot);
  else run('tar', ['-xzf', goArchive, '-C', goRoot]);
  await writeFile(goReady, `${goFile.sha256}\n`);
}

const electronFilename = `electron-v${electronVersion}-win32-x64.zip`;
const releaseURL = `https://github.com/electron/electron/releases/download/v${electronVersion}`;
const sums = await (await response(`${releaseURL}/SHASUMS256.txt`)).text();
const expectedElectronHash = sums.split(/\r?\n/).map((line) => line.trim().split(/\s+/))
  .find(([, file]) => file?.replace(/^\*/, '') === electronFilename)?.[0];
if (!/^[a-f0-9]{64}$/.test(expectedElectronHash ?? '')) throw new Error('Electron release checksum is missing or invalid.');
const electronArchive = join(cache, electronFilename);
await download(`${releaseURL}/${electronFilename}`, electronArchive, expectedElectronHash);

const launcher = join(cache, 'Start Orbit.exe');
run(goBinary, ['build', '-trimpath', '-buildvcs=false', '-ldflags=-s -w -H=windowsgui', '-o', launcher, resolve(root, 'desktop/launcher/main_windows.go')], {
  env: {
    ...process.env,
    GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0', GOENV: 'off',
    GO111MODULE: 'off', GOTOOLCHAIN: 'local', GOFLAGS: '',
    GOROOT: join(goRoot, 'go'), GOCACHE: join(cache, 'go-build'),
  },
});
const pe = await readFile(launcher);
const peOffset = pe.readUInt32LE(0x3c);
if (pe.subarray(peOffset, peOffset + 4).toString('binary') !== 'PE\0\0'
  || pe.readUInt16LE(peOffset + 4) !== 0x8664 || pe.readUInt16LE(peOffset + 24 + 68) !== 2) {
  throw new Error('Launcher did not compile as a 64-bit Windows GUI executable.');
}
console.log('Windows GUI launcher compiled and verified.');
if (flags.has('--prepare-only')) {
  console.log(`Runtime and launcher prepared in ${cache}`);
  process.exit(0);
}

const models = await collectModels(root);
if (!flags.has('--skip-build')) {
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    env: { ...process.env, VITE_MODEL_HOST: '/models', VITE_DESKTOP: 'true',
      VITE_ORBIT_READER: '', VITE_ORBIT_MOBILE: '', VITE_READER_BASE: '' },
  });
}
const webRoot = resolve(root, 'apps/web/dist');
if (!(await stat(join(webRoot, 'index.html')).catch(() => undefined))?.size) throw new Error('Production web build is missing.');
// --skip-build is for a fresh, explicitly configured build. Never silently ship
// models from another build or a remotely configured model host.
await verifyModels(webRoot, models);

const builtAt = new Date().toISOString();
const stamp = builtAt.replace(/[:.]/g, '-');
const staging = resolve(root, 'dist', `Orbit-Windows-${stamp}`);
const destination = join(staging, 'Orbit');
const support = join(destination, '_Orbit');
const runtime = join(support, 'runtime');
const app = join(runtime, 'resources', 'app');
await mkdir(runtime, { recursive: true });
await mkdir(join(destination, 'Chatter News'));
extractZip(electronArchive, runtime);
await rename(join(runtime, 'electron.exe'), join(runtime, 'Orbit.exe'));
await rm(join(runtime, 'resources', 'default_app.asar'), { force: true });
await mkdir(app, { recursive: true });
for (const file of ['main.cjs', 'preload.cjs', 'files.cjs', 'package.json']) {
  await cp(resolve(root, 'desktop', file), join(app, file));
}
await cp(webRoot, join(app, 'web'), { recursive: true });
await cp(launcher, join(destination, 'Start Orbit.exe'));
await cp(resolve(root, 'desktop/TESTING.txt'), join(support, 'TESTING.txt'));
await cp(resolve(root, 'THIRD_PARTY_NOTICES.md'), join(support, 'THIRD_PARTY_NOTICES.md'));
await mkdir(join(support, 'licenses'));
await cp(join(goRoot, 'go', 'LICENSE'), join(support, 'licenses', 'Go.txt'));
if ((await stat(resolve(root, 'desktop/licenses')).catch(() => undefined))?.isDirectory()) {
  await cp(resolve(root, 'desktop/licenses'), join(support, 'licenses'), { recursive: true });
}
await collectNpmNotices(root, join(support, 'licenses', 'npm'));
await mkdir(join(support, 'source'));
const sourceReadme = `Orbit Windows pilot — rebuilding this exact app\n\n`
  + `The adjacent ZIP contains the application source and build configuration.\n`
  + `It does not contain student work, developer credentials, or browser data.\n\n`
  + `1. Extract the source ZIP and install Node.js 22 or newer.\n`
  + `2. From the chatter folder, run npm ci.\n`
  + `3. Copy the models folder from ../runtime/resources/app/web/models in the\n`
  + `   distributed Orbit package to apps/web/public/models in the extracted source.\n`
  + `   Alternatively, npm run fetch-models downloads the model manifest's files.\n`
  + `4. Run npm run package:windows to rebuild the Windows package. Packaging\n`
  + `   uses Python 3 and downloads checksum-verified Go/Electron build archives;\n`
  + `   these tools are not needed to run the resulting Windows app.\n\n`
  + `Exact JavaScript dependency versions are in package-lock.json. The bundled\n`
  + `model hashes are in ../MODEL-FILES.json. See ../licenses for component notices.\n`;
await writeFile(join(support, 'source', 'REBUILD.txt'), sourceReadme);
createSourceArchive(root, join(support, 'source', 'Orbit-app-source.zip'));
await writeFile(join(support, 'MODEL-FILES.json'), JSON.stringify(models, null, 2));
const manifest = await fileManifest(destination);
await writeFile(join(support, 'BUILD.json'), JSON.stringify({
  builtAt, platform: 'win32', architecture: 'x64', electronVersion,
  electronArchiveSHA256: expectedElectronHash,
  launcherToolchain: goVersion, launcherToolchainSHA256: goFile.sha256,
  modelHost: '/models', desktop: true, signed: false,
  windowsDeviceVerified: false, schoolDeviceVerified: false,
  files: manifest,
}, null, 2));

const preferredZip = resolve(root, 'dist', `Orbit-Windows-pilot-${builtAt.slice(0, 10)}.zip`);
const zip = await stat(preferredZip).catch(() => undefined)
  ? resolve(root, 'dist', `Orbit-Windows-pilot-${stamp}.zip`) : preferredZip;
createZip(destination, zip, ['Start Orbit.exe', 'Chatter News', '_Orbit']);
const zipHash = await sha256(zip);
await writeFile(`${zip}.sha256`, `${zipHash}  ${basename(zip)}\n`);
console.log(`\nWindows pilot ZIP: ${zip}`);
console.log(`Size: ${((await stat(zip)).size / 1024 / 1024).toFixed(1)} MiB`);
console.log(`SHA256: ${zipHash}`);
console.log(`Extracted package: ${destination}`);
console.log('Windows hardware startup and recording still require a Windows pilot test.');
