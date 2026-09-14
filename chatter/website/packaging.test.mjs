import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { collectNpmNotices, createSourceArchive, run } from '../scripts/desktop-package-common.mjs';

test('license collection handles an absent, empty npm workspace group', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orbit-notices-'));
  try {
    await mkdir(join(root, 'apps')); await mkdir(join(root, 'packages'));
    const dependency = join(root, 'node_modules', 'practice-package');
    await mkdir(dependency, { recursive: true });
    await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'practice-package', version: '1.0.0', license: 'MIT' }));
    await writeFile(join(dependency, 'LICENSE'), 'Practice license fixture');
    const inventory = await collectNpmNotices(root, join(root, 'notices'));
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].name, 'practice-package');
    assert.equal(await readFile(join(root, 'notices', inventory[0].files[0].file), 'utf8'), 'Practice license fixture');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('distributed source can be archived again after empty folders disappear', async () => {
  const output = await mkdtemp(join(tmpdir(), 'orbit-rebuild-'));
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    createSourceArchive(root, join(output, 'first.zip'));
    run('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as z: z.extractall(sys.argv[2])', join(output, 'first.zip'), output]);
    createSourceArchive(join(output, 'chatter'), join(output, 'second.zip'));
    run('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as a, zipfile.ZipFile(sys.argv[2]) as b:\n assert set(a.namelist()) == set(b.namelist())\n assert all(a.read(n) == b.read(n) for n in a.namelist())', join(output, 'first.zip'), join(output, 'second.zip')]);
  } finally { await rm(output, { recursive: true, force: true }); }
});
