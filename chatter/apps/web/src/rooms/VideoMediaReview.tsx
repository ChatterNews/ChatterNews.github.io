import { useEffect, useState } from 'react';
import { releaseFromQuarantine, type Asset, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { LoadingStatus } from '../components/LoadingStatus.js';

export function VideoMediaReview({ assets, me, onChanged }: { assets: Asset[]; me?: User; onChanged: () => Promise<unknown> }) {
  if (!assets.length) return null;
  const adviser = me?.role === 'ADVISER' || me?.role === 'ADMIN';
  return <details className="video-media-review" open><summary>{assets.length} imported file{assets.length === 1 ? ' needs' : 's need'} adviser review</summary>
    <p>{adviser ? 'Watch or listen to each source, then approve it for editing.' : 'Your files are saved. Ask an adviser to review them here before editing.'}</p>
    {adviser && assets.map(asset => <ReviewSource key={asset.id} asset={asset} me={me!} onChanged={onChanged} />)}
  </details>;
}

function ReviewSource({ asset, me, onChanged }: { asset: Asset; me: User; onChanged: () => Promise<unknown> }) {
  const store = useStore();
  const [url, setUrl] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function load() {
    setBusy(true); setError('');
    try { const bytes = await store.blobs.get(asset.path); if (!bytes) throw new Error('The source file is missing. Import it again.'); setUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: asset.mime }))); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'The source could not load.'); }
    finally { setBusy(false); }
  }
  async function approve() {
    if (!url || busy || (me.role !== 'ADVISER' && me.role !== 'ADMIN')) return;
    setBusy(true); setError('');
    try { await releaseFromQuarantine(store, asset.id, { actor: me.id, role: me.role }); await onChanged(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Approval did not finish.'); }
    finally { setBusy(false); }
  }
  return <article><b>{asset.creator || 'Imported source'}</b>{url ? asset.kind === 'VIDEO' ? <video src={url} controls playsInline /> : <audio src={url} controls /> : <button disabled={busy} onClick={() => void load()}>Open for review</button>}
    <button disabled={!url || busy} onClick={() => void approve()}>Approve for editing</button>
    {busy && <LoadingStatus label="Preparing media review…" />}{error && <p role="alert">{error}</p>}
  </article>;
}
