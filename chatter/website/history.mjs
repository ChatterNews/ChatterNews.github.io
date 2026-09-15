import { verifyManifest } from './core.mjs';

/** Parse the previously published generated module as data, never execute it. */
export async function parsePublishedRelease(text) {
  const match = /^export const manifest = (.+);\s*export const trust = (.+);\s*$/.exec(text);
  if (!match || text.length > 4 * 1024 * 1024) throw new Error('Previous Orbit release metadata is invalid.');
  const trust = JSON.parse(match[2]);
  await verifyManifest(new TextEncoder().encode(match[1]), trust);
  // Preserve serialization order: the existing cache name uses this exact hash.
  const manifest = JSON.parse(match[1]);
  return { manifest, trust };
}

export async function validateHistory(records) {
  if (!Array.isArray(records) || records.length > 500) throw new Error('Orbit compatibility catalog is invalid or full.');
  const seen = new Set();
  for (const record of records) {
    await verifyManifest(new TextEncoder().encode(JSON.stringify(record.manifest)), record.trust);
    if (seen.has(record.manifest.releaseId)) throw new Error('Duplicate Orbit compatibility release.');
    seen.add(record.manifest.releaseId);
  }
  return records;
}
