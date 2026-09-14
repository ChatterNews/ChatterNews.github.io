/** Small id and slug helpers. */

export function newId(): string {
  return 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

/** TACO-BAR from "The taco bar is back" style titles. */
export function slugify(title: string): string {
  const slug = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'UNTITLED';
}

/** sha256 of bytes, as `sha256:<hex>`. The hash IS the file's name. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}
