/** Version 1 offline grouping labels. A code never grants permission or a role. */
import type { GroupRevision, Story } from './types.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function checksum(payload: string): string {
  // Base-32 polynomial modulo the prime 1021 detects every one-symbol edit.
  let value = 0;
  for (const symbol of payload) value = (value * 32 + ALPHABET.indexOf(symbol)) % 1021;
  return ALPHABET[Math.floor(value / 32)]! + ALPHABET[value % 32]!;
}

function present(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
}

export function createStoryCode(): string {
  const random = crypto.getRandomValues(new Uint8Array(10));
  const payload = Array.from(random, value => ALPHABET[value & 31]).join('');
  return present(payload + checksum(payload));
}

export function normalizeStoryCode(input: string): string {
  if (typeof input !== 'string' || input.length > 128) throw new Error('Check the story code and try again.');
  const compact = input.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(compact) || checksum(compact.slice(0, 10)) !== compact.slice(10)) {
    throw new Error('Check the story code and try again.');
  }
  return present(compact);
}

export function groupIdentity(code: string): string {
  return `orbit-group:v1:${normalizeStoryCode(code).replaceAll('-', '')}`;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function boundedText(value: unknown, limit: number): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Validate only the optional group fields; ordinary stories keep their existing contract. */
export function validateStoryGroupFields(story: Partial<Story>): void {
  const fail = (): never => { throw new Error('This story group or media membership is invalid.'); };
  const ids = (values: unknown): void => {
    if (!Array.isArray(values) || values.length > 10_000 || values.some(value => !boundedText(value, 256))) fail();
  };
  if (story.attachedAssetIds !== undefined) ids(story.attachedAssetIds);
  if (story.group === undefined) return;
  const group = story.group;
  if (!object(group) || normalizeStoryCode(group.code) !== group.code) fail();
  if (Object.keys(group).some(key => !['code', 'rootId', 'kind', 'contributionId', 'authorId', 'authorName', 'baseRevisionId', 'lastRevisionId', 'usedRevisionIds'].includes(key))) fail();
  if (!['main', 'piece', 'joined'].includes(group.kind) || !boundedText(group.authorName, 512)) fail();
  for (const value of [group.contributionId, group.authorId]) if (!boundedText(value, 256)) fail();
  for (const value of [group.rootId, group.baseRevisionId, group.lastRevisionId]) if (value !== undefined && !boundedText(value, 256)) fail();
  if (group.usedRevisionIds !== undefined) ids(group.usedRevisionIds);
}

/** Validate the untrusted portable record before any database writes. */
export function validateGroupRevision(row: GroupRevision): void {
  const fail = (): never => { throw new Error('This group revision is invalid or too large.'); };
  if (!object(row)) fail();
  const fields = new Set(['id', 'createdAt', 'updatedAt', 'groupCode', 'rootId', 'contributionId', 'parentRevisionId', 'kind', 'authorId', 'authorName', 'title', 'storyTitle', 'snapshotHash', 'contentHash', 'body']);
  if (Object.keys(row).some(key => !fields.has(key))) fail();
  for (const value of [row.id, row.contributionId, row.authorId]) if (!boundedText(value, 256)) fail();
  for (const value of [row.rootId, row.parentRevisionId]) if (value !== undefined && !boundedText(value, 256)) fail();
  for (const value of [row.authorName, row.title, row.storyTitle]) if (!boundedText(value, 512)) fail();
  for (const value of [row.createdAt, row.updatedAt]) if (!Number.isSafeInteger(value) || value < 0) fail();
  if (row.kind !== 'main' && row.kind !== 'piece') fail();
  if (normalizeStoryCode(row.groupCode) !== row.groupCode) fail();
  for (const value of [row.snapshotHash, row.contentHash]) if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) fail();

  // Bound traversal before serialization, including attrs, so cycles and deeply
  // nested imported documents cannot exhaust the stack or retain executable data.
  const seen = new Set<object>();
  let count = 0;
  let textSize = 0;
  const json = (value: unknown, depth: number): void => {
    if (++count > 100_000 || depth > 32) fail();
    if (typeof value === 'string') { textSize += value.length; if (textSize > 2_000_000) fail(); return; }
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
    if (typeof value !== 'object' || (!Array.isArray(value) && !object(value)) || seen.has(value)) fail();
    const container = value as object;
    seen.add(container);
    for (const [key, child] of Object.entries(container)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail();
      textSize += key.length;
      if (textSize > 2_000_000) fail();
      json(child, depth + 1);
    }
    seen.delete(container);
  };
  json(row.body, 0);
  const node = (value: unknown): void => {
    if (!object(value) || !boundedText(value.type, 64)) fail();
    const current = value as Record<string, unknown>;
    if (Object.keys(current).some(key => !['type', 'text', 'content', 'attrs', 'marks'].includes(key))) fail();
    if (current.text !== undefined && typeof current.text !== 'string') fail();
    if (current.attrs !== undefined && !object(current.attrs)) fail();
    if (current.marks !== undefined) {
      if (!Array.isArray(current.marks)) fail();
      for (const mark of current.marks as unknown[]) {
        if (!object(mark) || !boundedText(mark.type, 64) || Object.keys(mark).some(key => key !== 'type' && key !== 'attrs') || (mark.attrs !== undefined && !object(mark.attrs))) fail();
      }
    }
    if (current.content !== undefined) {
      if (!Array.isArray(current.content)) fail();
      for (const child of current.content as unknown[]) node(child);
    }
    if (current.type === 'text' && (typeof current.text !== 'string' || current.content !== undefined)) fail();
  };
  node(row.body);
  if (row.body.type !== 'doc' || row.body.text !== undefined) fail();
}
