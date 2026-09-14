import { finishSession, writeVerifiedFile, type StoryFileHandle, type SessionDirectory } from '../portable/finish-session.js';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { storyPath, type Story } from '@chatter/shared';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { exportPortableStory } from '../portable/portable-project.js';
import { desktopDirectory, desktopStoryFileName, getDesktopDrive } from '../portable/desktop-drive.js';
import { getReaderDrive, isMobileEdition, isWebsiteEdition, returnToReader } from '../portable/reader-drive.js';
import { downloadMobileFile, offerMobileFile, prepareMobileSession } from '../portable/mobile-session.js';
import { projectDrivePortalTarget, shouldDismissProjectDrive } from './project-drive-dialog.js';
import { StoryDriveOpen } from './StoryDriveOpen.js';
import './ProjectDrive.css';
import './ProjectDriveOverrides.css';

type Message = { text: string; error: boolean };
type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<StoryFileHandle>;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProjectDrive({ stories, story, onChanged }: { stories: Story[]; story?: Story; onChanged: () => void }) {
  const store = useStore(); const { gate } = useGate(); const navigate = useNavigate();
  const desktop = getDesktopDrive();
  const reader = getReaderDrive();
  const mobile = isMobileEdition();
  const website = isWebsiteEdition();
  const downloadSession = website && !(window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  const [preparedFile, setPreparedFile] = useState<File>();
  const saveFolder = desktop ? desktopDirectory(desktop) : reader?.directory;
  const [finishedHere, setFinishedHere] = useState(false);
  const [open, setOpen] = useState(false); const [selectedId, setSelectedId] = useState(story?.id ?? stories[0]?.id ?? '');
  const [busy, setBusy] = useState<'SAVE' | 'FINISH' | 'OPEN'>(); const [message, setMessage] = useState<Message>();
  const operation = useRef(false);
  const dialog = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState('');
  useEffect(() => { if (story?.id) setSelectedId(story.id); }, [story?.id]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const previousInert = root?.inert ?? false;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (root) root.inert = true;
    dialog.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // Room keyboard shortcuts must not edit the snapshot behind this dialog.
      event.stopImmediatePropagation();
      if (event.key === 'Escape' && !operation.current) { event.preventDefault(); setOpen(false); }
      if (event.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])];
        const first = controls[0]; const last = controls.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (operation.current) { event.preventDefault(); event.returnValue = ''; }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      if (root) root.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      previousFocus?.focus();
    };
  }, [open]);
  const selected = stories.find((item) => item.id === selectedId) ?? story;

  async function save() {
    if (!selected || operation.current) return; operation.current = true; setBusy('SAVE'); setMessage(undefined); setFinishedHere(false); setPreparedFile(undefined);
    try {
      if (mobile) {
        const result = await exportPortableStory(store, selected);
        setPreparedFile(new File([result.blob], result.fileName, { type: 'application/zip' }));
        setMessage({ text: 'Your story file is ready. Tap Save to Files and choose your Chatter News folder.', error: false });
        return;
      }
      const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
      const nativeName = saveFolder ? desktopStoryFileName(selected.slug) : undefined;
      const handle = saveFolder ? await saveFolder.getFileHandle(nativeName!, { create: true }) : picker ? await picker({ suggestedName: `${selected.slug}.chatter`, types: [{ description: 'Chatter portable story', accept: { 'application/zip': ['.chatter'] } }] }) : undefined;
      const result = await exportPortableStory(store, selected);
      if (handle) await writeVerifiedFile(handle, result.blob);
      else download(result.blob, result.fileName);
      setMessage({ text: saveFolder ? `Saved and verified in Chatter News: ${nativeName}. This copy contains the selected story.` : handle ? `Saved and verified: ${result.fileName}. This copy contains the selected story.` : `Download started: ${result.fileName}. Orbit cannot verify where this download was saved. Keep it in Chatter News and check it before leaving.`, error: false }); onChanged();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setMessage({ text: 'Save cancelled. The session is still open.', error: false });
      else setMessage({ text: error instanceof Error ? error.message : 'The USB copy did not save. Press Save USB copy to retry.', error: true });
    } finally { operation.current = false; setBusy(undefined); }
  }

  async function finish(downloadOnly = false) {
    if (operation.current) return;
    operation.current = true; setBusy('FINISH'); setMessage(undefined); setFinishedHere(false); setPreparedFile(undefined); setProgress(mobile || downloadSession ? 'Preparing your session file…' : saveFolder ? 'Preparing your Chatter News folder…' : website ? 'Choose a local or USB folder…' : 'Choose a folder on your USB…');
    let folderSelected = false;
    try {
      if (mobile || downloadSession || (website && downloadOnly)) {
        const result = await prepareMobileSession(store, setProgress);
        setPreparedFile(result.file);
        setMessage({ text: `${result.stories} stories are packed and ready. ${website ? "Choose Download file" : "Tap Save to Files"}, then check the file in Chatter News. It has not been saved there yet.`, error: false });
        return;
      }
      const picker = (window as unknown as { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<SessionDirectory> }).showDirectoryPicker;
      if (!saveFolder && !picker) throw new Error('This browser cannot verify a session folder. Use Chrome with folder access allowed for Orbit.');
      const destination = saveFolder ?? await picker!({ mode: 'readwrite' });
      folderSelected = true;
      const result = await finishSession(store, destination, setProgress);
      setMessage({ text: `Session packed! ${result.files.length} stories saved and verified in ${destination.name}/${result.folderName}. Close Orbit, then eject a USB drive in Files or Finder. New edits after this snapshot need another save.`, error: false });
      setFinishedHere(Boolean(reader));
      onChanged();
    } catch (error) {
      if (!folderSelected && error instanceof DOMException && error.name === 'AbortError') setMessage({ text: 'Folder selection cancelled. Session is still open.', error: false });
      else setMessage({ text: `${error instanceof Error ? error.message : 'The session could not be saved.'} Session not finished. Keep Orbit open; any partial folder can stay until a retry succeeds.`, error: true });
    } finally { operation.current = false; setBusy(undefined); setProgress(''); }
  }

  async function savePrepared(method: 'share' | 'download' = 'share') {
    if (!preparedFile || operation.current) return;
    operation.current = true; setBusy('SAVE');
    try {
      const outcome = website || method === 'download' ? downloadMobileFile(preparedFile) : await offerMobileFile(preparedFile);
      setMessage({ text: outcome === 'shared' ? 'The share sheet has closed. Check that your file appears in Files before leaving. Orbit cannot verify that destination.' : 'Download started. Check your browser’s downloads and move the file into Chatter News before leaving. Orbit cannot verify the downloaded copy.', error: false });
    } catch (error) {
      setMessage({ text: error instanceof DOMException && error.name === 'AbortError' ? 'Save cancelled. Your prepared file is still here; try Save to Files again.' : error instanceof Error ? error.message : 'The file was not handed off. Try again.', error: !(error instanceof DOMException && error.name === 'AbortError') });
    } finally { operation.current = false; setBusy(undefined); }
  }

  return <div className="project-drive">
    <button className="project-drive-trigger" onClick={() => { setMessage(undefined); setFinishedHere(false); setPreparedFile(undefined); setOpen(true); }}><span>{saveFolder || mobile || website ? 'FILES' : 'USB'}</span><b>{story?.portableId ? 'Story file linked' : 'Story drive'}</b></button>
    {open && createPortal(<div className="project-drive-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && shouldDismissProjectDrive('BACKDROP')) setOpen(false); }}><section ref={dialog} tabIndex={-1} className="project-drive-dialog" role="dialog" aria-modal="true" aria-labelledby="drive-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="project-drive-icon">↥</span><div><small>STORY DRIVE</small><h2 id="drive-title">Open or save a story</h2></div></div><button aria-label="Close story files" disabled={!!busy} onClick={() => { if (!busy && shouldDismissProjectDrive('CLOSE_BUTTON')) setOpen(false); }}>×</button></header>
      <div className="project-drive-explain"><b>Use one .chatter file for each story.</b><p>{website ? 'Choose a local or USB folder named Chatter News. Save before leaving; browser recovery is not a handoff file.' : mobile ? 'Prepare a story or session, then use Save to Files. Choose or create a Chatter News folder in Files.' : saveFolder ? 'Your saves go in the Chatter News folder beside Start Orbit. Finish session before switching computers.' : 'Save it to the USB before switching computers or ejecting the drive.'}</p><ol><li>Open the story file.</li><li>Do your assigned work.</li><li>{website ? 'Save and check the saved copy.' : mobile ? 'Save to Files and check the saved copy.' : 'Save, close, and eject.'}</li></ol></div>
      {message && <div className={`project-drive-message ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}><span>{message.text}</span>{reader && finishedHere && !message.error && <button onClick={returnToReader}>Return to the reader</button>}<button aria-label="Dismiss message" onClick={() => setMessage(undefined)}>×</button></div>}
      <div className="project-drive-actions"><article><span>1</span><div><h3>Open the story</h3><p>{website ? 'Choose a local .chatter file. Unpack a session ZIP first to find its stories.' : mobile ? 'Choose a .chatter story in Files. To open a session ZIP, first tap it in Files to unpack the stories.' : 'Choose the .chatter file on the USB.'} The reporting, source media, crew notes, Media Bin exports, layouts, reviews, and published edition travel together.</p><StoryDriveOpen store={store} gate={gate} label="Choose .chatter file" disabled={!!busy} onBusyChange={(value) => { operation.current = value; setBusy(value ? 'OPEN' : undefined); }} onMessage={setMessage} onOpened={(result) => { onChanged(); setSelectedId(result.story.id); navigate(storyPath(result.story)); }} /></div></article><article><span>2</span><div><h3>Save the handoff</h3>{stories.length ? <label>Story<select disabled={!!busy} value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)}>{stories.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status.toLowerCase()}</option>)}</select></label> : <p>Pitch a story in Slate before making its portable file.</p>}<button className="primary" disabled={!selected || !!busy} onClick={() => void save()}>{busy === 'SAVE' ? 'Packing the story…' : mobile ? 'Prepare story file' : saveFolder || website ? 'Save story' : 'Save to USB'}</button></div></article></div>
      <section className="project-drive-finish"><div><h3>All packed for the next mission?</h3><p>{downloadSession ? 'Finish session prepares a ZIP with every story and a receipt. Then choose Download file and check the copy in Downloads.' : mobile ? 'Finish session prepares a ZIP with every story and a receipt. You must then choose Save to Files.' : <>Finish session packs every story on this desk into a new folder {saveFolder ? 'inside Chatter News' : website ? 'in your chosen local or USB folder' : 'on your USB'}, checks the files, and adds a session receipt.</>} Projects must be linked to a story. Earlier session folders stay intact.</p></div><button className="primary" disabled={!stories.length || !!busy} onClick={() => void finish()}>{busy === 'FINISH' ? 'Packing your session…' : 'Finish session'}</button>{website && !downloadSession && <button disabled={!stories.length || !!busy} onClick={() => void finish(true)}>Download session ZIP</button>}{progress && <p role="status">{progress}</p>}</section>
      {preparedFile && <section className="project-drive-finish" aria-label="Prepared file"><div><h3>{website ? 'Ready to download' : 'Ready for Files'}</h3><p>{preparedFile.name}</p><p>{website ? 'Download this file, then check your Downloads folder. Keep the copy in Chatter News before closing Orbit.' : 'Choose Save to Files in the share sheet, then open Files and check the saved copy. If sharing is unavailable, use Download file and check Downloads.'}</p></div>{!website && <button className="primary" disabled={!!busy} onClick={() => void savePrepared()}>Save to Files</button>}<button disabled={!!busy} onClick={() => void savePrepared('download')}>Download file</button></section>}
      <footer><b>{mobile || website ? 'Before leaving' : 'Safe unplug checklist'}</b><span>{website ? 'Save → check the copy in Chatter News → close Orbit.' : mobile ? 'Prepare → Save to Files → check the file in Chatter News.' : saveFolder ? 'Verify → close Orbit → eject the USB in Files or Finder.' : 'Verify → close Orbit → stop the USB launcher if used → eject in Files.'}</span></footer>
    </section></div>, projectDrivePortalTarget(document))}
  </div>;
}
