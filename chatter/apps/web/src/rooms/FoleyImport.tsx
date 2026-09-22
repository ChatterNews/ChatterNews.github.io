import { useEffect, useRef, useState } from 'react';
import { emptySoundAttribution, type SoundAttribution, type SoundLibraryItem } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { importSoundFile } from '../audio/sound-repository.js';
import { LoadingStatus } from '../components/LoadingStatus.js';

export const SOUND_ACCEPT = '.wav,.mp3,.m4a,.aac,.ogg,.oga,.flac,.webm,audio/*';
const extensions = /\.(wav|mp3|m4a|aac|ogg|oga|flac|webm)$/i;
const licenses = ['', 'CC0 1.0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-NC 4.0', 'CC BY-NC-SA 4.0', 'Public domain', 'Original club recording', 'Other'];
type ImportRow = { id: string; file: File; override?: SoundAttribution; state: 'WAITING' | 'SAVING' | 'SAVED' | 'ERROR'; message?: string };

export function SoundCreditFields({ value, onChange, prefix = 'Source' }: { value: SoundAttribution; onChange: (next: SoundAttribution) => void; prefix?: string }) {
  const field = (key: keyof SoundAttribution, text: string, placeholder: string) => <label>{text}<input aria-label={`${prefix} ${text}`} maxLength={key === 'notes' ? 4000 : key === 'creator' ? 300 : key === 'license' ? 200 : 2048} value={value[key]} placeholder={placeholder} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>;
  return <div className="foley-credit-fields">
    {field('creator', 'Creator / credit', 'Who made this sound?')}
    {field('sourceUrl', 'Source page', 'Paste the page where you found it')}
    <label>License<select aria-label={`${prefix} License`} value={licenses.includes(value.license) ? value.license : 'Other'} onChange={event => onChange({ ...value, license: event.target.value })}>{licenses.map(license => <option key={license} value={license}>{license || 'Not entered yet'}</option>)}</select></label>
    {(value.license === 'Other' || !licenses.includes(value.license)) && field('license', 'License name', 'Copy the license name')}
    {field('licenseUrl', 'License link', 'Optional link to the license terms')}
    {field('notes', 'Attribution notes', 'Required credit text, changes you made, or permission notes')}
  </div>;
}

