import { useEffect, useMemo, useState } from 'react';
import { deliverableBytes, deliverableTypeLabel, storyRoomPath, type Deliverable, type DeliverableKind, type DeliverableRoom, type Story, type User } from '@chatter/shared';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.js';
import { deliverableRoomPath } from '../deliverable-navigation.js';
import './MediaBin.css';

type Scope = 'MINE' | 'ALL';
type LoadedFile = { url?: string; text?: string; missing?: boolean };
const ROOMS: DeliverableRoom[] = ['DESK', 'BOOTH', 'GARAGE', 'CHATTERBOX', 'BLAST', 'STINGER', 'SHOWTIME', 'GREENLIGHT'];
const KINDS: DeliverableKind[] = ['AUDIO', 'IMAGE', 'VIDEO', 'DOCUMENT', 'DESIGN', 'PACKAGE'];

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function roomLabel(room: DeliverableRoom): string {
  return room === 'GARAGE' ? 'Studio' : room[0] + room.slice(1).toLowerCase();
}

export function MediaBin({ stories, adviser, me }: { stories: Story[]; adviser: boolean; me?: User }) {
  const store = useStore(); const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [files, setFiles] = useState<Deliverable[]>([]); const [users, setUsers] = useState<User[]>([]); const [loaded, setLoaded] = useState<Record<string, LoadedFile>>({});
  const [scope, setScope] = useState<Scope>(adviser ? 'ALL' : 'MINE'); const [query, setQuery] = useState(''); const [storyId, setStoryId] = useState(() => searchParams.get('story') ?? 'ALL'); const [kind, setKind] = useState<DeliverableKind | 'ALL'>('ALL'); const [room, setRoom] = useState<DeliverableRoom | 'ALL'>('ALL'); const [notice, setNotice] = useState<string>(); const [revision, setRevision] = useState(0);

  useEffect(() => { setScope(adviser ? 'ALL' : 'MINE'); }, [adviser]);
  useEffect(() => { const requested = searchParams.get('story'); if (requested) setStoryId(requested); }, [searchParams]);
  useEffect(() => { let live = true; void Promise.all([store.deliverables.list(), store.users.list()]).then(([nextFiles, nextUsers]) => { if (!live) return; setFiles(nextFiles.sort((a, b) => b.updatedAt - a.updatedAt)); setUsers(nextUsers); }).catch(() => setNotice('The Media Bin did not open. Press Refresh to try again.')); return () => { live = false; }; }, [store, revision]);
  useEffect(() => {
    let live = true; const urls: string[] = [];
    void (async () => {
      const next: Record<string, LoadedFile> = {};
      for (const item of files) {
        const bytes = await store.blobs.get(item.blobHash);
        if (!bytes) { next[item.id] = { missing: true }; continue; }
        if (item.mime.startsWith('text/') || item.mime.includes('json')) next[item.id] = { text: new TextDecoder().decode(bytes).slice(0, 1200) };
        else { const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: item.mime })); urls.push(url); next[item.id] = { url }; }
      }
      if (live) setLoaded(next); else urls.forEach((url) => URL.revokeObjectURL(url));
    })();
    return () => { live = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [files, store]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return files.filter((item) => (scope === 'ALL' || item.authorId === me?.id) && (storyId === 'ALL' || item.storyId === storyId || storyId === 'STANDALONE' && !item.storyId) && (kind === 'ALL' || item.kind === kind) && (room === 'ALL' || item.room === room) && (!term || [item.title, item.fileName, item.room, item.kind, stories.find((story) => story.id === item.storyId)?.title].filter(Boolean).join(' ').toLowerCase().includes(term)));
  }, [files, scope, me?.id, storyId, kind, room, query, stories]);
  const groups = useMemo(() => {
    const map = new Map<string, Deliverable[]>();
    filtered.forEach((item) => { const key = item.storyId ?? 'STANDALONE'; map.set(key, [...(map.get(key) ?? []), item]); });
    return [...map.entries()].sort(([a], [b]) => a === 'STANDALONE' ? 1 : b === 'STANDALONE' ? -1 : (stories.find((story) => story.id === a)?.title ?? '').localeCompare(stories.find((story) => story.id === b)?.title ?? ''));
  }, [filtered, stories]);

  async function download(item: Deliverable) {
    setNotice(undefined);
    try { const bytes = await deliverableBytes(store, item); const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: item.mime })); const link = document.createElement('a'); link.href = url; link.download = item.fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'That file could not be downloaded.'); }
  }

  return <section className="view on newsroom-room media-bin-room">
    <header className="newsroom-hero media-bin-hero"><div className="newsroom-hero-icon">▣</div><div><span className="newsroom-eyebrow">FILES</span><h1>Media Bin</h1><p>Preview and download saved audio, images, video, documents, and packages.</p></div><div className="newsroom-hero-stats"><b>{files.length}<small>saved files</small></b><b>{new Set(files.map((item) => item.storyId).filter(Boolean)).size}<small>stories</small></b></div></header>
    <div className="media-bin-scope"><div role="group" aria-label="Whose files">{!adviser && <button aria-pressed={scope === 'MINE'} onClick={() => setScope('MINE')}>My files</button>}<button aria-pressed={scope === 'ALL'} onClick={() => setScope('ALL')}>{adviser ? 'All crew files' : 'All story files'}</button></div><button onClick={() => { setNotice(undefined); setRevision((value) => value + 1); }}>↻ Refresh</button></div>
    {notice && <div className="newsroom-notice error" role="alert">{notice}</div>}
    <div className="media-bin-filters"><label><span>Find a file</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, filename, story, or room" /></label><label><span>Story</span><select value={storyId} onChange={(event) => setStoryId(event.target.value)}><option value="ALL">Every story</option>{stories.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}<option value="STANDALONE">Standalone work</option></select></label><label><span>Type</span><select value={kind} onChange={(event) => setKind(event.target.value as DeliverableKind | 'ALL')}><option value="ALL">Every file type</option>{KINDS.map((item) => <option key={item} value={item}>{deliverableTypeLabel(item)}</option>)}</select></label><label><span>Made in</span><select value={room} onChange={(event) => setRoom(event.target.value as DeliverableRoom | 'ALL')}><option value="ALL">Every room</option>{ROOMS.map((item) => <option key={item} value={item}>{roomLabel(item)}</option>)}</select></label></div>
    {groups.map(([groupId, items]) => { const story = stories.find((item) => item.id === groupId); return <section className="media-bin-group" key={groupId}><header><div><span>{story ? story.status.toLowerCase() : 'independent project'}</span><h2>{story?.title ?? 'Standalone work'}</h2><p>{items.length} file{items.length === 1 ? '' : 's'} · {[...new Set(items.map((item) => deliverableTypeLabel(item.kind)))].join(' + ')}</p></div>{story && <button onClick={() => navigate(storyRoomPath('slate', story.id))}>Open story plan →</button>}</header><div className="media-bin-grid">{items.map((item) => { const preview = loaded[item.id]; const author = users.find((user) => user.id === item.authorId); const authorLabel = author?.penName ?? (item.authorId ? 'Crew member' : 'Chatter crew'); return <article key={item.id}><div className={`media-bin-preview kind-${item.kind.toLowerCase()}`}>{preview?.missing ? <div className="media-bin-missing">!<span>File missing</span></div> : item.kind === 'AUDIO' && preview?.url ? <audio controls preload="metadata" src={preview.url} /> : item.kind === 'VIDEO' && preview?.url ? <video controls preload="metadata" src={preview.url} /> : (item.kind === 'IMAGE' || item.kind === 'DESIGN') && preview?.url ? <img src={preview.url} alt={`Preview of ${item.title}`} /> : item.mime === 'application/pdf' && preview?.url ? <iframe src={preview.url} title={`Preview of ${item.title}`} /> : preview?.text ? <pre>{preview.text}</pre> : <span>{item.kind === 'PACKAGE' ? '⬡' : item.kind === 'DOCUMENT' ? 'Aa' : '▣'}</span>}</div><div className="media-bin-card-body"><div><span className={`media-bin-stage ${item.stage.toLowerCase()}`}>{item.stage.toLowerCase()}</span><span>{roomLabel(item.room).toLowerCase()}</span></div><h3>{item.title}</h3><code>{item.fileName}</code><p>{authorLabel} · {fileSize(item.bytes)} · {new Date(item.updatedAt).toLocaleString()}</p><footer><button onClick={() => void download(item)}>Download</button><button onClick={() => navigate(deliverableRoomPath(item))}>Open {roomLabel(item.room)} →</button></footer></div></article>; })}</div></section>; })}
    {!filtered.length && <div className="media-bin-empty"><span>▣</span><h2>{files.length ? 'No files match these filters.' : 'The first export lands here.'}</h2><p>{scope === 'MINE' ? 'Make or export something in a production room, or open All story files to see the crew’s work.' : 'Studio mixdowns, Booth takes, Blast pages, motion graphics, and finished writing will collect here.'}</p><button onClick={() => navigate('/studio')}>Make something in Studio →</button></div>}
  </section>;
}
