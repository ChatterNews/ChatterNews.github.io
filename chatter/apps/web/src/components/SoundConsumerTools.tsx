import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { PodcastProject, ShowtimeProject } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { SoundPicker } from './SoundPicker.js';
import { appendSoundCredits, linkSoundUsage, makeSoundRequest, placePodcastSound, placeShowtimeSound, readSoundRequest, resolveSound, soundConsumerReturnTo, soundCreditsBlock, soundDestinationFingerprint, soundEditUrl, type SoundRequest } from '../audio/sound-handoff.js';

type Consumer = ShowtimeProject | PodcastProject;
export function SoundConsumerTools<T extends Consumer>(props: {
  project: T; kind: 'STINGER' | 'CHATTERBOX'; at: number; trackId?: string; selectedClipId?: string;
  busy?: boolean; onFlush: () => Promise<void>; onReload: () => Promise<unknown>;
  onCommit: (recipe: (draft: T) => void) => void; onNotice: (notice: { text: string; error?: boolean }) => void;
}) {
  const store = useStore(); const navigate = useNavigate(); const [search, setSearch] = useSearchParams();
  const latest = useRef(props); latest.current = props;
  const [picker, setPicker] = useState<SoundRequest>(); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [credits, setCredits] = useState<string>(); const creditsDialog = useRef<HTMLDialogElement>(null);
  const incoming = readSoundRequest(search.get('soundRequest')); const incomingItem = search.get('soundItem');
  const pending = incoming && incomingItem && incoming.projectId === props.project.id ? incoming : undefined;
  const selected = props.project.clips.find(clip => clip.id === props.selectedClipId);
  const tracks = (props.project.tracks ?? []).filter(track => !('role' in track) || track.kind === 'AUDIO' && !track.locked);
  const defaultTrack = tracks.find(track => track.id === props.trackId)?.id ?? tracks.find(track => 'kind' in track && track.kind === 'SFX')?.id ?? tracks.find(track => track.id === 'a3')?.id ?? tracks[0]?.id ?? '';
  const locked = !!props.busy || busy;
  function clearIncoming() { const next = new URLSearchParams(search); next.delete('soundRequest'); next.delete('soundItem'); setSearch(next, { replace: true }); }
  async function guarded(action: () => Promise<void>, rethrow = false) {
    if (busyRef.current || latest.current.busy) return; busyRef.current = true; setBusy(true);
    try { await action(); } catch (error) { latest.current.onNotice({ text: error instanceof Error ? error.message : 'The sound operation did not finish. Retry when ready.', error: true }); if (rethrow) throw error; }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function openPicker() { await guarded(async () => { await latest.current.onFlush(); setPicker(makeSoundRequest(latest.current.project, defaultTrack, latest.current.at)); }); }
  async function openFoley(trackId: string, edit = false) {
    await guarded(async () => {
      await latest.current.onFlush();
      const project = latest.current.project;
      const clip = edit ? project.clips.find(row => row.id === latest.current.selectedClipId) : undefined;
      const request = makeSoundRequest(project, clip?.trackId ?? trackId, clip?.startSec ?? latest.current.at, clip?.id);
      navigate(soundEditUrl(soundConsumerReturnTo(latest.current.kind, request), clip));
    }, true);
  }
  async function choose(itemId: string, request: SoundRequest) {
    await guarded(async () => {
      await latest.current.onFlush();
      const sound = await resolveSound(store, itemId);
      const current = latest.current.project;
      const saved = latest.current.kind === 'STINGER' ? await store.showtimeProjects.get(request.projectId) : await store.podcastProjects.get(request.projectId);
      if (!saved || soundDestinationFingerprint(saved) !== soundDestinationFingerprint(current)) throw new Error('This project changed in another tab. Reopen it and choose the sound placement again.');
      const old = current.clips.find(clip => clip.id === request.replaceClipId);
      let acceptShorter = false;
      if (old && sound.item.duration < old.trimOutSec) {
        acceptShorter = window.confirm(`Replace only “${old.name}”? Its source ends at ${old.trimOutSec.toFixed(2)} seconds; the new sound ends at ${sound.item.duration.toFixed(2)} seconds. This use will become shorter and leave a gap. Its timeline position stays unchanged.`);
        if (!acceptShorter) return;
      }
      const place = (project: T): T => (latest.current.kind === 'STINGER' ? placeShowtimeSound(project as ShowtimeProject, sound, request, acceptShorter) : placePodcastSound(project as PodcastProject, sound, request, acceptShorter)) as T;
      // Validate before writing usage links; validate again within the editor's own Undo operation.
      place(current);
      await linkSoundUsage(store, sound, current);
      latest.current.onCommit(draft => Object.assign(draft, place(draft)));
      await latest.current.onFlush();
      await latest.current.onReload();
      setPicker(undefined); if (incoming?.id === request.id) clearIncoming();
      latest.current.onNotice({ text: `${sound.item.name} ${request.replaceClipId ? 'replaced this use' : 'placed at the playhead'}. Add sound credits to include its members and sources.` });
    }, true);
  }
  return <div className="sound-handoff-bar">
    <button disabled={locked || !defaultTrack} onClick={() => void openPicker()}>Add sound</button>
    {selected?.soundRevisionId && <button disabled={locked} onClick={() => void openFoley(selected.trackId ?? defaultTrack, true).catch(() => {})}>Edit sound</button>}
    {props.project.clips.some(clip => clip.soundItemId || clip.soundRevisionId) && <button disabled={locked} onClick={() => void guarded(async () => { const block = await soundCreditsBlock(store, latest.current.project); setCredits(block); requestAnimationFrame(() => creditsDialog.current?.showModal()); })}>Add sound credits</button>}
    {pending && <><span>A saved sound is ready for this edit.</span><button disabled={locked} onClick={() => void choose(incomingItem!, pending).catch(() => {})}>{props.project.clips.some(clip => clip.soundRequestId === pending.id) ? 'Retry saving sound' : pending.replaceClipId ? 'Replace this use' : 'Place saved sound'}</button><button disabled={locked} onClick={() => { clearIncoming(); void openPicker(); }}>Choose placement again</button></>}
    {picker && <SoundPicker tracks={tracks} initialTrackId={picker.trackId} busy={locked} onClose={() => setPicker(undefined)} onOpenFoley={trackId => openFoley(trackId)} onChoose={(itemId, trackId) => choose(itemId, { ...picker, trackId })} />}
    {credits !== undefined && <dialog className="sound-picker" ref={creditsDialog} onCancel={() => setCredits(undefined)} aria-label="Preview sound credits"><h2>Sound credits to add</h2><p>Your existing credits stay as written. Update video end cards explicitly after adding these.</p><div className="sound-credits-preview">{credits || 'No sound credits found.'}</div><footer><button disabled={!credits} onClick={() => { latest.current.onCommit(draft => { draft.credits = appendSoundCredits(draft.credits, credits); }); setCredits(undefined); }}>Append to {props.kind === 'STINGER' ? 'project' : 'episode'} credits</button><button onClick={() => setCredits(undefined)}>Cancel</button></footer></dialog>}
  </div>;
}
