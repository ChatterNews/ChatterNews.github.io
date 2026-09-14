import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  clock, deliverableBytes, editionReflectionKey, followUpStoryDraft, plainText, reflectionProgress, saveEditionReflection, searchEverything, storyPath,
  type Asset, type Deliverable, type Episode, type Hit, type PodcastProject, type PublishedStorySnapshot,
  type ReflectionDraft, type Story, type Take, type User,
} from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { Icon } from '../components/Sprite.js';
import { ReviewDocument, ReviewMedia } from './ReviewMedia.js';
import { RerunsReplayCard } from './RerunsReplayCard.js';
import './Newsroom.css';
import './Reruns.css';
import './RerunsReplay.css';
import './RerunsOverrides.css';
import './RerunsPodcast.css';

type ArchiveFilter = 'ALL' | 'WEB' | 'AUDIO' | 'VIDEO';
const EMPTY_REFLECTION: ReflectionDraft = { worked: '', audience: '', change: '' };

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function editionFor(storyId: string, episodes: Episode[]): { episode?: Episode; snapshot?: PublishedStorySnapshot } {
  for (const episode of episodes) {
    const snapshot = episode.stories?.find((item) => item.storyId === storyId);
    if (snapshot || episode.storyIds.includes(storyId)) return { episode, snapshot };
  }
  return {};
}

function channelKind(channel: string): Exclude<ArchiveFilter, 'ALL'> {
  if (['pod', 'podcast', 'audio', 'radio'].includes(channel.toLowerCase())) return 'AUDIO';
  if (['segment', 'video', 'showtime'].includes(channel.toLowerCase())) return 'VIDEO';
  return 'WEB';
}