export function FoleyImport({ initialFiles, onSaved, onClose, onBusy }: { initialFiles?: File[]; onSaved: (item: SoundLibraryItem) => void; onClose: () => void; onBusy?: (busy: boolean) => void }) {
  const store = useStore(); const { gate } = useGate();
  const [rows, setRows] = useState<ImportRow[]>([]); const rowsRef = useRef(rows); rowsRef.current = rows;
  const [attribution, setAttribution] = useState(emptySoundAttribution);
  const [busy, setBusy] = useState(false); const [stage, setStage] = useState(''); const [notice, setNotice] = useState('');
  const cancel = useRef<AbortController>(); const filesInput = useRef<HTMLInputElement>(null); const folderInput = useRef<HTMLInputElement>(null);
  const previousIncoming = useRef<File[]>();
  function addFiles(files: File[]) {
    const supported = files.filter(file => extensions.test(file.name) || file.type.startsWith('audio/'));
    const skipped = files.filter(file => !supported.includes(file));
    const existing = rowsRef.current;
    const capacity = Math.max(0, 200 - existing.length);
    const accepted = supported.slice(0, capacity);
    setRows([...existing, ...accepted.map(file => ({ id: crypto.randomUUID(), file, state: 'WAITING' as const }))]);
    setNotice([skipped.length ? `Not added: ${skipped.map(file => file.name).slice(0, 8).join(', ')}. Choose audio files.` : '', supported.length > capacity ? 'Import up to 200 files at a time. Remaining files were not added.' : ''].filter(Boolean).join(' '));
  }
  useEffect(() => { if (initialFiles && initialFiles !== previousIncoming.current) { previousIncoming.current = initialFiles; if (initialFiles.length) addFiles(initialFiles); } }, [initialFiles]);
  useEffect(() => () => { cancel.current?.abort(); }, []);
  const patch = (id: string, update: Partial<ImportRow>) => setRows(current => current.map(row => row.id === id ? { ...row, ...update } : row));
  async function run() {
    if (busy) return;
    const controller = new AbortController(); cancel.current = controller;
    setBusy(true); onBusy?.(true); setNotice('');
    const pending = rows.filter(row => row.state !== 'SAVED'); let done = 0;
    try {
      for (const row of pending) {
        if (controller.signal.aborted) break;
        patch(row.id, { state: 'SAVING', message: undefined }); setStage(`Importing ${++done} of ${pending.length}: ${row.file.name}`);
        try {
          const item = await importSoundFile(store, gate, row.file, row.override ?? attribution, { signal: controller.signal });
          patch(row.id, { state: 'SAVED', message: 'Saved to the library · adviser review before use' }); onSaved(item);
        } catch (error) {
          patch(row.id, { state: 'ERROR', message: error instanceof Error ? error.message : 'This file did not import. Retry it.' });
        }
      }
    } finally { setBusy(false); onBusy?.(false); setStage(''); cancel.current = undefined; }
  }
  return <section className="foley-import foley-panel" aria-label="Import sounds" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (!busy) addFiles([...event.dataTransfer.files]); }}>
    <header><div><h2>Bring your sounds</h2><p>Drop audio here, or choose files. Originals are copied into this device’s library.</p></div><button disabled={busy} onClick={onClose}>Close import</button></header>
    <div className="foley-actions"><button disabled={busy} onClick={() => filesInput.current?.click()}>Choose audio files</button><button disabled={busy} onClick={() => folderInput.current?.click()}>Choose a folder</button></div>
    <input hidden ref={filesInput} aria-label="Choose audio files" type="file" multiple accept={SOUND_ACCEPT} onChange={event => { addFiles([...event.target.files ?? []]); event.target.value = ''; }} />
    <input hidden ref={folderInput} aria-label="Choose an audio folder" type="file" multiple {...{ webkitdirectory: '' }} onChange={event => { addFiles([...event.target.files ?? []]); event.target.value = ''; }} />
    <p>WAV, MP3, M4A/AAC, OGG, FLAC and WebM. Format support depends on your browser. A failed file stays here for retry.</p>
    <fieldset disabled={busy}><legend>Credits for this batch</legend><SoundCreditFields value={attribution} onChange={setAttribution} prefix="Batch" /><p>You can fill these in now or edit them later. Check the license on each source page; importing a file does not approve its use.</p></fieldset>
    {notice && <p role="status">{notice}</p>}
    <ul className="foley-import-list">{rows.map(row => <li key={row.id}><div><strong>{row.file.webkitRelativePath || row.file.name}</strong> <small>{(row.file.size / 1024 / 1024).toFixed(1)} MB</small><p role={row.state === 'ERROR' ? 'alert' : undefined}>{row.message || (row.state === 'SAVING' ? 'Reading and saving…' : 'Ready to import')}</p></div>
      {row.state !== 'SAVED' && <><button disabled={busy} onClick={() => patch(row.id, { override: row.override ? undefined : { ...attribution } })}>{row.override ? 'Use batch credits' : 'Different credits'}</button><button disabled={busy} aria-label={`Remove ${row.file.name} from import`} onClick={() => setRows(current => current.filter(item => item.id !== row.id))}>Remove</button>{row.override && <fieldset disabled={busy}><SoundCreditFields prefix={row.file.name} value={row.override} onChange={value => patch(row.id, { override: value })} /></fieldset>}</>}
    </li>)}</ul>
    {busy && <LoadingStatus label={stage || 'Importing sounds…'} />}
    <div className="foley-actions"><button className="foley-primary" disabled={busy || !rows.some(row => row.state !== 'SAVED')} onClick={() => void run()}>{rows.some(row => row.state === 'ERROR') ? 'Retry unsaved files' : `Import ${rows.filter(row => row.state !== 'SAVED').length} sounds`}</button>{busy && <button onClick={() => cancel.current?.abort()}>Cancel remaining</button>}{rows.some(row => row.state === 'SAVED') && <span>Saved files stay in your library.</span>}</div>
  </section>;
}
