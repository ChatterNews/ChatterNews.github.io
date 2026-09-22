import { describe, expect, test, vi } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { Gate, type IngestInput } from './gate-ingest.js';
import { DEFAULT_GATE_CONFIG } from './gate.js';

const { STOCK_BYTES } = vi.hoisted(() => {
  // One short PCM WAV fixture. Only these exact bytes appear in the test catalog.
  const bytes = new Uint8Array(52); const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 44, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, 8, true); view.setInt16(46, 1000, true); view.setInt16(48, -1000, true);
  return { STOCK_BYTES: bytes };
});
vi.mock('./stock-sound-hashes.js', async () => {
  const { sha256 } = await import('./ids.js');
  const actual = await vi.importActual<typeof import('./stock-sound-hashes.js')>('./stock-sound-hashes.js');
  return { STOCK_SOUND_HASHES: Object.freeze({ ...actual.STOCK_SOUND_HASHES, 'checked-recording': await sha256(STOCK_BYTES) }) };
});
function setup() {
  const store = new MemoryStore(); const classifier = { ready: false, classify: vi.fn(async () => 1) };
  const fetchBytes = vi.fn(async () => STOCK_BYTES);
  return { store, classifier, fetchBytes, gate: new Gate(store, DEFAULT_GATE_CONFIG, classifier, fetchBytes) };
}
function stock(patch: Partial<IngestInput> = {}): IngestInput {
  return { source: 'upload', bytes: STOCK_BYTES, bundledSoundId: 'checked-recording', meta: { kind: 'AUDIO', mime: 'audio/wav', origin: 'UPLOAD', creator: 'Recorded source author', license: 'CC0', sourceUrl: 'https://example.test/recording' }, ...patch };
}

