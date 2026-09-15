import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parsePublishedRelease, validateHistory } from '../website/history.mjs';
import { sha256 } from '../reader/core.mjs';

/** Retain past code once per hash; unchanged large models use the current copy. */
export async function retainWebsiteHistory({ previousBase, site, manifest, network = fetch }) {
  if (!previousBase) return [];
  const base = new URL(previousBase);
  if (base.protocol !== 'https:' || base.search || base.hash) throw new Error('Previous website must be an HTTPS base URL.');
  const get = path => network(new URL(path, base), { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const releaseResponse = await get('release.mjs');
  if (!releaseResponse.ok) throw new Error('Cannot verify the previous website; publication stopped to protect open tabs.');
  const previous = await parsePublishedRelease(await releaseResponse.text());
  const historyResponse = await get('compatibility.json');
  if (!historyResponse.ok && historyResponse.status !== 404) throw new Error('Cannot read the existing compatibility catalog.');
  const older = historyResponse.ok ? await validateHistory(await historyResponse.json()) : [];
  const records = await validateHistory([...older.filter(r => r.manifest.releaseId !== previous.manifest.releaseId), previous].filter(r => r.manifest.releaseId !== manifest.releaseId));
  const currentHashes = new Set(manifest.files.map(file => file.sha256));
  const priorFiles = new Map(previous.manifest.files.map(file => [file.sha256, file.path]));
  const needed = new Map();
  for (const record of records) for (const file of record.manifest.files) if (!currentHashes.has(file.sha256)) needed.set(file.sha256, file);
  await mkdir(join(site, 'compat'), { recursive: true });
  // A small pool avoids hundreds of sequential round trips without large buffers.
  const queue = [...needed.values()];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const file = queue.pop();
      const path = priorFiles.has(file.sha256)
        ? `downloads/${previous.manifest.releaseId}/${priorFiles.get(file.sha256).split('/').map(encodeURIComponent).join('/')}`
        : `compat/${file.sha256}`;
      const response = await get(path);
      if (!response.ok) throw new Error('A previous Orbit tool is missing; publication stopped.');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== file.bytes || await sha256(bytes) !== file.sha256) throw new Error('A previous Orbit tool failed verification; publication stopped.');
      await writeFile(join(site, 'compat', file.sha256), new Uint8Array(bytes));
    }
  }));
  return records;
}
