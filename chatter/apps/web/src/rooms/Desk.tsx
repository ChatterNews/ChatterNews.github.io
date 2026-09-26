import { ControlIcon } from '../components/ControlIcon.js';
import { groupWritingContent } from '../group/group-writing.js';
import { RoomIcon } from '../components/RoomIcon.js';
import { useSessionCheckpoint } from '../store/useSessionCheckpoint.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { advanceStoryWorkflow, countWords, prosePlainText, readTimeSec, recordRole, saveDeliverable, storyAngleChecks, storyPath, type CrewTask, type GroupRevision, type ProseNode, type Story, type StoryReview, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { GroupCompare } from '../group/GroupCompare.js';
import { GroupWork, groupEditingPath } from '../group/GroupWork.js';
import { captureGroupRevision, openGroupRevision } from '../group/group-work.js';
import { Icon } from '../components/Sprite.js';
import { PictureBox } from '../components/PictureBox.js';
import { useReilyFocus, useReilyRecovery } from '../components/ReilyContextProvider.js';
import { deskReilyFocus } from '../components/reily-room-focus.js';
import { deskBeatPrompt, deskDelivery, deskRecommendedShape, deskShape, deskShapeFromDocument, deskShapeTemplate, deskStoryCheck, deskTargetSeconds, type DeskShape } from './desk-model.js';
import { DeskRoutePicker, DeskStoryCheck } from './DeskStoryGuide.js';
import { sourceQuoteContent } from './desk-proof.js';
import './Desk.css';

type SaveState = 'SAVED' | 'DIRTY' | 'SAVING' | 'ERROR';
type SideTab = 'CHECK' | 'BRIEF' | 'REPORTING' | 'REVIEW';

const DeskBeatAttributes = Extension.create({
  name: 'deskBeatAttributes',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'blockquote'],
      attributes: {
        deskBeat: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-desk-beat'),
          renderHTML: (attributes) => {
            const beat = attributes.deskBeat;
            const shape = attributes.deskShape;
            if (typeof beat !== 'string') return {};
            const label = typeof shape === 'string' ? deskShape(shape as DeskShape).beats.find((item) => item.id === beat)?.label : undefined;
            return { 'data-desk-beat': beat, ...(label ? { 'data-desk-label': label } : {}) };
          },
        },
        deskShape: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-desk-shape'),
          renderHTML: (attributes) => typeof attributes.deskShape === 'string' ? { 'data-desk-shape': attributes.deskShape } : {},
        },
        proofSourceId: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-proof-source'),
          renderHTML: (attributes) => typeof attributes.proofSourceId === 'string' ? { 'data-proof-source': attributes.proofSourceId } : {},
        },
      },
    }];
  },
});