function PublicationRecord({ episode, users }: { episode: Episode; users: User[] }) {
  if (!episode.receipt) return null;
  const adviser = users.find((user) => user.id === episode.receipt?.adviserId)?.penName ?? 'Adviser';
  const destinations = episode.receipt.destinations.filter((destination) => /^https?:\/\//i.test(destination.url));
  return <section className="reruns-publication-record"><span className="newsroom-eyebrow">PUBLISHING RECEIPT</span><div>{destinations.map((destination) => <a key={`${destination.platform}-${destination.url}`} href={import.meta.env.VITE_ORBIT_WEB === 'true' ? undefined : destination.url} target="_blank" rel="noreferrer"><b>{destination.platform}</b><small>{destination.url.replace(/^https?:\/\//, '')}</small>{import.meta.env.VITE_ORBIT_WEB !== 'true' && <i>↗</i>}</a>)}</div><p>Recorded by {adviser} · {new Date(episode.receipt.publishedAt).toLocaleDateString()}</p>{episode.receipt.note && <blockquote>{episode.receipt.note}</blockquote>}</section>;
}

export function Reruns({ stories, me }: { stories: Story[]; me?: User }) {
  const store = useStore(); const navigate = useNavigate(); const { storyId, projectId } = useParams();
  const [query, setQuery] = useState(''); const [hits, setHits] = useState<Hit[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]); const [users, setUsers] = useState<User[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]); const [takes, setTakes] = useState<Take[]>([]);
  const [podcastProjects, setPodcastProjects] = useState<PodcastProject[]>([]); const [deliverables, setDeliverables] = useState<Deliverable[]>([]); const [podcastUrl, setPodcastUrl] = useState('');
  const [filter, setFilter] = useState<ArchiveFilter>('ALL'); const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [reflection, setReflection] = useState<ReflectionDraft>(EMPTY_REFLECTION);

  useEffect(() => { let live = true; void Promise.all([store.episodes.list(), store.users.list(), store.assets.list(), store.takes.list(), store.podcastProjects.list(), store.deliverables.list()]).then(([nextEpisodes, nextUsers, nextAssets, nextTakes, nextPodcasts, nextDeliverables]) => { if (!live) return; setEpisodes(nextEpisodes.sort((a, b) => b.publishedAt - a.publishedAt)); setUsers(nextUsers); setAssets(nextAssets); setTakes(nextTakes); setPodcastProjects(nextPodcasts); setDeliverables(nextDeliverables); }).catch(() => { if (live) setNotice({ text: 'The archive did not load. Press Retry to take another run at it.', error: true }); }); return () => { live = false; }; }, [store]);
  useEffect(() => { let live = true; void searchEverything(store, query).then((found) => { if (live) setHits(found); }).catch(() => { if (live) setNotice({ text: 'Search stopped before it finished. Your work is safe; press Search again.', error: true }); }); return () => { live = false; }; }, [store, query]);

  const current = stories.find((story) => story.id === storyId); const edition = storyId ? editionFor(storyId, episodes) : {};
  const snapshot = edition.snapshot ?? (current?.status === 'DONE' ? { storyId: current.id, title: current.title, slug: current.slug, channels: current.channels, body: current.body, readTimeSec: current.readTimeSec, ...(current.durationSec !== undefined ? { durationSec: current.durationSec } : {}), bylines: current.bylineIds.map((id) => users.find((user) => user.id === id)?.penName ?? id), ...(current.brief?.angle ? { angle: current.brief.angle } : {}) } : undefined);
  const linkedAssetIds = useMemo(() => new Set(takes.filter((take) => take.storyId === storyId).flatMap((take) => [take.assetId, ...(take.renderedAssetId ? [take.renderedAssetId] : [])])), [takes, storyId]);
  const storyMedia = assets.filter((asset) => linkedAssetIds.has(asset.id));
  const published = stories.filter((story) => story.status === 'DONE');
  const archiveRows = episodes.flatMap((episode) => episode.storyIds.map((id) => ({ episode, story: stories.find((item) => item.id === id), snapshot: episode.stories?.find((item) => item.storyId === id) }))).filter((row) => filter === 'ALL' || channelKind(row.episode.channel) === filter);
  const inProgress = stories.filter((story) => story.status !== 'DONE').sort((a, b) => b.updatedAt - a.updatedAt);
  const podcastEpisode = projectId ? episodes.find((item) => item.podcastProjectId === projectId) : undefined; const podcastProject = projectId ? podcastProjects.find((item) => item.id === projectId) : undefined; const podcastMaster = podcastEpisode?.audioDeliverableId ? deliverables.find((item) => item.id === podcastEpisode.audioDeliverableId) : deliverables.filter((item) => item.sourceProjectId === projectId && item.kind === 'AUDIO').sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const podcastEditions = episodes.filter((item) => item.podcastProjectId && (filter === 'ALL' || filter === 'AUDIO'));

  useEffect(() => {
    if (!storyId || !edition.episode) { setReflection(EMPTY_REFLECTION); return; }
    const saved = edition.episode.reflections?.[editionReflectionKey({ storyId })];
    setReflection(saved ? { worked: saved.worked, audience: saved.audience, change: saved.change } : EMPTY_REFLECTION);
  }, [storyId, edition.episode?.id, edition.episode?.updatedAt]);

  useEffect(() => { let url = ''; let live = true; setPodcastUrl(''); if (!podcastMaster) return; void deliverableBytes(store, podcastMaster).then((bytes) => { if (!live) return; url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: podcastMaster.mime })); setPodcastUrl(url); }).catch(() => { if (live) setNotice({ text: 'The episode master is missing. Restore the story drive copy or rebuild the package.', error: true }); }); return () => { live = false; if (url) URL.revokeObjectURL(url); }; }, [store, podcastMaster?.id, podcastMaster?.blobHash]);

  async function makeFollowUp() {
    if (!storyId || !snapshot || busy) return; setBusy(true); setNotice(undefined);
    try {
      if (edition.episode && reflectionProgress(reflection)) {
        const updated = await saveEditionReflection(store, edition.episode.id, editionReflectionKey({ storyId: snapshot.storyId }), reflection, me?.id);
        setEpisodes((items) => items.map((item) => item.id === updated.id ? updated : item));
      }
      const created = await store.stories.create(followUpStoryDraft(snapshot, reflection, me?.id));
      navigate(`/slate/${created.id}`);
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'The follow-up could not be created. Press the button again.', error: true }); }
    finally { setBusy(false); }
  }

  async function saveReflection() {
    if (!storyId || !edition.episode || busy) return; setBusy(true); setNotice(undefined);
    try {
      const updated = await saveEditionReflection(store, edition.episode.id, editionReflectionKey({ storyId }), reflection, me?.id);
      setEpisodes((items) => items.map((item) => item.id === updated.id ? updated : item));
      setNotice({ text: reflectionProgress(reflection) ? 'Replay notes saved with this edition.' : 'Replay notes cleared.', error: false });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'The replay notes did not save. Press Save again.', error: true }); }
    finally { setBusy(false); }
  }

  async function downloadMaster() { if (!podcastMaster) return; try { const bytes = await deliverableBytes(store, podcastMaster); const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: podcastMaster.mime })); const link = document.createElement('a'); link.href = url; link.download = podcastMaster.fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'The master could not be downloaded.', error: true }); } }

  if (projectId) {
    if (!podcastEpisode || !podcastProject) return <section className="view on newsroom-room reruns-room"><div className="newsroom-empty"><span className="reruns-vault">◖))</span><h1>Episode not released</h1><p>Finish its package and Green Light review before it enters the archive.</p><button className="newsroom-button primary" onClick={() => navigate('/chatterbox')}>Open Chatterbox →</button></div></section>;
    const publishedAt = new Date(podcastEpisode.publishedAt);
    return <section className="view on newsroom-room reruns-room reruns-podcast-reader"><header className="reruns-reader-bar"><button onClick={() => navigate('/reruns')}>← All editions</button><div><span>CHATTERBOX PODCAST</span><b>{publishedAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b></div><button onClick={() => window.print()}>Print episode sheet</button></header>{notice && <div className={`newsroom-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}<div className="reruns-podcast-stage"><main><div className="reruns-podcast-cover"><b>CB</b><span>EP {podcastProject.episodeNumber ?? '—'}</span><i>CHATTERBOX</i></div><span className="newsroom-eyebrow">{podcastProject.episodeType} EPISODE</span><h1>{podcastEpisode.title}</h1><p>{podcastEpisode.description}</p>{podcastUrl ? <audio controls preload="metadata" src={podcastUrl} /> : <div className="newsroom-notice">Loading the listening master…</div>}<div className="reruns-podcast-player-meta"><span>{podcastMaster?.durationSec ? clock(podcastMaster.durationSec) : 'Full episode'}</span><span>{podcastEpisode.chapters?.length ?? 0} chapters</span><span>{podcastEpisode.storyIds.length} linked stories</span></div><PublicationRecord episode={podcastEpisode} users={users} /></main><aside><span className="newsroom-eyebrow">CHAPTERS</span><ol>{podcastEpisode.chapters?.map((chapter) => <li key={chapter.id}><button onClick={() => { const player = document.querySelector<HTMLAudioElement>('.reruns-podcast-stage audio'); if (player) { player.currentTime = chapter.atSec; void player.play(); } }}><b>{clock(chapter.atSec)}</b><span>{chapter.title}</span><i>▶</i></button></li>)}</ol><hr/><b>Stories in this episode</b>{podcastEpisode.storyIds.map((id) => { const linked = stories.find((item) => item.id === id); return <button className="reruns-podcast-story" key={id} onClick={() => navigate(`/reruns/${id}`)}>{linked?.title ?? 'Story from another drive'} <span>→</span></button>; })}<button className="newsroom-button primary" disabled={!podcastMaster} onClick={() => void downloadMaster()}>Download listening master</button></aside></div></section>;
  }

  if (storyId) {
    if (!snapshot || !edition.episode) return <section className="view on newsroom-room reruns-room"><div className="newsroom-empty"><span className="reruns-vault">↺</span><h1>Story not published</h1><p>{current ? 'This story is still in production.' : 'Open the story’s USB file, then check the archive again.'}</p><button className="newsroom-button primary" onClick={() => current ? navigate(storyPath(current)) : navigate('/reruns')}>{current ? 'Continue the story' : 'Back to Reruns'} →</button></div></section>;
    const publishedAt = new Date(edition.episode.publishedAt);
    return <section className="view on newsroom-room reruns-room reruns-reader">
      <header className="reruns-reader-bar"><button onClick={() => navigate('/reruns')}>← All editions</button><div><span>PUBLISHED EDITION</span><b>{publishedAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b></div><button onClick={() => window.print()}>Print / save PDF</button></header>
      {notice && <div className={`newsroom-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span><button aria-label="Dismiss message" onClick={() => setNotice(undefined)}>×</button></div>}
      <div className="reruns-edition-grid"><article className="reruns-paper"><div className="reruns-kicker"><span>{edition.episode.channel}</span><span>{snapshot.readTimeSec ? `${Math.max(1, Math.round(snapshot.readTimeSec / 60))} min read` : 'Chatter News'}</span></div><h1>{snapshot.title}</h1>{snapshot.angle && <p className="reruns-dek">{snapshot.angle}</p>}<p className="reruns-byline">By {snapshot.bylines.length ? snapshot.bylines.join(', ') : 'Chatter Newsroom'}</p><div className="reruns-story-body"><ReviewDocument node={snapshot.body} /></div></article><aside className="reruns-edition-tools"><span className="newsroom-eyebrow">PUBLISHED COPY</span><h2>This version cannot be edited</h2><p>Read it as the audience received it. Put corrections and new developments into the next story.</p><button className="newsroom-button primary" onClick={() => document.getElementById('reruns-replay-notes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Open replay notes ↓</button><button className="newsroom-button" onClick={() => downloadText(`${snapshot.slug}.txt`, `${snapshot.title}\nBy ${snapshot.bylines.join(', ') || 'Chatter Newsroom'}\nPublished ${publishedAt.toLocaleDateString()}\n\n${plainText(snapshot.body)}`)}>Download readable text</button><hr /><b>Edition details</b><dl><div><dt>Channel</dt><dd>{edition.episode.channel}</dd></div><div><dt>Published</dt><dd>{publishedAt.toLocaleString()}</dd></div><div><dt>Story ID</dt><dd>{snapshot.storyId.slice(0, 8)}</dd></div></dl><PublicationRecord episode={edition.episode} users={users} /></aside><div id="reruns-replay-notes"><RerunsReplayCard editionTitle={snapshot.title} value={reflection} onChange={setReflection} onSave={() => void saveReflection()} onNext={() => void makeFollowUp()} nextLabel="Start the next story" busy={busy} /></div></div>
      <ReviewMedia assets={storyMedia} />
    </section>;
  }

  return <section className="view on newsroom-room reruns-room">
    <header className="newsroom-hero reruns-hero"><div className="newsroom-hero-icon">↺</div><div><span className="newsroom-eyebrow">RERUNS</span><h1>Published archive</h1><p>Search headlines, interviews, scripts, and published editions.</p></div><div className="reruns-score"><b>{episodes.length}</b><span>editions</span><b>{published.length}</b><span>published stories</span></div></header>
    {notice && <div className={`newsroom-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span>{notice.error && <button className="newsroom-button" onClick={() => window.location.reload()}>Retry</button>}<button aria-label="Dismiss message" onClick={() => setNotice(undefined)}>×</button></div>}
    <div className="reruns-search"><Icon name="ic-search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a headline, a draft, or something somebody said…" aria-label="Search the archive and tape" /><kbd>⌘ K</kbd></div>
    {query.trim() && <section className="reruns-results"><div className="newsroom-section-heading"><div><span className="newsroom-eyebrow">SEARCH RESULTS</span><h2>{hits.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : 'No match yet'}</h2></div><button onClick={() => setQuery('')}>Clear search</button></div>{hits.length ? <div className="reruns-result-list">{hits.map((hit) => { const found = stories.find((story) => story.id === hit.storyId); return <button key={hit.storyId} onClick={() => found && navigate(found.status === 'DONE' ? `/reruns/${found.id}` : storyPath(found))}><span>{hit.where}</span><div><b>{hit.title}</b><p>{hit.snippet}</p></div><i>{found?.status === 'DONE' ? 'Read edition' : 'Continue work'} →</i></button>; })}</div> : <div className="newsroom-empty"><b>Try a name, topic, or exact phrase.</b><p>Recorded words appear here after the take has a transcript.</p></div>}</section>}
    <section className="reruns-library"><div className="newsroom-section-heading"><div><span className="newsroom-eyebrow">ARCHIVE</span><h2>Published editions</h2></div><nav>{(['ALL', 'WEB', 'AUDIO', 'VIDEO'] as ArchiveFilter[]).map((item) => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item.toLowerCase()}</button>)}</nav></div>{archiveRows.length || podcastEditions.length ? <div className="reruns-card-grid">{podcastEditions.map((episode) => <button key={episode.id} onClick={() => navigate(`/reruns/podcast/${episode.podcastProjectId}`)}><div className="reruns-card-art audio podcast"><span>◖))</span><small>podcast</small></div><div><small>{new Date(episode.publishedAt).toLocaleDateString()}</small><h3>{episode.title}</h3><p>{episode.description || 'Chatterbox Podcast episode'}</p><span>Listen to episode →</span></div></button>)}{archiveRows.filter(({ episode }) => !episode.podcastProjectId).map(({ episode, story, snapshot: item }) => <button key={`${episode.id}-${story?.id ?? item?.storyId}`} onClick={() => navigate(`/reruns/${story?.id ?? item?.storyId}`)}><div className={`reruns-card-art ${channelKind(episode.channel).toLowerCase()}`}><span>{channelKind(episode.channel) === 'AUDIO' ? '◖))' : channelKind(episode.channel) === 'VIDEO' ? '▶' : 'Aa'}</span><small>{episode.channel}</small></div><div><small>{new Date(episode.publishedAt).toLocaleDateString()}</small><h3>{item?.title ?? story?.title ?? episode.title}</h3><p>{item?.angle || story?.brief?.angle || 'Chatter News edition'}</p><span>Open edition →</span></div></button>)}</div> : <div className="newsroom-empty"><span className="reruns-vault">↺</span><h3>{episodes.length ? 'No editions match this filter.' : 'No published editions yet.'}</h3><p>{episodes.length ? 'Choose All to see everything the club has published.' : 'A released story or podcast will appear here after Green Light.'}</p><button className="newsroom-button primary" onClick={() => navigate('/greenlight')}>Go to Green Light →</button></div>}</section>
    <section className="reruns-active"><div><span className="newsroom-eyebrow">IN PRODUCTION</span><h2>Current stories</h2><p>Each story opens at its next production step.</p></div><div>{inProgress.slice(0, 6).map((story) => <button key={story.id} onClick={() => navigate(storyPath(story))}><span className={`newsroom-status ${story.status.toLowerCase()}`}>{story.status.toLowerCase()}</span><b>{story.title}</b><small>Updated {new Date(story.updatedAt).toLocaleDateString()}</small><i>Continue →</i></button>)}{!inProgress.length && <p>No stories are currently in production.</p>}<button className="newsroom-button primary" onClick={() => navigate('/slate')}>New story →</button></div></section>
  </section>;
}
