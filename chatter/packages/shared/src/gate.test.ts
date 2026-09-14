import { describe, expect, test } from 'vitest';
import { screenQuery, sourceAllowed, upstreamFlags, route, DEFAULT_GATE_CONFIG } from './gate.js';

const cfg = DEFAULT_GATE_CONFIG;

describe('stage 1 - screenQuery', () => {
  test('passes an ordinary search', () => {
    expect(screenQuery('taco', cfg).ok).toBe(true);
  });

  test('rejects a blocklisted word', () => {
    const result = screenQuery('gore', cfg);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('query-blocked');
  });

  test('is case-insensitive', () => {
    expect(screenQuery('GORE', cfg).ok).toBe(false);
  });

  test('catches a blocked word inside a longer query', () => {
    expect(screenQuery('school gore pictures', cfg).ok).toBe(false);
  });

  test('does not block a word that merely contains a blocked word', () => {
    expect(screenQuery('gorgeous sunset', cfg).ok).toBe(true);
  });

  test('rejects an empty query rather than searching for everything', () => {
    expect(screenQuery('   ', cfg).ok).toBe(false);
  });
});

describe('stage 2 - sourceAllowed', () => {
  test('allows a source on the allowlist', () => {
    expect(sourceAllowed('smithsonian', cfg)).toBe(true);
  });

  test('refuses anything not on the allowlist', () => {
    expect(sourceAllowed('flickr', cfg)).toBe(false);
  });

  test('is an allowlist, not a blocklist: unknown sources are refused', () => {
    expect(sourceAllowed('some-new-provider', cfg)).toBe(false);
  });
});

describe('stage 3 - upstreamFlags', () => {
  test('honours an upstream mature flag', () => {
    expect(upstreamFlags({ mature: true }).ok).toBe(false);
  });

  test('honours an upstream sensitivity list', () => {
    expect(upstreamFlags({ sensitivity: ['violence'] }).ok).toBe(false);
  });

  test('passes a clean item', () => {
    expect(upstreamFlags({ mature: false, sensitivity: [] }).ok).toBe(true);
  });
});

describe('stage 5 - route', () => {
  test('approves a score below the low threshold', () => {
    expect(route(0.05, cfg).status).toBe('APPROVED');
  });

  test('quarantines a score between the thresholds', () => {
    expect(route(0.4, cfg).status).toBe('QUARANTINED');
  });

  test('rejects a score at or above the high threshold', () => {
    expect(route(0.9, cfg).status).toBe('REJECTED');
  });

  test('the low threshold itself quarantines rather than approves', () => {
    expect(route(0.15, cfg).status).toBe('QUARANTINED');
  });

  test('FAIL CLOSED: an unavailable classifier quarantines, never approves', () => {
    const result = route(undefined, cfg);
    expect(result.status).toBe('QUARANTINED');
    expect(result.reason).toBe('classifier-unavailable');
  });

  test('logs the score so thresholds can be tuned against real usage', () => {
    expect(route(0.4, cfg).score).toBe(0.4);
  });

  test('thresholds are config, not constants', () => {
    const strict = { ...cfg, thresholds: { low: 0.01, high: 0.02 } };
    expect(route(0.05, strict).status).toBe('REJECTED');
  });
});