export function Desk({ stories, me, onChanged }: { stories: Story[]; me?: User; onChanged: () => void }) {
  const { storyId } = useParams(); const navigate = useNavigate(); const store = useStore(); const { gate } = useGate();
  const [searchParams] = useSearchParams(); const compareRequested = searchParams.get('compare') === '1';
  const story = (storyId ? stories.find((item) => item.id === storyId) : stories.find((item) => item.status === 'WORK')) ?? stories.find((item) => item.status !== 'DONE') ?? stories[0];
  const [saveState, setSaveState] = useState<SaveState>('SAVED'); const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [picking, setPicking] = useState(false); const [sideTab, setSideTab] = useState<SideTab>('CHECK'); const [focus, setFocus] = useState(false);
  const [review, setReview] = useState<StoryReview>(); const [tasks, setTasks] = useState<CrewTask[]>([]); const [stats, setStats] = useState({ words: 0, characters: 0 });
  const [busy, setBusy] = useState(false); const saveTimer = useRef<number>();
  const [comparing, setComparing] = useState(compareRequested); const [compareBusy, setCompareBusy] = useState(false);
  const [groupRevisions, setGroupRevisions] = useState<GroupRevision[]>([]); const [groupRefresh, setGroupRefresh] = useState(0);
  const joined = story?.group?.kind === 'joined';
  const canEditGroup = !story?.group || Boolean(me && (story.ownerId === me.id || me.role === 'ADVISER'));
  const canInsertGroup = Boolean(story?.group?.kind === 'main' && canEditGroup);
  useReilyFocus(deskReilyFocus(focus ? undefined : sideTab));
  useReilyRecovery(saveState === 'ERROR' ? { kind: 'desk.save', workChanged: false } : undefined);

  useEffect(() => { let live = true; void Promise.all([store.reviews.list(), store.crewTasks.list()]).then(([reviews, nextTasks]) => { if (!live) return; setReview(reviews.find((item) => item.storyId === story?.id)); setTasks(nextTasks.filter((item) => item.storyId === story?.id)); }).catch(() => { if (live) setNotice({ text: 'The story handoffs could not load. Your draft is still here; press Retry when you are ready.', error: true }); }); return () => { live = false; }; }, [store, story?.id, story?.updatedAt]);

  useEffect(() => {
    let live = true;
    if (!story?.group) { setGroupRevisions([]); return; }
    const code = story.group.code;
    void store.groupRevisions.list().then(rows => { if (live) setGroupRevisions(rows.filter(row => row.groupCode === code)); }).catch(() => { if (live) setNotice({ text: 'The collected writing could not load. Reopen the story to try again.', error: true }); });
    return () => { live = false; };
  }, [store, story?.id, story?.group?.code, story?.updatedAt, groupRefresh]);
  useEffect(() => { setComparing(compareRequested); }, [story?.id, compareRequested]);

  const editor = useEditor({
    extensions: [StarterKit, DeskBeatAttributes, Image.configure({ inline: false }), Placeholder.configure({ showOnlyCurrent: false, includeChildren: true, placeholder: ({ node }) => deskBeatPrompt(node.attrs.deskShape as DeskShape | undefined, node.attrs.deskBeat) ?? 'Start with what the audience most needs to know…' })],
    editorProps: { handleClickOn: (view, _pos, node, nodePos, _event, direct) => { if (!direct || node.type.name !== 'paragraph' || !node.attrs.deskBeat || node.content.size) return false; view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nodePos + 1))); view.focus(); return true; } },
    content: (story?.body as any) ?? { type: 'doc', content: [] },
    editable: story?.status !== 'DONE' && !joined && canEditGroup,
    onUpdate: ({ editor: instance }) => { const text = instance.getText(); setStats({ words: countWords(instance.getJSON() as ProseNode), characters: text.length }); setSaveState('DIRTY'); },
  }, [story?.id]);

  useEffect(() => { editor?.setEditable(story?.status !== 'DONE' && !joined && canEditGroup && !compareBusy, false); }, [editor, story?.status, joined, canEditGroup, compareBusy]);

  useEffect(() => {
    if (!editor) return;
    const text = editor.getText();
    setStats({ words: countWords(editor.getJSON() as ProseNode), characters: text.length });
  }, [editor, story?.id]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!story || !editor || story.status === 'DONE' || story.group?.kind === 'joined' || !canEditGroup || saveState === 'SAVED') return true;
    window.clearTimeout(saveTimer.current); setSaveState('SAVING');
    try { await store.stories.update(story.id, { body: editor.getJSON() as ProseNode }); if (me) await recordRole(store, { userId: me.id, storyId: story.id, role: 'write' }); setSaveState('SAVED'); onChanged(); return true; }
    catch (error) { setSaveState('ERROR'); setNotice({ text: `${error instanceof Error ? error.message : 'The draft did not save.'} Your words remain in this tab. Press Retry save.`, error: true }); return false; }
  }, [story, editor, saveState, store, me, onChanged, canEditGroup]);

  useEffect(() => { if (saveState !== 'DIRTY') return; window.clearTimeout(saveTimer.current); saveTimer.current = window.setTimeout(() => void save(), 700); return () => window.clearTimeout(saveTimer.current); }, [saveState, save]);
  useEffect(() => { const keyboard = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); } }; window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard); }, [save]);

  useSessionCheckpoint(store, async () => {
    if (busy) throw new Error('Wait for the Desk handoff to finish, then retry.');
    if (!await save()) throw new Error('The Desk draft did not save. Close Story Drive and retry the draft save.');
  });

  const doc = (editor?.getJSON() as ProseNode | undefined) ?? story?.body;
  const activeShape = useMemo(() => deskShapeFromDocument(doc), [doc, stats.words]);
  const recommendedShape = story ? deskRecommendedShape(story) : 'UPDATE';
  const storyChecks = story && doc ? deskStoryCheck(story, doc) : [];
  const seconds = readTimeSec(stats.words); const target = story ? deskTargetSeconds(story) : { min: 45, max: 90 };
  const delivery = story ? deskDelivery(story) : undefined; const unresolved = review?.notes.filter((note) => !note.resolved) ?? [];
  const writerTask = tasks.find((task) => task.role === 'write');
  const angleChecks = storyAngleChecks(story?.brief);

  async function handoff() {
    if (!story || !editor || busy || compareBusy || !canEditGroup) return; setBusy(true); setNotice(undefined);
    try {
      const body = editor.getJSON() as ProseNode; if (!countWords(body)) throw new Error('Write the piece before handing it to the next person.');
      window.clearTimeout(saveTimer.current); await store.stories.update(story.id, { body });
      const words = [story.title, me?.penName ? `By ${me.penName}` : '', story.brief?.angle ?? '', prosePlainText(body)].filter(Boolean).join('\n\n');
      await saveDeliverable(store, { bytes: new TextEncoder().encode(words), title: `${story.title} · writing copy`, fileName: `${story.slug}-writing.txt`, kind: 'DOCUMENT', room: 'DESK', stage: 'REVIEW', mime: 'text/plain', storyId: story.id, authorId: me?.id });
      const handed = await advanceStoryWorkflow(store, story.id, delivery?.stepId ?? 'check');
      if (me) await recordRole(store, { userId: me.id, storyId: story.id, role: 'write' }); setSaveState('SAVED'); onChanged(); navigate(storyPath(handed));
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'The handoff did not save. Press the handoff button again.', error: true }); }
    finally { setBusy(false); }
  }

  async function exportWriting() {
    if (!story || !editor) return; setBusy(true); setNotice(undefined);
    try { const body = editor.getJSON() as ProseNode; if (!countWords(body)) throw new Error('Write something before saving a copy.'); if (!await save()) throw new Error('Save the draft before exporting the copy.'); const text = [story.title, me?.penName ? `By ${me.penName}` : '', story.brief?.angle ?? '', prosePlainText(body)].filter(Boolean).join('\n\n'); const bytes = new TextEncoder().encode(text); await saveDeliverable(store, { bytes, title: `${story.title} · writing copy`, fileName: `${story.slug}-writing.txt`, kind: 'DOCUMENT', room: 'DESK', stage: 'WORKING', mime: 'text/plain', storyId: story.id, authorId: me?.id }); const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = `${story.slug}-writing.txt`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice({ text: 'Writing copy saved to the Media Bin and downloaded.', error: false }); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'The writing copy did not save. Try again.', error: true }); }
    finally { setBusy(false); }
  }

  async function changeStory(id: string) { if (await save()) navigate(`/desk/${id}`); }
  function applyShape(shape: DeskShape) { if (!editor || !story || !canEditGroup || compareBusy) return; if (stats.words && !window.confirm('Switch story routes? Your current draft will be replaced after the next save.')) return; editor.commands.setContent(deskShapeTemplate(shape)); setSideTab('CHECK'); setSaveState('DIRTY'); }
  function insertQuote(source: NonNullable<Story['brief']>['sources'][number]) { if (!editor || !source.quotes.trim() || !canEditGroup || compareBusy) return; editor.chain().focus().insertContent(sourceQuoteContent(source)).run(); }

  function groupChanged() { setGroupRefresh(value => value + 1); onChanged(); }
  function groupWritingChanged(updated: Story) {
    if (updated.id === story?.id && editor) {
      window.clearTimeout(saveTimer.current);
      editor.commands.setContent(updated.body, false);
      setStats({ words: countWords(updated.body), characters: editor.getText().length });
      setSaveState('SAVED');
    }
    groupChanged();
  }
  async function insertGroupWriting(revision: GroupRevision, selectedText?: string) {
    if (!story?.group || !editor || !canInsertGroup || compareBusy || busy) return;
    if (revision.groupCode !== story.group.code) return;
    const cursor = { from: editor.state.selection.from, to: editor.state.selection.to };
    setCompareBusy(true); setNotice(undefined);
    try {
      if (!await save()) return;
      await captureGroupRevision(store, story.id);
      const current = await store.stories.get(story.id);
      if (!current?.group) throw new Error('Reopen the group draft before adding writing.');
      let content = selectedText === undefined ? groupWritingContent(revision.body) : [{ type: 'paragraph', content: [{ type: 'text', text: selectedText }] }];
      if (!content.length) throw new Error('This piece has no writing to add. Open its editable copy to use its media.');
      try { editor.schema.nodeFromJSON({ type: 'doc', content }).check(); }
      catch { content = [{ type: 'paragraph', content: [{ type: 'text', text: selectedText ?? prosePlainText(revision.body) }] }]; }
      // Keep attribution with the draft; it remains editable context even after Undo or rewriting.
      await store.stories.update(story.id, { group: { ...current.group, usedRevisionIds: [...new Set([...(current.group.usedRevisionIds ?? []), revision.id])] } });
      editor.chain().focus().insertContentAt(cursor, content).run();
      setSaveState('DIRTY'); groupChanged();
      setNotice({ text: `Added writing from ${revision.authorName}. Undo removes the inserted words; the source stays available.`, error: false });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'The writing could not be added. Your draft and the source are still here.', error: true }); }
    finally { setCompareBusy(false); }
  }
  async function openGroupWriting(revision: GroupRevision) {
    if (!me || compareBusy || busy) return;
    setCompareBusy(true); setNotice(undefined);
    try {
      if (!await save()) return;
      const copy = await openGroupRevision(store, gate, revision.id, me);
      groupChanged(); navigate(groupEditingPath(copy));
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'The editable copy could not open. The source is still here.', error: true }); }
    finally { setCompareBusy(false); }
  }

  if (!story) return <section className="view on newsroom-room desk-room"><div className="newsroom-empty"><h1>The first draft starts with a story.</h1><p>Pitch one question in Slate. The reporter can gather notes, then a writer can take it from there.</p><button className="newsroom-button primary" onClick={() => navigate('/slate')}>Pitch a story ↗</button></div></section>;
  if (story.status === 'DONE') return <section className="view on newsroom-room desk-room"><div className="newsroom-empty"><span className="desk-published-mark">✓</span><h1>This edition is published.</h1><p>The public record stays frozen. Start a follow-up in Reruns instead of quietly changing what readers already saw.</p><button className="newsroom-button primary" onClick={() => navigate(`/reruns/${story.id}`)}>Read the published story ↗</button></div></section>;

  return <section className={`view on newsroom-room desk-room ${focus && !comparing ? 'desk-focus' : ''} ${comparing ? 'desk-comparing' : ''}`}>
    <header className="newsroom-hero desk-hero"><div className="newsroom-hero-icon"><RoomIcon kind="typewriter" /></div><div><span className="newsroom-eyebrow">DESK</span><h1>Writing and editing</h1><p>Draft the words, use the project notes, and prepare the handoff.</p></div><label className="desk-story-picker">Story<select aria-label="Writing story" value={story.id} onChange={(event) => void changeStory(event.target.value)}>{stories.filter((item) => item.status !== 'DONE').map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></header>
    {notice && <div className={`newsroom-notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span>{notice.error && <button className="newsroom-button" onClick={() => void save()}>Retry save</button>}{!notice.error && <button className="newsroom-button" onClick={() => navigate('/files')}>Open Media Bin →</button>}<button aria-label="Dismiss message" onClick={() => setNotice(undefined)}>×</button></div>}

    <GroupWork story={story} me={me} onChanged={groupChanged} onWritingChanged={groupWritingChanged} onCompare={() => { setComparing(value => !value); setFocus(false); }} />
    {joined ? <div className="newsroom-empty desk-group-waiting"><h2>Your group’s writing belongs here.</h2><p>Make your own piece above, or collect a group draft from USB. Choose “Use writing as main” on collected writing to start combining everyone’s work.</p>
      {comparing && <GroupCompare revisions={groupRevisions} onInsert={() => {}} onOpen={revision => void openGroupWriting(revision)} busy={compareBusy || !me} canInsert={false} />}
    </div> : <>

    <div className="desk-status-strip"><div><span className={`newsroom-status ${unresolved.length ? 'changes' : ''}`}>{unresolved.length ? `${unresolved.length} revision note${unresolved.length === 1 ? '' : 's'}` : story.status === 'REVIEW' ? 'In review' : 'Drafting'}</span><b>{story.title}</b></div><div className="desk-format-chips">{story.channels.map((channel) => <span key={channel}>{channel}</span>)}</div><div><small>{writerTask?.state === 'DONE' ? 'Writer handoff finished' : writerTask ? 'Writer job active' : 'Open collaboration'}</small><button onClick={() => navigate(`/crew?story=${story.id}`)}>Crew & handoffs →</button></div></div>

    <div className="desk-shell">
      {comparing && <aside className="desk-group-sources"><div className="desk-compare-actions"><button type="button" className="newsroom-button" onClick={() => setComparing(false)}>Back to writing tools</button><button type="button" className="newsroom-button" onClick={() => setGroupRefresh(value => value + 1)}>Refresh collected writing</button></div><GroupCompare revisions={groupRevisions} onInsert={(revision, selectedText) => void insertGroupWriting(revision, selectedText)} onOpen={revision => void openGroupWriting(revision)} busy={compareBusy || busy || !me} canInsert={canInsertGroup} /></aside>}
      {!focus && !comparing && <aside className="desk-outline"><DeskRoutePicker selected={activeShape} recommended={recommendedShape} disabled={!canEditGroup || compareBusy} onChoose={applyShape} /></aside>}

      <main className="desk-paper"><fieldset disabled={!canEditGroup || compareBusy} className="desk-toolbar" role="toolbar" aria-label="Writing tools">
        <button aria-label="Undo" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><ControlIcon kind="undo" /></button><button aria-label="Redo" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><ControlIcon kind="redo" /></button><i />
        <button aria-label="Bold" aria-pressed={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><b>B</b></button><button aria-label="Italic" aria-pressed={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button><button aria-label="Strike" aria-pressed={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}><s>S</s></button><i />
        <button aria-label="Heading" aria-pressed={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button><button aria-label="Quote" aria-pressed={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>“”</button><button aria-label="Bullet list" aria-pressed={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</button><button aria-label="Numbered list" aria-pressed={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1. List</button><button aria-label="Divider" onClick={() => editor?.chain().focus().setHorizontalRule().run()}>―</button>
        <button aria-label="Add picture" onClick={() => setPicking(true)}><Icon name="ic-pic" /> Picture</button><span /><button aria-label="Focus mode" aria-pressed={focus} onClick={() => { setComparing(false); setFocus((value) => !value); }}>{focus ? 'Exit focus' : 'Focus'}</button>
      </fieldset><div className="desk-page-heading"><span>{story.channels.some((channel) => ['pod', 'segment', 'video'].includes(channel)) ? 'SCRIPT DRAFT' : 'STORY DRAFT'}</span><h1>{story.title}</h1><p>{story.brief?.angle || 'No direction yet. What should the audience understand, notice, or feel?'}</p></div><EditorContent editor={editor} className="desk-editor" /><footer className="desk-page-footer"><span>{stats.words} words</span><span>{stats.characters} characters</span><span>about {seconds}s aloud</span><div className={`desk-length ${seconds > target.max ? 'over' : seconds >= target.min ? 'good' : ''}`}><i style={{ width: `${Math.min(100, seconds / target.max * 100)}%` }} /></div><b>{seconds < target.min ? `Build toward ${target.min}–${target.max}s` : seconds > target.max ? `Trim toward ${target.max}s` : 'In the target range'}</b><span className={`desk-save ${saveState.toLowerCase()}`}>{saveState === 'SAVED' ? '✓ Saved' : saveState === 'SAVING' ? 'Saving…' : saveState === 'ERROR' ? 'Save failed' : 'Unsaved'}</span></footer></main>

      {!focus && !comparing && <aside className="desk-sidebar"><nav>{(['CHECK', 'BRIEF', 'REPORTING', 'REVIEW'] as SideTab[]).map((tab) => <button key={tab} aria-pressed={sideTab === tab} onClick={() => setSideTab(tab)}>{tab.toLowerCase()}</button>)}</nav>{sideTab === 'CHECK' && <DeskStoryCheck checks={storyChecks} hasRoute={Boolean(activeShape)} />}{sideTab === 'BRIEF' && <div className="desk-side-panel"><span className="newsroom-eyebrow">WRITER BRIEF</span><h2>{story.brief?.angle || 'The angle is not set yet.'}</h2><div className="desk-angle-handoff">{angleChecks.map((check) => <p key={check.id} className={check.complete ? 'complete' : ''}><span>{check.complete ? '✓' : '○'}</span><span><b>{check.label}</b><small>{check.value || check.prompt}</small></span></p>)}</div><p><b>Audience</b>{story.brief?.audience || 'Our school community'}</p><p><b>Deadline</b>{story.dueAt ? new Date(story.dueAt).toLocaleDateString() : 'No deadline yet'}</p><p><b>Production note</b>{story.brief?.productionNotes || 'No note from the producer.'}</p><button onClick={() => navigate(`/slate/${story.id}`)}>Open full story plan →</button></div>}{sideTab === 'REPORTING' && <div className="desk-side-panel"><span className="newsroom-eyebrow">USE THE PROJECT NOTES</span>{story.brief?.sources.length ? story.brief.sources.map((source) => <article key={source.id}><b>{source.name || 'Unnamed source'}</b><small>{source.role || source.state.toLowerCase().replace('_', ' ')}</small>{source.notes && <p>{source.notes}</p>}{source.quotes && <><blockquote>“{source.quotes}”</blockquote><button onClick={() => insertQuote(source)}>Insert linked quote</button></>}</article>) : <div className="newsroom-empty"><b>No source material in the project notes yet.</b><button onClick={() => navigate(`/slate/${story.id}`)}>Add project notes</button></div>}</div>}{sideTab === 'REVIEW' && <div className="desk-side-panel"><span className="newsroom-eyebrow">REVISION NOTES</span>{unresolved.length ? unresolved.map((note) => <article key={note.id} className="desk-review-note"><small>{note.category.toLowerCase()}</small><p>{note.text}</p><button onClick={() => navigate(`/greenlight/${story.id}`)}>Open in review</button></article>) : <div className="desk-clear-review"><b>Nothing is blocking the writing.</b><p>When an editor leaves a note, it stays here until the crew resolves it in Green Light.</p></div>}</div>}</aside>}
    </div>

    <section className="desk-handoff"><div><span className="newsroom-eyebrow">YOUR HANDOFF</span><h2>{delivery?.label}</h2><p>{delivery?.explanation} Do one read-aloud pass before you send it.</p></div><div><button disabled={busy || !stats.words} onClick={() => void exportWriting()} className="newsroom-button">Save .txt copy</button><button disabled={busy || compareBusy || !canEditGroup || !stats.words} onClick={() => void handoff()} className="newsroom-button primary">{busy ? 'Saving handoff…' : `${delivery?.label} →`}</button></div></section>

    </>}
    {picking && <PictureBox storyId={story.id} me={me} onClose={() => setPicking(false)} onPicked={(src, credit) => { editor?.chain().focus().setImage({ src, alt: credit }).run(); setPicking(false); }} />}
  </section>;
}