describe('checked bundled recording permission', () => {
  test('approves only exact catalog bytes, preserves source credit, and audits the catalog identity', async () => {
    const { store, gate, classifier } = setup(); const result = await gate.ingest(stock());
    expect(result).toMatchObject({ status: 'APPROVED', reason: 'verified-stock-sound' });
    const asset = await store.assets.get(result.assetId!);
    expect(asset).toMatchObject({ origin: 'UPLOAD', kind: 'AUDIO', gateStatus: 'APPROVED', creator: 'Recorded source author', license: 'CC0' });
    expect(await store.blobs.get(asset!.sha256)).toEqual(STOCK_BYTES); expect(await store.credits.list()).toHaveLength(1);
    expect(classifier.classify).not.toHaveBeenCalled();
    const audit = (await store.events.all()).filter(e => e.action === 'gate.decision').at(-1)!;
    expect(audit.payload).toMatchObject({ status: 'APPROVED', reason: 'verified-stock-sound', bundledSoundId: 'checked-recording' });
  });

  test('accepts the actual bundled wood impact against its shipped immutable hash', async () => {
    const { readFile } = await import('node:fs/promises');
    const bytes = new Uint8Array(await readFile(new URL('../../../apps/web/public/sounds/foley/v1/kenney-impactwood_light.wav', import.meta.url)));
    const { store, gate } = setup();
    const result = await gate.ingest(stock({ bundledSoundId: 'kenney-impactwood_light', bytes }));
    expect(result).toMatchObject({ status: 'APPROVED', reason: 'verified-stock-sound' });
    const actual = await store.assets.get(result.assetId!);
    const { STOCK_SOUND_HASHES } = await vi.importActual<typeof import('./stock-sound-hashes.js')>('./stock-sound-hashes.js');
    expect(actual?.sha256).toBe(STOCK_SOUND_HASHES['kenney-impactwood_light']);
  });

  test.each(['missing-recording', '', '__proto__', 'toString'])('rejects unknown catalog ID %j without writing bytes', async id => {
    const { store, gate } = setup(); const result = await gate.ingest(stock({ bundledSoundId: id }));
    expect(result).toMatchObject({ status: 'REJECTED', reason: 'unknown-stock-sound' });
    expect(await store.assets.list()).toHaveLength(0); expect(await store.blobs.list()).toHaveLength(0);
    expect((await store.events.all()).filter(e => e.action === 'gate.decision')).toHaveLength(1);
  });

  test('rejects altered bytes despite CC0 metadata and an own-device claim', async () => {
    const { store, gate } = setup(); const corrupt = STOCK_BYTES.slice(); corrupt[46] = corrupt[46]! ^ 1;
    const result = await gate.ingest(stock({ bytes: corrupt, ownDevice: true, meta: { ...stock().meta, origin: 'GENERATED' } }));
    expect(result).toMatchObject({ status: 'REJECTED', reason: 'stock-sound-hash-mismatch' });
    expect(await store.assets.list()).toHaveLength(0); expect(await store.blobs.list()).toHaveLength(0);
  });

  test.each([{ kind: 'IMAGE', mime: 'audio/wav' }, { kind: 'AUDIO', mime: 'audio/mpeg' }])('rejects incorrect declared type %j', async invalid => {
    const { store, gate } = setup();
    const result = await gate.ingest(stock({ meta: { ...stock().meta, ...invalid } as IngestInput['meta'] }));
    expect(result).toMatchObject({ status: 'REJECTED', reason: 'stock-sound-type-mismatch' }); expect(await store.blobs.list()).toHaveLength(0);
  });

  test('catalog verification never bypasses source and upstream restrictions', async () => {
    const { store, gate, fetchBytes } = setup();
    expect(await gate.ingest(stock({ bytes: undefined, url: 'https://example.test/a.wav', source: 'unapproved-library' }))).toMatchObject({ status: 'REJECTED', reason: 'source-not-allowed' });
    expect(await gate.ingest(stock({ bytes: undefined, url: 'https://example.test/a.wav', meta: { ...stock().meta, mature: true } }))).toMatchObject({ status: 'REJECTED', reason: 'upstream-mature' });
    expect(await gate.ingest(stock({ meta: { ...stock().meta, sensitivity: ['flagged'] } }))).toMatchObject({ status: 'REJECTED', reason: 'upstream-sensitive' });
    expect(fetchBytes).not.toHaveBeenCalled(); expect(await store.blobs.list()).toHaveLength(0);
  });

  test.each(['UPLOAD', 'RECORDING', 'GENERATED'] as const)('ordinary imports claiming %s do not receive catalog approval from license, URL or matching bytes', async origin => {
    const { gate } = setup();
    const result = await gate.ingest(stock({ bundledSoundId: undefined, ownDevice: false, meta: { ...stock().meta, origin } }));
    expect(result).toMatchObject({ status: 'QUARANTINED', reason: 'unscreenable-upload' });
  });

  test.each(['QUARANTINED', 'REJECTED'] as const)('does not upgrade an existing %s asset, even with exact checked bytes', async gateStatus => {
    const { store, gate } = setup(); const prior = await gate.ingest(stock({ bundledSoundId: undefined }));
    await store.assets.update(prior.assetId!, { gateStatus });
    const result = await gate.ingest(stock());
    expect(result).toMatchObject({ assetId: prior.assetId, status: gateStatus, reason: 'existing-asset-status-preserved' });
    expect((await store.assets.get(prior.assetId!))?.gateStatus).toBe(gateStatus); expect(await store.assets.list()).toHaveLength(1);
    expect((await store.events.all()).filter(e => e.action === 'gate.decision').at(-1)?.payload).toMatchObject({ status: gateStatus });
  });

  test('reuses an approved catalog Asset without duplicating bytes or overwriting source metadata', async () => {
    const { store, gate } = setup(); const first = await gate.ingest(stock());
    const again = await gate.ingest(stock({ meta: { ...stock().meta, creator: 'Different supplied label' } }));
    expect(again).toMatchObject({ status: 'APPROVED', assetId: first.assetId, reason: 'verified-stock-sound' });
    expect((await store.assets.get(first.assetId!))?.creator).toBe('Recorded source author'); expect(await store.blobs.list()).toHaveLength(1);
  });
});
