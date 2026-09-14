/** Shared build-time helpers for Orbit distribution packages. */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { MODELS } from './fetch-models.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${basename(command)} failed with status ${result.status}`);
}

export async function sha256(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

export async function collectNpmNotices(projectRoot, destination) {
  const inventory = [];
  const visited = new Set();
  const isInside = (parent, child) => {
    const path = relative(parent, child);
    return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
  };
  const safeSegment = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
  async function packageNotices(packageRoot) {
    if (visited.has(packageRoot)) return;
    visited.add(packageRoot);
    const info = await lstat(packageRoot);
    if (!info.isDirectory() || info.isSymbolicLink()) return;
    const metadataFile = join(packageRoot, 'package.json');
    if (!(await lstat(metadataFile).catch(() => undefined))?.isFile()) return;
    const metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
    const installedAt = relative(projectRoot, packageRoot).split(sep).join('/');
    const locationHash = createHash('sha256').update(installedAt).digest('hex').slice(0, 8);
    const folder = `${safeSegment(metadata.name ?? basename(packageRoot))}-${safeSegment(metadata.version ?? 'unknown')}-${locationHash}`;
    const candidates = new Set((await readdir(packageRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^(?:licen[cs]e|copying|notice)(?:[._ -]|$)/i.test(entry.name))
      .map((entry) => entry.name));
    const declaredLicenses = [metadata.license, ...(Array.isArray(metadata.licenses) ? metadata.licenses : [])];
    for (const declared of declaredLicenses) {
      const value = typeof declared === 'string' ? declared : declared?.type;
      const match = typeof value === 'string' && /^SEE LICEN[CS]E IN (.+)$/i.exec(value.trim());
      if (match) candidates.add(match[1]);
    }
    const files = [];
    const realPackageRoot = await realpath(packageRoot);
    for (const candidate of [...candidates].sort()) {
      const source = resolve(packageRoot, candidate);
      if (!isInside(packageRoot, source)) continue;
      const sourceInfo = await lstat(source).catch(() => undefined);
      if (!sourceInfo?.isFile() || sourceInfo.isSymbolicLink()) continue;
      if (!isInside(realPackageRoot, await realpath(source))) continue;
      const packagePath = relative(packageRoot, source);
      const target = join(destination, folder, packagePath);
      await mkdir(dirname(target), { recursive: true });
      await cp(source, target);
      files.push({ file: `${folder}/${packagePath.split(sep).join('/')}`, bytes: sourceInfo.size, sha256: await sha256(target) });
    }
    // This installed ONNX package declares MIT but omits the license text.
    // Include the reviewed upstream notice supplied with the desktop notices.
    if (metadata.name === 'onnxruntime-web' && files.length === 0) {
      const source = join(projectRoot, 'desktop', 'licenses', 'ONNXRUNTIME-MIT.txt');
      const target = join(destination, folder, 'LICENSE');
      const notice = await readFile(source);
      if (!notice.includes('Permission is hereby granted') || !notice.includes('Microsoft')) {
        throw new Error('The reviewed ONNX Runtime MIT notice is missing or invalid.');
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, notice);
      files.push({ file: `${folder}/LICENSE`, bytes: notice.length, sha256: await sha256(target),
        source: 'https://raw.githubusercontent.com/microsoft/onnxruntime/89f8206ba4f1c22c39e0297fb55272e8ce8cd7d0/LICENSE' });
    }
    inventory.push({ name: metadata.name ?? basename(packageRoot), version: metadata.version ?? null,
      license: metadata.license ?? metadata.licenses ?? null, installedAt, files });
    await modules(join(packageRoot, 'node_modules'));
  }
  async function modules(directory) {
    const info = await lstat(directory).catch(() => undefined);
    if (!info?.isDirectory() || info.isSymbolicLink()) return;
    const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      if (entry.name.startsWith('@')) {
        for (const scoped of await readdir(path, { withFileTypes: true })) {
          if (scoped.isDirectory() && !scoped.isSymbolicLink()) await packageNotices(join(path, scoped.name));
        }
      } else await packageNotices(path);
    }
  }
  await mkdir(destination, { recursive: true });
  await modules(join(projectRoot, 'node_modules'));
  for (const group of ['apps', 'packages', 'workers']) {
    // Git and source ZIPs omit empty workspace groups, such as Tier 0's workers.
    const workspaces = await readdir(join(projectRoot, group), { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const workspace of workspaces) {
      if (workspace.isDirectory() && !workspace.isSymbolicLink()) {
        await modules(join(projectRoot, group, workspace.name, 'node_modules'));
      }
    }
  }
  inventory.sort((left, right) => left.installedAt.localeCompare(right.installedAt));
  await writeFile(join(destination, 'PACKAGES.json'), JSON.stringify(inventory, null, 2));
  console.log(`Included npm notices for ${inventory.length} installed packages (${inventory.reduce((sum, item) => sum + item.files.length, 0)} notice files).`);
  return inventory;
}

export async function response(url) {
  const result = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!result.ok) throw new Error(`Download failed (${result.status}): ${url}`);
  return result;
}

export async function download(url, target, expectedHash) {
  if ((await stat(target).catch(() => undefined))?.size && await sha256(target) === expectedHash) {
    console.log(`Verified cached ${basename(target)}`);
    return;
  }
  console.log(`Downloading ${basename(target)}`);
  const partial = `${target}.part`;
  try {
    const result = await response(url);
    await pipeline(Readable.fromWeb(result.body), createWriteStream(partial));
    if (await sha256(partial) !== expectedHash) throw new Error(`SHA256 mismatch: ${basename(target)}`);
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

const extractZipScript = String.raw`
import pathlib, stat, sys, zipfile
source, target = sys.argv[1:]
root = pathlib.Path(target).resolve()
with zipfile.ZipFile(source) as archive:
    for item in archive.infolist():
        path = pathlib.PurePosixPath(item.filename)
        if path.is_absolute() or '..' in path.parts or '\\' in item.filename or ':' in item.filename:
            raise ValueError('Unsafe archive path: ' + item.filename)
        if stat.S_ISLNK(item.external_attr >> 16):
            raise ValueError('Archive symlink is not allowed: ' + item.filename)
    archive.extractall(root)
`;

export function extractZip(archive, destination) {
  run('python3', ['-c', extractZipScript, archive, destination]);
}

export async function collectModels(projectRoot) {
  const models = [];
  for (const [model, files] of Object.entries(MODELS)) {
    for (const file of files) {
      const path = resolve(projectRoot, 'apps/web/public/models', model, file);
      const size = (await stat(path).catch(() => undefined))?.size;
      if (!size) throw new Error(`Missing model: ${model}/${file}. Run npm run fetch-models first.`);
      models.push({ file: `${model}/${file}`, bytes: size, sha256: await sha256(path) });
    }
  }
  return models;
}

export async function verifyModels(webRoot, models) {
  for (const model of models) {
    const copied = join(webRoot, 'models', model.file);
    if (await sha256(copied) !== model.sha256) throw new Error(`Production model differs from verified source: ${model.file}`);
  }
}

const makeSourceZipScript = String.raw`
import pathlib, sys, zipfile
root, output = map(pathlib.Path, sys.argv[1:])
roots = [
    'apps/web/src', 'apps/web/public', 'apps/web/package.json',
    'apps/web/index.html', 'apps/web/tsconfig.json', 'apps/web/vite.config.ts',
    'packages/shared/src', 'packages/shared/package.json', 'packages/shared/tsconfig.json',
    'config', 'scripts', 'desktop/main.cjs', 'desktop/preload.cjs',
    'desktop/files.cjs', 'desktop/files.test.cjs', 'desktop/main.test.cjs',
    'desktop/package.json', 'desktop/launcher', 'desktop/TESTING.txt',
    'desktop/licenses',
    'package.json', 'package-lock.json', 'tsconfig.base.json', 'vitest.config.ts',
    'THIRD_PARTY_NOTICES.md',
]
roots += [name for name in ['desktop/TESTING-MAC.txt'] if (root / name).is_file()]
roots += [name for name in ['reader', 'website', 'workers'] if (root / name).is_dir()]
def allowed(path):
    rel = path.relative_to(root)
    return not (
        path.is_symlink() or any(part.startswith('.') for part in rel.parts)
        or any(part in {'node_modules', 'dist', '__pycache__', 'test-results', 'playwright-report'} for part in rel.parts)
        or rel.as_posix().startswith('apps/web/public/models/')
        or path.suffix.lower() in {'.pem', '.key', '.p12', '.pfx', '.pyc', '.chatter'}
    )
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for name in roots:
        path = root / name
        if not path.exists():
            raise ValueError('Missing rebuild source: ' + name)
        candidates = path.rglob('*') if path.is_dir() else [path]
        for child in sorted(candidates):
            if child.is_file() and allowed(child):
                archive.write(child, 'chatter/' + child.relative_to(root).as_posix())
with zipfile.ZipFile(output) as archive:
    bad = archive.testzip()
    if bad:
        raise ValueError('Source archive verification failed: ' + bad)
`;

export function createSourceArchive(projectRoot, zipPath) {
  run('python3', ['-c', makeSourceZipScript, projectRoot, zipPath]);
}

export async function fileManifest(directory) {
  const manifest = [];
  async function visit(current, prefix = '') {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Package must not contain symlinks: ${name}`);
      if (entry.isDirectory()) await visit(path, name);
      else if (entry.isFile()) manifest.push({ file: name, bytes: (await stat(path)).size, sha256: await sha256(path) });
      else throw new Error(`Package contains an unsupported file: ${name}`);
    }
  }
  await visit(directory);
  return manifest;
}

const createZipScript = String.raw`
import json, pathlib, sys, zipfile
source, target = map(pathlib.Path, sys.argv[1:3])
expected = set(json.loads(sys.argv[3]))
entries = {p.name for p in source.iterdir()}
if entries != expected:
    raise ValueError('Unexpected files in the top-level Orbit folder: ' + repr(entries))
with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
    archive.write(source, 'Orbit/')
    for path in sorted(source.rglob('*')):
        if path.is_symlink():
            raise ValueError('Package symlink is not allowed: ' + str(path))
        name = 'Orbit/' + path.relative_to(source).as_posix()
        archive.write(path, name + '/' if path.is_dir() else name)
with zipfile.ZipFile(target) as archive:
    bad = archive.testzip()
    if bad:
        raise ValueError('ZIP verification failed: ' + bad)
    assert 'Orbit/Chatter News/' in archive.namelist()
    assert len([n for n in archive.namelist() if n.startswith('Orbit/Chatter News/')]) == 1
`;

export function createZip(sourceDirectory, zipPath, allowedTopEntries) {
  run('python3', ['-c', createZipScript, sourceDirectory, zipPath, JSON.stringify(allowedTopEntries)]);
}
