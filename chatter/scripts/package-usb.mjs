#!/usr/bin/env node
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MODELS } from './fetch-models.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'dist', `Orbit-USB-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const models = [];
for (const [model, files] of Object.entries(MODELS)) {
  for (const file of files) {
    const path = resolve(root, 'apps/web/public/models', model, file);
    if (!(await stat(path).catch(() => undefined))?.size) throw new Error(`Missing model: ${model}/${file}. Run npm run fetch-models first.`);
    const bytes = await readFile(path);
    models.push({ file: `${model}/${file}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
}
const build = spawnSync('npm', ['run', 'build'], { cwd: root, env: { ...process.env, VITE_MODEL_HOST: '/models' }, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
await mkdir(destination, { recursive: true });
await cp(resolve(root, 'apps/web/dist'), resolve(destination, 'app'), { recursive: true });
await cp(resolve(root, 'scripts/usb/launch-orbit.py'), resolve(destination, 'launch-orbit.py'));
await cp(resolve(root, 'scripts/usb/START-HERE.md'), resolve(destination, 'START-HERE.md'));
await mkdir(resolve(destination, 'Student-work'));
await writeFile(resolve(destination, 'MODEL-FILES.json'), JSON.stringify(models, null, 2));
await writeFile(resolve(destination, 'BUILD.json'), JSON.stringify({ builtAt: new Date().toISOString(), modelHost: '/models', runtime: 'Python 3.9+ and Chrome', schoolDeviceVerified: false }, null, 2));
console.log(`\nUSB package ready to copy: ${destination}`);
