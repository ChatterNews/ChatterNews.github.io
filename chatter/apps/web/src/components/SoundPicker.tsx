import { useEffect, useRef, useState } from 'react';
import type { Asset, SoundLibraryItem } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { resolveSound } from '../audio/sound-handoff.js';
import './SoundPicker.css';

export function SoundPicker({ tracks, initialTrackId, busy, onChoose, onOpenFoley, onClose }: {
  tracks: Array<{ id: string; name: string }>; initialTrackId?: string; busy?: boolean;
  onChoose: (itemId: string, trackId: string) => Promise<void>;
  onOpenFoley: (trackId: string) => Promise<void>; onClose: () => void;
}) {
  const store = useStore(); const dialog = useRef<HTMLDialogElement>(null); const player = useRef<HTMLAudioElement>(null);
  const [rows, setRows] = useState<Array<{ item: SoundLibraryItem; asset?: Asset }>>([]);
  const [query, setQuery] = useState(''); const [trackId, setTrackId] = useState(initialTrackId ?? tracks[0]?.id ?? '');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false);
  const [audition, setAudition] = useState<{ name: string; url: string }>(); const auditionId = useRef(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { let live = true; void Promise.all([store.soundItems.list(), store.assets.list()]).then(([items, assets]) => { if (live) setRows(items.filter(item => !item.archived).map(item => ({ item, asset: assets.find(asset => asset.id === item.assetId) }))); }).catch(error => { if (live) setError(String(error)); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [store]);
  useEffect(() => () => { if (audition) URL.revokeObjectURL(audition.url); }, [audition]);
  useEffect(() => () => { auditionId.current++; player.current?.pause(); }, []);
  async function hear(itemId: string) {
    const request = ++auditionId.current; player.current?.pause(); setError('');
    try { const sound = await resolveSound(store, itemId); const bytes = await store.blobs.get(sound.asset.path); if (!bytes) throw new Error('Restore the missing audio in Media Bin.'); if (request !== auditionId.current) return; setAudition({ name: sound.item.name, url: URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: sound.asset.mime })) }); }
    catch (error) { if (request === auditionId.current) setError(error instanceof Error ? error.message : 'This sound could not play.'); }
  }
  async function run(action: () => Promise<void>) { if (working || busy) return; player.current?.pause(); auditionId.current++; setWorking(true); setError(''); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'The sound could not be placed. Retry when ready.'); } finally { setWorking(false); } }
  const found = rows.filter(({ item }) => `${item.name} ${item.tags.join(' ')} ${item.attribution.creator} ${item.attribution.license}`.toLowerCase().includes(query.toLowerCase()));
  return <dialog ref={dialog} className="sound-picker" onCancel={event => { event.preventDefault(); if (!working && !busy) onClose(); }} aria-labelledby="sound-picker-heading">
    <header><div><h2 id="sound-picker-heading">Add sound</h2><p>The club sound library on this device.</p></div><button autoFocus disabled={working || busy} onClick={onClose} aria-label="Close sound library">Close</button></header>
    <label>Search sounds<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, tag, creator, license…" /></label>
    <label>Place on track<select value={trackId} onChange={event => setTrackId(event.target.value)}>{tracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}
    {audition && <div><b>{audition.name}</b><audio ref={player} controls autoPlay src={audition.url} onError={() => setError('This audio format could not play in this browser. Try a WAV version.')} /></div>}
    {loading ? <p role="status">Reading the sound library…</p> : !found.length ? <p>No sounds match. Import or create a sound in Foley.</p> : <ul>{found.map(({ item, asset }) => {
      const ready = asset?.kind === 'AUDIO' && asset.gateStatus === 'APPROVED';
      return <li key={item.id}><div><strong>{item.name}</strong><small>{item.duration.toFixed(1)} seconds · {item.attribution.creator || 'Creator unspecified'} · {item.attribution.license || 'Rights unresolved'}</small><small>{asset ? asset.gateStatus.toLowerCase() : 'Missing audio'}{item.revisionId ? ' · Saved version' : ''}</small></div><button disabled={!ready || working || busy} onClick={() => void hear(item.id)}>Listen</button><button disabled={!ready || !trackId || working || busy} onClick={() => void run(() => onChoose(item.id, trackId))}>Use sound</button></li>;
    })}</ul>}
    <footer><button disabled={working || busy || !trackId} onClick={() => void run(() => onOpenFoley(trackId))}>Import or make a sound in Foley</button><small>Placed at your playhead. Saved sound versions keep their original arrangement.</small></footer>
  </dialog>;
}
