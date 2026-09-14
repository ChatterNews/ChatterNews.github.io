#!/usr/bin/env node
/** Assemble separate Apple Silicon and Intel portable macOS pilot packages. */
import { cp, mkdir, readFile, readdir, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectModels, collectNpmNotices, createSourceArchive, download,
  response, run, sha256, verifyModels } from './desktop-package-common.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = '/private/tmp/orbit-mac-runtime-44.3.0';
const electronVersion = '44.3.0';
const flags = new Set(process.argv.slice(2));
for (const flag of flags) {
  if (!['--prepare-only', '--skip-build', '--arm64-only', '--x64-only'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
}
if (process.platform !== 'darwin') throw new Error('Build the Mac package on macOS with the Xcode Command Line Tools.');
if (flags.has('--arm64-only') && flags.has('--x64-only')) throw new Error('Choose one architecture filter or omit both to build both packages.');
const architectures = flags.has('--arm64-only') ? ['arm64'] : flags.has('--x64-only') ? ['x64'] : ['arm64', 'x64'];
await mkdir(cache, { recursive: true });
const releaseURL = `https://github.com/electron/electron/releases/download/v${electronVersion}`;
const sums = await (await response(`${releaseURL}/SHASUMS256.txt`)).text();
const runtimes = [];
for (const architecture of architectures) {
  const filename = `electron-v${electronVersion}-darwin-${architecture}.zip`;
  const checksum = sums.split(/\r?\n/).map((line) => line.trim().split(/\s+/))
    .find(([, file]) => file?.replace(/^\*/, '') === filename)?.[0];
  if (!/^[a-f0-9]{64}$/.test(checksum ?? '')) throw new Error(`Official checksum is missing for ${filename}.`);
  const archive = join(cache, filename);
  await download(`${releaseURL}/${filename}`, archive, checksum);
  runtimes.push({ architecture, archive, checksum });
}
const launcherBinary = join(cache, 'StartOrbit');
run('/usr/bin/xcrun', ['clang', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=13.0', '-fobjc-arc',
  '-Wall', '-Wextra', '-framework', 'Cocoa', resolve(root, 'desktop/launcher/main_macos.m'), '-o', launcherBinary]);
run('/usr/bin/lipo', [launcherBinary, '-verify_arch', 'arm64', 'x86_64']);
console.log('Native Mac launcher compiled for Apple Silicon and Intel.');
if (flags.has('--prepare-only')) { console.log(`Mac runtime and launcher prepared in ${cache}`); process.exit(0); }

const models = await collectModels(root);
if (!flags.has('--skip-build')) run('npm', ['run', 'build'], { env: {
  ...process.env, VITE_MODEL_HOST: '/models', VITE_DESKTOP: 'true',
  VITE_ORBIT_READER: '', VITE_ORBIT_MOBILE: '', VITE_READER_BASE: '',
} });
const webRoot = resolve(root, 'apps/web/dist');
await verifyModels(webRoot, models);
const desktopPackage = JSON.parse(await readFile(resolve(root, 'desktop/package.json'), 'utf8'));
const builtAt = new Date().toISOString();
const stamp = builtAt.replace(/[:.]/g, '-');
const artifacts = [];
const updateRuntimePlist = String.raw`
import pathlib, plistlib, sys
path = pathlib.Path(sys.argv[1])
info = plistlib.loads(path.read_bytes())
info.update({
    'CFBundleIdentifier': 'org.chatternews.orbit',
    'CFBundleName': 'Orbit', 'CFBundleDisplayName': 'Orbit',
    'NSMicrophoneUsageDescription': 'Orbit uses your microphone when you choose to record audio.',
    'NSCameraUsageDescription': 'Orbit uses your camera when you choose to record video.',
})
path.write_bytes(plistlib.dumps(info))
`;
const launcherPlist = (version) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>org.chatternews.orbit.launcher</string>
<key>CFBundleName</key><string>Start Orbit</string>
<key>CFBundleDisplayName</key><string>Start Orbit</string>
<key>CFBundleExecutable</key><string>StartOrbit</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleIconFile</key><string>Orbit.icns</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>\n`;

// Electron's macOS frameworks use contained relative symlinks. Preserve them
// in the archive, and record their target instead of copying their contents.
async function macManifest(directory) {
  const entries = [];
  const actualRoot = await realpath(directory);
  async function visit(current, prefix = '') {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await readlink(path);
        const actual = relative(actualRoot, await realpath(path));
        if (isAbsolute(target) || isAbsolute(actual) || actual === '..' || actual.startsWith(`..${sep}`)) throw new Error(`Unsafe bundle symlink: ${name}`);
        entries.push({ file: name, type: 'symlink', target });
      } else if (entry.isDirectory()) await visit(path, name);
      else if (entry.isFile()) entries.push({ file: name, bytes: (await stat(path)).size, sha256: await sha256(path) });
      else throw new Error(`Unsupported package entry: ${name}`);
    }
  }
  await visit(directory);
  return entries;
}

for (const { architecture, archive, checksum } of runtimes) {
  const label = architecture === 'arm64' ? 'Apple-Silicon' : 'Intel';
  const staging = resolve(root, 'dist', `Orbit-Mac-${label}-${stamp}`);
  const destination = join(staging, 'Orbit');
  const support = join(destination, '_Orbit');
  const runtime = join(support, 'runtime');
  await mkdir(runtime, { recursive: true });
  await mkdir(join(destination, 'Chatter News'));
  // ditto preserves the official macOS bundle's framework links and modes.
  run('/usr/bin/ditto', ['-x', '-k', archive, runtime]);
  const runtimeApp = join(runtime, 'Orbit.app');
  await rename(join(runtime, 'Electron.app'), runtimeApp);
  const resources = join(runtimeApp, 'Contents', 'Resources');
  await rm(join(resources, 'default_app.asar'), { force: true });
  const app = join(resources, 'app');
  await mkdir(app, { recursive: true });
  for (const file of ['main.cjs', 'preload.cjs', 'files.cjs', 'package.json']) await cp(resolve(root, 'desktop', file), join(app, file));
  await cp(webRoot, join(app, 'web'), { recursive: true });
  run('python3', ['-c', updateRuntimePlist, join(runtimeApp, 'Contents', 'Info.plist')]);
  const launcherApp = join(destination, 'Start Orbit.app');
  const launcherContents = join(launcherApp, 'Contents');
  await mkdir(join(launcherContents, 'MacOS'), { recursive: true });
  await mkdir(join(launcherContents, 'Resources'));
  await cp(launcherBinary, join(launcherContents, 'MacOS', 'StartOrbit'));
  await cp(join(resources, 'electron.icns'), join(launcherContents, 'Resources', 'Orbit.icns'));
  await writeFile(join(launcherContents, 'Info.plist'), launcherPlist(desktopPackage.version));
  await writeFile(join(launcherContents, 'PkgInfo'), 'APPL????');
  // Ad-hoc signatures make the local pilot internally verifiable. They do
  // not claim Developer ID notarization or change Gatekeeper settings.
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', runtimeApp]);
  run('/usr/bin/codesign', ['--force', '--sign', '-', launcherApp]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', runtimeApp]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', launcherApp]);
  await cp(resolve(root, 'desktop/TESTING-MAC.txt'), join(support, 'TESTING.txt'));
  await cp(resolve(root, 'THIRD_PARTY_NOTICES.md'), join(support, 'THIRD_PARTY_NOTICES.md'));
  await cp(resolve(root, 'desktop/licenses'), join(support, 'licenses'), { recursive: true });
  await collectNpmNotices(root, join(support, 'licenses', 'npm'));
  await mkdir(join(support, 'source'));
  createSourceArchive(root, join(support, 'source', 'Orbit-app-source.zip'));
  await writeFile(join(support, 'source', 'REBUILD.txt'), 'Extract Orbit-app-source.zip. With Node.js22+, Python3 and Xcode Command Line Tools on a Mac, run npm ci, copy the distributed app models into apps/web/public/models (or run npm run fetch-models), then run node scripts/package-mac.mjs. The source and dependency notices are included; no student work or browser profile is included.\n');
  await writeFile(join(support, 'MODEL-FILES.json'), JSON.stringify(models, null, 2));
  const manifest = await macManifest(destination);
  await writeFile(join(support, 'BUILD.json'), JSON.stringify({ builtAt, platform: 'darwin', architecture,
    electronVersion, electronArchiveSHA256: checksum, minimumMacOS: '13.0', modelHost: '/models', desktop: true,
    signature: 'ad-hoc', notarized: false, nativeLauncherDeviceVerified: false, schoolDeviceVerified: false, files: manifest }, null, 2));
  run('/usr/bin/chflags', ['hidden', support]);
  // Finder's invisible flag, unlike the BSD flag alone, survives a Finder ZIP
  // round trip. This is metadata on our new support folder, not a system setting.
  const finderInfo = Buffer.alloc(32);
  finderInfo.writeUInt16BE(0x4000, 8);
  run('/usr/bin/xattr', ['-wx', 'com.apple.FinderInfo', finderInfo.toString('hex'), support]);
  const preferred = resolve(root, 'dist', `Orbit-Mac-${label}-pilot-${builtAt.slice(0, 10)}.zip`);
  const zip = await stat(preferred).catch(() => undefined) ? resolve(root, 'dist', `Orbit-Mac-${label}-pilot-${stamp}.zip`) : preferred;
  // Finder's ZIP format carries the hidden flag and app metadata separately.
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', destination, zip]);
  run('python3', ['-c', 'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n bad=z.testzip()\n assert bad is None, bad\n assert "Orbit/Chatter News/" in z.namelist()\n', zip]);
  const digest = await sha256(zip);
  const bytes = (await stat(zip)).size;
  await writeFile(`${zip}.sha256`, `${digest}  ${basename(zip)}\n`);
  artifacts.push({ architecture, zip, bytes, sha256: digest, staging: destination });
  console.log(`${label} ZIP: ${zip} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
}
console.log(JSON.stringify(artifacts, null, 2));
