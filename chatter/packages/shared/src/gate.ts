/**
 * The Gate: the single screened path for anything entering the system.
 * SPEC S4.
 *
 * Stages 1 and 2 run in the media proxy, server-side, because a check that
 * runs only in the browser is not a control - it is a suggestion.
 * Stages 3 to 8 run on the device.
 */

export type GateStatus = 'APPROVED' | 'QUARANTINED' | 'REJECTED';

export interface GateThresholds {
  low: number;
  high: number;
}

export interface GateConfig {
  thresholds: GateThresholds;
  sourcesAllow: readonly string[];
  queryBlocklist: readonly string[];
}

/** Defaults from SPEC S4. Thresholds are config, not constants - tune on pilot. */
export const DEFAULT_GATE_CONFIG: GateConfig = {
  thresholds: { low: 0.15, high: 0.55 },
  sourcesAllow: [
    'smithsonian', 'nasa', 'met', 'clevelandmuseum', 'openclipart',
    'biodiversity', 'usda', 'rawpixel', 'statensmuseum',
  ],
  queryBlocklist: [
    'gore', 'gory', 'blood', 'bloody', 'corpse', 'dead body', 'weapon',
    'gun', 'guns', 'rifle', 'pistol', 'knife', 'stab', 'kill', 'killing',
    'murder', 'suicide', 'nude', 'nudes', 'nudity', 'naked', 'porn',
    'porno', 'pornography', 'sex', 'sexy', 'drug', 'drugs', 'cocaine',
    'heroin', 'meth', 'overdose', 'noose', 'hanging', 'gruesome',
    'mutilated', 'autopsy',
  ],
};

/** Parse `config/blocklist.txt`: one term per line, `#` comments, blanks dropped. */
export function parseBlocklist(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export interface ScreenResult {
  ok: boolean;
  reason?: string;
}

/**
 * Stage 1. Whole-word match so "gorgeous sunset" is not mistaken for "gore".
 * Never leaves the box.
 */
export function screenQuery(query: string, config: GateConfig): ScreenResult {
  const normalised = query.trim().toLowerCase();
  if (!normalised) return { ok: false, reason: 'query-empty' };

  const words = normalised.split(/[^a-z0-9]+/).filter(Boolean);
  for (const term of config.queryBlocklist) {
    const hit = term.includes(' ')
      ? normalised.includes(term)
      : words.includes(term);
    if (hit) return { ok: false, reason: 'query-blocked' };
  }
  return { ok: true };
}

/** Stage 2. An allowlist: anything not named is refused. */
export function sourceAllowed(source: string, config: GateConfig): boolean {
  return config.sourcesAllow.includes(source.trim().toLowerCase());
}

export interface UpstreamMeta {
  mature?: boolean;
  sensitivity?: readonly string[];
}

/** Stage 3. Honour Openverse's own mature/sensitive flags. */
export function upstreamFlags(item: UpstreamMeta): ScreenResult {
  if (item.mature) return { ok: false, reason: 'upstream-mature' };
  if (item.sensitivity && item.sensitivity.length > 0) {
    return { ok: false, reason: 'upstream-sensitive' };
  }
  return { ok: true };
}

export interface RouteResult {
  status: GateStatus;
  score?: number;
  reason?: string;
}

/**
 * Stage 5. Route on the classifier's score.
 *
 * FAIL CLOSED: an absent score means the classifier has not loaded, and the
 * Gate quarantines. It never approves by default. SPEC S9, operational rules.
 */
export function route(score: number | undefined, config: GateConfig): RouteResult {
  if (score === undefined || Number.isNaN(score)) {
    return { status: 'QUARANTINED', reason: 'classifier-unavailable' };
  }
  const { low, high } = config.thresholds;
  if (score < low) return { status: 'APPROVED', score };
  if (score < high) return { status: 'QUARANTINED', score };
  return { status: 'REJECTED', score, reason: 'classifier-rejected' };
}
