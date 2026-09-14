import { useSessionCheckpoint } from '../store/useSessionCheckpoint.js';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addReviewNote, canPublish, canReleasePodcast, checkReviewItem, countWords, finishReview, openReview,
  approveReleaseException, clearReleaseException, publishStory, REVIEW_CHECKS, reviewMediaKey, reviewProgress, storyAngleChecks, storyReleaseCard,
  releasePodcast, type Asset, type Credit, type Deliverable, type PodcastProject, type PodcastReleaseVerdict, type PublishVerdict,
  type ReleaseLaneId, type ReviewNote, type Story, type StoryReleaseCard, type StoryReview, type Take, type User,
} from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useReilyFocus, useReilyRecovery } from '../components/ReilyContextProvider.js';
import { greenLightReilyFocus } from '../components/reily-room-focus.js';
import { ReviewDocument, ReviewMedia } from './ReviewMedia.js';
import { GreenLightReleaseCard } from './GreenLightReleaseCard.js';
import { PublishingReceiptForm } from './PublishingReceiptForm.js';
import { greenLightStoryPresentation } from './greenlight-story.js';
import './Newsroom.css';
import './GreenLightPodcast.css';

export function GreenLight({ stories, adviser, me, onChanged }: {
  stories: Story[]; adviser: boolean; me?: User; onChanged: () => void;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const params = useParams();
  const [selectedId, setSelectedId] = useState<string>();
  const [reviews, setReviews] = useState<StoryReview[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, PublishVerdict>>({});
  const [credits, setCredits] = useState<Credit[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [takes, setTakes] = useState<Take[]>([]);
  const [mediaKeys, setMediaKeys] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<'REVIEW' | 'ALL' | 'READY'>('REVIEW');
  const [noteText, setNoteText] = useState('');
  const [noteCategory, setNoteCategory] = useState<ReviewNote['category']>('GENERAL');
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [podcasts, setPodcasts] = useState<PodcastProject[]>([]);
  const [podcastFiles, setPodcastFiles] = useState<Deliverable[]>([]);
  const [podcastVerdicts, setPodcastVerdicts] = useState<Record<string, PodcastReleaseVerdict>>({});
  const [podcastUrls, setPodcastUrls] = useState<Record<string, string>>({});
  const [releaseCards, setReleaseCards] = useState<Record<string, StoryReleaseCard>>({});
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);

  useSessionCheckpoint(store, async () => {
    if (busy || noteText.trim()) throw new Error('Finish the Green Light action or save your review note before finishing the session.');
  });

  useEffect(() => {
    let live = true;
    void Promise.all([
      store.reviews.list(), store.credits.list(), store.assets.list(), store.users.list(),
      Promise.all(stories.filter((story) => story.status !== 'DONE').map(async (story) => [story.id, await canPublish(store, story.id)] as const)),
      store.takes.list(),
      Promise.all(stories.filter((story) => story.status !== 'DONE').map(async (story) => [story.id, await reviewMediaKey(store, story.id)] as const)),
      store.deliverables.list(),
    ]).then(([nextReviews, nextCredits, nextAssets, nextUsers, nextVerdicts, nextTakes, nextMediaKeys, nextDeliverables]) => {
      if (!live) return;
      setReviews(nextReviews); setCredits(nextCredits); setAssets(nextAssets); setUsers(nextUsers);
      setVerdicts(Object.fromEntries(nextVerdicts));
      setTakes(nextTakes); setMediaKeys(Object.fromEntries(nextMediaKeys)); setDeliverables(nextDeliverables);
    }).catch(() => setNotice({ text: 'The review desk could not load. Press Refresh to try again.', error: true }));
    return () => { live = false; };
  }, [store, stories, revision]);

  useEffect(() => {
    let live = true;
    void Promise.all(stories.filter((story) => story.status !== 'DONE').map(async (story) => [story.id, await storyReleaseCard(store, story.id)] as const))
      .then((cards) => { if (live) setReleaseCards(Object.fromEntries(cards)); })
      .catch(() => { if (live) setNotice({ text: 'The room-by-room release checks could not load. Press Refresh to try again.', error: true }); });
    return () => { live = false; };
  }, [store, stories, revision]);

  useEffect(() => {
    let live = true; const urls: string[] = [];
    void (async () => {
      const [projects, files] = await Promise.all([store.podcastProjects.list(), store.deliverables.list()]);
      const waitingProjects = projects.filter((item) => item.state === 'REVIEW').sort((a, b) => b.updatedAt - a.updatedAt);
      const masters = files.filter((item) => item.room === 'CHATTERBOX' && item.kind === 'AUDIO' && waitingProjects.some((project) => project.id === item.sourceProjectId));
      const verdictEntries = await Promise.all(waitingProjects.map(async (project) => [project.id, await canReleasePodcast(store, project.id)] as const));
      const nextUrls: Record<string, string> = {};
      for (const file of masters) { const bytes = await store.blobs.get(file.blobHash); if (!bytes) continue; const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: file.mime })); urls.push(url); if (file.sourceProjectId) nextUrls[file.sourceProjectId] = url; }
      if (live) { setPodcasts(waitingProjects); setPodcastFiles(masters); setPodcastVerdicts(Object.fromEntries(verdictEntries)); setPodcastUrls(nextUrls); }
    })().catch(() => { if (live) setNotice({ text: 'Podcast packages could not load. Press Refresh to try again.', error: true }); });
    return () => { live = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [store, revision]);

  const active = stories.filter((story) => story.status !== 'DONE');
  const reviewFor = (story: Story) => reviews.find((review) => review.storyId === story.id);
  const readyStories = active.filter((story) => reviewFor(story)?.state === 'READY' && reviewProgress(reviewFor(story), story, mediaKeys[story.id]).ready && verdicts[story.id]?.ok && releaseCards[story.id]?.ready);
  const waiting = active.filter((story) => story.status === 'REVIEW' || story.status === 'HELD' || reviewFor(story));
  const queue = filter === 'ALL' ? active : filter === 'READY' ? readyStories : waiting;
  const story = active.find((item) => item.id === (params.storyId ?? selectedId)) ?? queue[0];
  const review = story ? reviewFor(story) : undefined;
  const progress = story ? reviewProgress(review, story, mediaKeys[story.id]) : undefined;
  const verdict = story ? verdicts[story.id] : undefined;
  const releaseCard = story ? releaseCards[story.id] : undefined;
  const storyCredits = story ? credits.filter((credit) => credit.storyId === story.id) : [];
  const chosenTake = takes.find((take) => take.id === story?.selectedTakeId);
  const chosenAssetId = chosenTake?.renderedAssetId ?? chosenTake?.assetId;
  const storyAssetIds = new Set([...storyCredits.map((credit) => credit.assetId), ...takes.filter((take) => take.storyId === story?.id).map((take) => take.renderedAssetId ?? take.assetId)]);
  for (const file of deliverables.filter((file) => file.storyId === story?.id && file.sourceAssetId)) storyAssetIds.add(file.sourceAssetId!);
  if (chosenTake?.renderedAssetId) storyAssetIds.delete(chosenTake.assetId);
  const storyAssets = assets.filter((asset) => storyAssetIds.has(asset.id)).sort((a, b) => Number(b.id === chosenAssetId) - Number(a.id === chosenAssetId));
  const reviewer = users.find((user) => user.id === review?.reviewerId);
  const presentation = story ? greenLightStoryPresentation(story) : undefined;
  useReilyFocus(greenLightReilyFocus({ selectedStory: Boolean(story), openNotes: progress?.openNotes ?? 0 }));
  useReilyRecovery(notice?.error && notice.text.includes('could not load') ? { kind: 'greenlight.load', workChanged: false } : undefined);

  async function action(work: () => Promise<unknown>, success?: string, after?: () => void) {
    setNotice(undefined); setBusy(true);
    try {
      await work();
      if (success) setNotice({ text: success, error: false });
      setRevision((value) => value + 1); onChanged();
      after?.();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'That action did not finish. Press it again to retry.', error: true });
    } finally { setBusy(false); }
  }

  async function addNote() {
    if (!story || !me) return;
    await action(async () => { await addReviewNote(store, story.id, me.id, noteText, noteCategory); setNoteText(''); }, 'Revision note added. The writer can now see exactly what needs attention.');
  }

  function selectStory(id: string) {
    setSelectedId(id); setNoteText('');
    if (params.storyId) navigate(`/greenlight/${id}`);
  }

  function selectFilter(next: typeof filter) {
    setFilter(next); setSelectedId(undefined); setNoteText('');
    if (params.storyId) navigate('/greenlight');
  }

  return <section className="view on newsroom-room greenlight-room">
    <header className="newsroom-hero">
      <div className="newsroom-hero-icon green">✓</div>
      <div><div className="newsroom-eyebrow">GREEN LIGHT</div><h1>Review</h1><p>Check the message, names, media, credits, permissions, and final presentation.</p></div>
      <div className="newsroom-hero-stats"><b>{waiting.length}<small>in review</small></b><b>{readyStories.length}<small>ready to go</small></b></div>
    </header>
    <div className="newsroom-room-nav"><button aria-pressed={filter === 'REVIEW'} onClick={() => selectFilter('REVIEW')}>Review queue <span>{waiting.length}</span></button><button aria-pressed={filter === 'ALL'} onClick={() => selectFilter('ALL')}>All in production <span>{active.length}</span></button><button aria-pressed={filter === 'READY'} onClick={() => selectFilter('READY')}>Ready for release <span>{readyStories.length}</span></button><button className="newsroom-refresh" onClick={() => { setNotice(undefined); setRevision((value) => value + 1); }}>↻ Refresh</button></div>
    {notice && <div className={`newsroom-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
    {podcasts.length > 0 && <section className="greenlight-podcast-queue"><header><div><span className="newsroom-eyebrow">CHATTERBOX HANDOFF</span><h2>Listen to the complete episode</h2><p>Check the master, story approvals, chapters, credits, opening, and ending.</p></div><b>{podcasts.length} waiting</b></header><div>{podcasts.map((podcast) => { const verdict = podcastVerdicts[podcast.id]; const file = podcastFiles.filter((item) => item.sourceProjectId === podcast.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]; return <article key={podcast.id}><div className="greenlight-podcast-art"><b>CB</b><span>EP {podcast.episodeNumber ?? '—'}</span></div><div className="greenlight-podcast-copy"><span className={`newsroom-status ${verdict?.ok ? 'ready' : 'changes'}`}>{verdict?.ok ? 'Approved for release' : `${verdict?.problems.length ?? 0} checks open`}</span><h3>{podcast.title}</h3><p>{podcast.description}</p><small>{podcast.storyIds.length} linked stories · {podcast.chapters.length} chapters · {file ? file.fileName : 'master missing'}</small>{podcastUrls[podcast.id] && <audio controls preload="metadata" src={podcastUrls[podcast.id]} />}{!verdict?.ok && <ul>{verdict?.problems.slice(0, 4).map((problem) => <li key={problem}>{problem}</li>)}</ul>}</div><div className="greenlight-podcast-actions"><button className="newsroom-button" onClick={() => navigate('/chatterbox')}>Open Chatterbox ↗</button>{!adviser && <small>An adviser uploads the checked master and records where it went.</small>}</div>{adviser && <PublishingReceiptForm title={podcast.title} busy={busy} disabled={!verdict?.ok} onSubmit={(receipt) => action(() => releasePodcast(store, podcast.id, me?.id ?? 'adviser', receipt), `${podcast.title} is recorded as published.`, () => navigate(`/reruns/podcast/${podcast.id}`))} />}</article>; })}</div></section>}
    <div className="review-workspace">
      <aside className="review-queue">
        <h2>Pick a piece</h2>
        <p>Review something you did not write when you can.</p>
        {queue.length === 0 && <div className="newsroom-empty"><b>No pieces in this view.</b><span>Open “All in production” to start a review.</span></div>}
        {queue.map((item) => {
          const itemReview = reviewFor(item); const itemProgress = reviewProgress(itemReview, item, mediaKeys[item.id]);
          return <button key={item.id} className="review-queue-card" aria-current={story?.id === item.id} onClick={() => selectStory(item.id)}>
            <span className={`newsroom-status ${itemProgress.stale || itemProgress.openNotes ? 'changes' : itemReview?.state === 'READY' ? 'ready' : ''}`}>{itemProgress.stale ? 'Changed · recheck' : itemProgress.openNotes ? 'Needs a revision' : itemReview?.state === 'READY' ? 'Crew checked' : item.status === 'HELD' ? 'Permission hold' : item.status === 'REVIEW' ? 'Ready for eyes' : 'In production'}</span>
            <b>{item.title}</b><small>{item.channels.join(' + ') || 'No channel yet'}{countWords(item.body) ? ` · ${countWords(item.body)} words` : ''}</small>
            <div className="newsroom-progress"><i style={{ width: `${itemProgress.checked / itemProgress.total * 100}%` }} /></div><small>{itemProgress.checked}/{itemProgress.total} checks{itemProgress.openNotes ? ` · ${itemProgress.openNotes} open notes` : ''}</small>
          </button>;
        })}
      </aside>
      {story ? <div className="review-main">
        <div className="review-titlebar"><div><span className="newsroom-eyebrow">REVIEWING</span><h2>{story.title}</h2><p>{reviewer ? `${reviewer.penName} is the reviewer` : 'No reviewer yet. You can be the second set of eyes.'}</p></div><button className="newsroom-button" onClick={() => navigate(presentation!.productionRoute)}>Open in {presentation!.productionRoom} ↗</button></div>
        {releaseCard && <GreenLightReleaseCard card={releaseCard} adviser={adviser} busy={busy} onNavigate={navigate} onApproveException={(laneId: ReleaseLaneId, reason: string) => action(() => approveReleaseException(store, story.id, laneId, reason, { actor: me?.id ?? 'adviser', role: 'ADVISER' }), 'Exception recorded on the release board.')} onClearException={(laneId: ReleaseLaneId) => action(() => clearReleaseException(store, story.id, laneId, { actor: me?.id ?? 'adviser', role: 'ADVISER' }), 'Exception removed. The check is open again.')} />}
        <div className="review-columns">
          <article className="review-preview"><div className="review-preview-label">{presentation!.previewLabel} <span>{countWords(story.body) ? `${countWords(story.body)} words · ${story.readTimeSec}s aloud` : presentation!.productionRoom}</span></div><h2>{story.title}</h2><div className="review-byline">By {story.bylineIds.map((id) => users.find((user) => user.id === id)?.penName ?? id).join(', ') || 'the Chatter crew'}</div>{countWords(story.body) ? <div className="review-document"><ReviewDocument node={story.body} /></div> : <div className="newsroom-empty">{presentation!.emptyMessage}</div>}<div className="review-preview-footer">Review the finished recording, artwork, or video below—not only its supporting words.</div></article>
          <aside className="review-checks"><div className="review-checks-heading"><h2>The five checks</h2><b>{progress?.checked}/5</b></div><p>Check the finished piece against the project plan and notes. Tick a box only after you have done the work.</p>
            {progress?.stale && <div className="newsroom-inline-warning">The draft changed. Start checking the new version; old checks will reset.</div>}
            {!review && <button className="newsroom-button primary" disabled={!me || busy} onClick={() => void action(() => openReview(store, story.id, me!.id), 'You have the review. Read the piece, then work through the checks.')}>Take this review</button>}
            {REVIEW_CHECKS.map((check) => <label className={`review-check ${!progress?.stale && review?.checks[check.id]?.checked ? 'checked' : ''}`} key={check.id}><input type="checkbox" checked={!progress?.stale && !!review?.checks[check.id]?.checked} disabled={!me || busy} onChange={(event) => void action(() => checkReviewItem(store, story.id, check.id, event.target.checked, me!.id))} /><span className="review-check-icon">{check.icon}</span><span><b>{check.title}</b><small>{check.prompt}</small></span></label>)}
          </aside>
        </div>
        {story.brief && <details className="review-reporting-file"><summary>Project notes · {story.brief.sources.length} source{story.brief.sources.length === 1 ? '' : 's'} · {story.brief.questions.filter((item) => item.answered).length}/{story.brief.questions.length} questions answered</summary><div><div className="review-angle-file">{storyAngleChecks(story.brief).map((check) => <p key={check.id} className={check.complete ? 'complete' : ''}><span>{check.complete ? '✓' : '○'}</span><span><b>{check.label}</b><small>{check.value || check.prompt}</small></span></p>)}</div>{story.brief.sources.map((source) => <article key={source.id}><b>{source.name || 'Unnamed source'} <small>· {source.state === 'CONFIRMED' ? 'notes checked' : source.state === 'CONTACTED' ? 'contacted / read' : 'not contacted yet'}</small></b>{source.role && <p>{source.role}</p>}{source.notes && <blockquote>{source.notes}</blockquote>}{source.quotes && <blockquote>Exact quote: “{source.quotes}”</blockquote>}</article>)}<button className="newsroom-button" onClick={() => navigate(`/slate/${story.id}`)}>Open full project plan ↗</button></div></details>}
        {chosenTake && <div className="newsroom-notice">★ Chosen take: {chosenTake.name || 'Booth recording'}. {chosenTake.renderedAssetId ? 'Its prepared edit is the first media preview below.' : 'The original recording is the first media preview below.'} <button className="newsroom-button" onClick={() => navigate(`/booth/${story.id}`)}>Open in Booth ↗</button></div>}
        <ReviewMedia assets={storyAssets} />
        <section className="review-notes"><div className="review-section-heading"><h2>Revision notes</h2><span>{progress?.openNotes ?? 0} open</span></div><p>Be specific: what needs changing, where, and why. A useful note helps the next person finish.</p>
          {review?.notes.map((note) => <div className={`review-note ${note.resolved ? 'resolved' : ''}`} key={note.id}><div><span className="newsroom-status">{note.category.toLowerCase()}</span><small>{users.find((user) => user.id === note.authorId)?.penName ?? 'Crew member'} · {new Date(note.createdAt).toLocaleDateString()}</small><p>{note.text}</p></div><button disabled={busy} onClick={() => void action(() => store.reviews.update(review.id, { notes: review.notes.map((item) => item.id === note.id ? { ...item, resolved: !item.resolved } : item), state: 'REVIEWING' }))}>{note.resolved ? '↶ Reopen' : '✓ Resolved'}</button></div>)}
          {!review?.notes.length && <div className="review-note-empty">No notes yet. If something needs work, leave a clear next step.</div>}
          <div className="review-note-composer"><select aria-label="Note category" value={noteCategory} onChange={(event) => setNoteCategory(event.target.value as ReviewNote['category'])}><option value="GENERAL">General</option><option value="FACT">Fact check</option><option value="CLARITY">Clarity</option><option value="MEDIA">Media / permissions</option></select><textarea aria-label="Revision note" value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Example: The headline says Friday, but the interview says Thursday. Check the date with the organizer." /><button className="newsroom-button" disabled={!me || busy || !noteText.trim()} onClick={() => void addNote()}>Add note</button></div>
        </section>
        <section className="review-release"><div className="review-section-heading"><h2>Credits and release</h2><span className={`newsroom-status ${releaseCard?.ready && verdict?.ok ? 'ready' : 'changes'}`}>{releaseCard?.ready && verdict?.ok ? 'Release board clear' : 'Checks still open'}</span></div>
          <div className="review-credit-list"><b>Credits attached to this piece</b>{storyCredits.length ? storyCredits.map((credit) => { const asset = assets.find((item) => item.id === credit.assetId); return <span key={credit.id}>{asset?.kind.toLowerCase() ?? 'media'} · {asset?.creator ?? 'Chatter crew'} · {asset?.license ?? 'OWN'} · {asset?.gateStatus === 'APPROVED' ? 'checked' : 'waiting'}</span>; }) : <span>No borrowed media is linked to this story.</span>}</div>
          <div className="review-handoff"><div><b>{review?.state === 'READY' && progress?.ready && verdict?.ok && releaseCard?.ready ? 'Approved for release' : 'Ready to hand it off?'}</b><p>{adviser ? 'Download the finished files, publish them with the usual school account, then add the receipt.' : 'Finish the five checks and resolve the notes. The release board shows what every room still owes.'}</p></div><button className="newsroom-button primary" disabled={!me || busy || !progress?.ready} onClick={() => void action(() => finishReview(store, story.id, me!.id), 'Crew review complete. This piece is approved for its final release check.')}>✓ Complete crew review</button>{adviser && presentation!.genericPublishingReceipt && <PublishingReceiptForm title={story.title} busy={busy} disabled={review?.state !== 'READY' || !progress?.ready || !verdict?.ok || !releaseCard?.ready} onSubmit={(receipt) => action(() => publishStory(store, story.id, { actor: me?.id ?? 'adviser', role: 'ADVISER', receipt }), `${story.title} is recorded as published.`, () => navigate(`/reruns/${story.id}`))} />}</div>
        </section>
      </div> : <div className="newsroom-empty"><h2>{filter === 'READY' ? 'No pieces are ready for release yet.' : 'Nothing waiting on a review.'}</h2><p>{active.length ? 'Pick a piece in production to read it and start its review.' : 'Claim a story in the Slate and make something worth sharing.'}</p><button className="newsroom-button primary" onClick={() => active.length ? selectFilter('ALL') : navigate('/slate')}>{active.length ? 'Browse pieces in production' : 'Go to the Slate'}</button></div>}
    </div>
    {adviser && <p className="newsroom-local-note">Permissions, quarantined media and the records live at the <b>Front Desk</b> now — one home each, instead of three.</p>}
    <p className="newsroom-local-note">Final check: names, numbers, quotes, permissions, credits, captions, opening, and ending. Then save the story drive before handoff.</p>
  </section>;
}
