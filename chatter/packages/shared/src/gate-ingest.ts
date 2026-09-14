/**
 * gate.ingest - the single screened path anything takes into the system.
 * SPEC S4.
 *
 * EVERY path into the system calls this: Openverse results, student uploads,
 * recordings from Roll and the Booth. No code path may write an Asset without
 * coming through here. Enforced by gate-invariant.test.ts.
 */
import type { Store } from './store.js';
import type { AssetKind, Origin, GateStatus } from './types.js';
import { type GateConfig, type RouteResult, sourceAllowed, upstreamFlags, route } from './gate.js';
import { sha256 } from './ids.js';

export interface Classifier {
  /** False until the on-device model has loaded. The Gate fails closed on it. */
  readonly ready: boolean;
  /** Load on demand. Returning false leaves the Gate safely quarantining. */
  prepare?(): Promise<boolean>;
  classify(bytes: Uint8Array, mime: string): Promise<number>;
}

export interface IngestMeta {
  kind: AssetKind;
  mime: string;
  origin?: Origin;
  license?: string;
  creator?: string;
  sourceUrl?: string;
  mature?: boolean;
  sensitivity?: readonly string[];
  storyId?: string;
  actor?: string;
}

export interface IngestInput {
  bytes?: Uint8Array;
  url?: string;
  source: string;
  meta: IngestMeta;
  /** True only when this device just produced these bytes. */
  ownDevice?: boolean;
}

export interface GateResult {
  status: GateStatus;
  assetId?: string;
  score?: number;
  reason?: string;
}

/** Sources that are the device's own work rather than a third-party library. */
const OWN_WORK_SOURCES = new Set(['recording', 'upload', 'generated']);

export class Gate {
  constructor(
    private store: Store,
    private config: GateConfig,
    private classifier: Classifier,
    private fetchBytes: (url: string) => Promise<Uint8Array> = defaultFetch,
  ) {}

  async ingest(input: IngestInput): Promise<GateResult> {
    const { source, meta } = input;

    // Stage 2 - source allowlist. Own recordings and uploads are not library
    // sources, but they still pass through every stage below.
    if (!OWN_WORK_SOURCES.has(source.toLowerCase()) && !sourceAllowed(source, this.config)) {
      return this.decide({ status: 'REJECTED', reason: 'source-not-allowed' }, input);
    }

    // Stage 3 - upstream flags, before any bytes are fetched.
    const upstream = upstreamFlags(meta);
    if (!upstream.ok) {
      return this.decide({ status: 'REJECTED', reason: upstream.reason }, input);
    }

    // Bytes arrive only now: nothing is downloaded for an item already refused.
    const bytes = input.bytes ?? (input.url ? await this.fetchBytes(input.url) : undefined);
    if (!bytes) return this.decide({ status: 'REJECTED', reason: 'no-bytes' }, input);

    // Stages 4 and 5 - classify, then route.
    //
    // The on-device model is an IMAGE classifier, so scoring a sound file with
    // it would be meaningless. What each kind gets:
    //
    //   IMAGE            classified, and fails CLOSED if the model is not up
    //   own work         approved - a take from the Booth or a beat bounced in
    //                    the Studio, made on this device, never from outside
    //   anything else    quarantined for a person, because nothing here can
    //                    screen it and it did not come from this microphone
    //
    // Every kind still gets hashed, credited and audited below.
    const routed = await this.screen(bytes, meta, input.ownDevice === true);
    if (routed.status === 'REJECTED') {
      // Bytes are discarded here: never hashed into the blob store, never
      // written to OPFS, never rendered.
      return this.decide(routed, input);
    }

    // Stages 6, 7 - freeze and credit.
    const hash = await sha256(bytes);
    const existing = await this.store.assets.bySha256(hash);
    if (existing) {
      return this.decide({ ...routed, assetId: existing.id }, input);
    }

    await this.store.blobs.put(bytes);
    const asset = await this.store.assets.unsafeCreate({
      kind: meta.kind,
      origin: meta.origin ?? originFor(source),
      sha256: hash,
      path: hash,
      mime: meta.mime,
      bytes: bytes.byteLength,
      gateStatus: routed.status,
      ...(routed.score !== undefined ? { gateScore: routed.score } : {}),
      ...(meta.license !== undefined ? { license: meta.license } : {}),
      ...(meta.creator !== undefined ? { creator: meta.creator } : {}),
      ...(meta.sourceUrl !== undefined ? { sourceUrl: meta.sourceUrl } : {}),
    });

    await this.store.credits.create({
      assetId: asset.id,
      ...(meta.storyId !== undefined ? { storyId: meta.storyId } : {}),
      usedIn: meta.storyId ? 'story' : 'library',
    });

    return this.decide({ ...routed, assetId: asset.id }, input);
  }

  /** Decide a status for these bytes, by what kind of thing they are. */
  private async screen(bytes: Uint8Array, meta: IngestMeta, ownDevice: boolean): Promise<RouteResult> {
    if (meta.kind === 'IMAGE') {
      if (!this.classifier.ready && this.classifier.prepare) {
        try {
          await this.classifier.prepare();
        } catch {
          // Loading is part of the safety boundary. A broken model is not an
          // excuse to approve the picture; route(undefined) quarantines it.
        }
      }
      const score = this.classifier.ready
        ? await this.classifier.classify(bytes, meta.mime)
        : undefined;
      return route(score, this.config);
    }

    // The club's own work, made on this device: a take from the Booth, or a
    // beat bounced in the Studio. Neither came from outside.
    if (ownDevice && (meta.origin === 'RECORDING' || meta.origin === 'GENERATED')) {
      return { status: 'APPROVED' };
    }

    return { status: 'QUARANTINED', reason: 'unscreenable-upload' };
  }

  /** Stage 8 - one AuditEvent for every decision, approvals and rejects alike. */
  private async decide(result: GateResult, input: IngestInput): Promise<GateResult> {
    await this.store.events.append({
      action: 'gate.decision',
      target: result.assetId ?? input.url ?? input.source,
      ...(input.meta.actor !== undefined ? { actor: input.meta.actor } : {}),
      payload: {
        status: result.status,
        score: result.score,
        reason: result.reason,
        source: input.source,
        kind: input.meta.kind,
      },
    });
    return result;
  }
}

function originFor(source: string): Origin {
  switch (source.toLowerCase()) {
    case 'recording': return 'RECORDING';
    case 'upload': return 'UPLOAD';
    case 'generated': return 'GENERATED';
    default: return 'OPENVERSE';
  }
}

async function defaultFetch(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`gate: could not fetch ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
