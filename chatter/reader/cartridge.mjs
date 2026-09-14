import { MAX_RELEASE_BYTES, validateTrust, verifyManifest } from './core.mjs';

export const CARTRIDGE_MAGIC = 'ORBIT01\n';
export const CARTRIDGE_HEADER_BYTES = 12;
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const magicBytes = new TextEncoder().encode(CARTRIDGE_MAGIC);

function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Preparation cancelled. Your saved stories are unchanged.', 'AbortError');
}

/** Open a trusted cartridge without reading its large app payload into memory. */
export async function openCartridge(file, trust, { signal } = {}) {
  const reference = validateTrust(trust);
  checkCancelled(signal);
  if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < CARTRIDGE_HEADER_BYTES || file.size > CARTRIDGE_HEADER_BYTES + MAX_MANIFEST_BYTES + MAX_RELEASE_BYTES) {
    throw new Error('Choose the complete .orbit file supplied by your advisor.');
  }
  const header = new Uint8Array(await file.slice(0, CARTRIDGE_HEADER_BYTES).arrayBuffer());
  checkCancelled(signal);
  if (header.byteLength !== CARTRIDGE_HEADER_BYTES || magicBytes.some((byte, index) => header[index] !== byte)) {
    throw new Error('This is not an Orbit cartridge. Choose the .orbit file supplied by your advisor.');
  }
  const manifestLength = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(8, true);
  const payloadStart = CARTRIDGE_HEADER_BYTES + manifestLength;
  if (!manifestLength || manifestLength > MAX_MANIFEST_BYTES || payloadStart > file.size) {
    throw new Error('The Orbit cartridge reference is incomplete or too large. Download a fresh copy.');
  }
  const manifestBytes = await file.slice(CARTRIDGE_HEADER_BYTES, payloadStart).arrayBuffer();
  checkCancelled(signal);
  if (manifestBytes.byteLength !== manifestLength) throw new Error('The Orbit cartridge reference is incomplete. Download a fresh copy.');
  const manifest = await verifyManifest(manifestBytes, reference);
  checkCancelled(signal);
  if (file.size !== payloadStart + manifest.totalBytes) {
    throw new Error('The Orbit cartridge has missing or extra data. Download a fresh copy.');
  }
  // Offsets are derived only from the exact manifest pinned by the HTTPS reader.
  const entries = new Map();
  let offset = payloadStart;
  for (const entry of manifest.files) {
    entries.set(entry.path, { start: offset, end: offset + entry.bytes, mime: entry.mime });
    offset += entry.bytes;
  }
  return {
    manifest,
    manifestSha256: reference.manifestSha256,
    loadFile(path) {
      checkCancelled(signal);
      const entry = entries.get(path);
      if (!entry) throw new Error('The requested file is not part of this Orbit cartridge.');
      return file.slice(entry.start, entry.end, entry.mime);
    },
  };
}
