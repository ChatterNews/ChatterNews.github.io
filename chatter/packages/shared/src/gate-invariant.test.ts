import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** Every hand-written source file in the repo. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/** The only files permitted to bring an Asset row into being. */
const GATE_FILES = [
  join('packages', 'shared', 'src', 'gate-ingest.ts'),
  join('packages', 'shared', 'src', 'store-memory.ts'),   // defines unsafeCreate
  join('packages', 'shared', 'src', 'store.ts'),          // declares unsafeCreate
  join('apps', 'web', 'src', 'store', 'store-idb.ts'),    // defines unsafeCreate
];

describe('THE GATE INVARIANT (SPEC S4, S10)', () => {
  test('no Asset is created outside gate.ingest', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(repoRoot)) {
      const rel = relative(repoRoot, file);
      if (GATE_FILES.includes(rel)) continue;
      const source = readFileSync(file, 'utf8');
      if (/assets\s*\.\s*unsafeCreate/.test(source)) offenders.push(rel);
      if (/Asset\s*\.\s*create\s*\(/.test(source)) offenders.push(rel);
      if (/prisma\s*\.\s*asset\s*\.\s*create/i.test(source)) offenders.push(rel);
    }

    expect(offenders, `these files write an Asset without going through the Gate:\n  ${offenders.join('\n  ')}`)
      .toEqual([]);
  });

  test('the invariant test can actually catch a violation', () => {
    // Guards against the check silently passing because the regex is wrong.
    const violation = 'await store.assets.unsafeCreate({ kind: "IMAGE" })';
    expect(/assets\s*\.\s*unsafeCreate/.test(violation)).toBe(true);
  });

  test('it scans real files, not an empty list', () => {
    expect(sourceFiles(repoRoot).length).toBeGreaterThan(5);
  });
});
