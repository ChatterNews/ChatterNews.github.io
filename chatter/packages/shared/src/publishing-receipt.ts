import type { PublishingReceipt, PublishingReceiptInput } from './types.js';

function publicUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value.trim()); }
  catch { throw new Error('Add a complete public link, including https://.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('The public link must begin with http:// or https://.');
  return parsed.toString();
}

/** Validate and normalize an adviser's account of an external publication. */
export function publishingReceipt(input: PublishingReceiptInput | undefined, adviserId: string): PublishingReceipt {
  if (!input) throw new Error('Add the Publishing Receipt before this can enter Reruns.');
  const destinations = input.destinations
    .map((item) => ({ platform: item.platform.trim(), url: item.url.trim() }))
    .filter((item) => item.platform || item.url)
    .map((item) => {
      if (!item.platform) throw new Error('Name the platform used for each public link.');
      return { platform: item.platform, url: publicUrl(item.url) };
    });
  if (!destinations.length) throw new Error('Add at least one platform and public link to the Publishing Receipt.');
  if (!Number.isFinite(input.publishedAt) || input.publishedAt <= 0) throw new Error('Add the date this was published.');
  const note = input.note?.trim();
  return { destinations, publishedAt: input.publishedAt, adviserId, ...(note ? { note } : {}) };
}
