import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import {
  loadSavedSampleFolder,
  sampleEntriesFromFiles,
  sampleFolderPermission,
  saveSampleFolder,
  scanSampleDirectory,
  searchSampleEntries,
  type SampleLibraryEntry,
  type SampleLibraryScan,
} from '../audio/sample-library.js';
import './SampleShelf.css';

type FolderPickerWindow = Window & {
  showDirectoryPicker?(options?: { mode?: 'read' }): Promise<FileSystemDirectoryHandle>;
};

export interface SampleShelfProps {
  open: boolean;
  onClose(): void;
  onAddToTimeline(entry: SampleLibraryEntry): Promise<void>;
  onLoadSampler(entry: SampleLibraryEntry): Promise<void>;
}

export interface SampleShelfViewProps {
  scan?: SampleLibraryScan;
  query: string;
  category: string;
  loading: boolean;
  error?: string;
  reconnectName?: string;
  previewingId?: string;
  busyId?: string;
  supportsLinkedFolder?: boolean;
  onQueryChange(value: string): void;
  onCategoryChange(value: string): void;
  onClose(): void;
  onConnect(): void | Promise<void>;
  onRefresh(): void | Promise<void>;
  onChooseSnapshot(): void;
  onPreview(entry: SampleLibraryEntry): void | Promise<void>;
  onAddToTimeline(entry: SampleLibraryEntry): void | Promise<void>;
  onLoadSampler(entry: SampleLibraryEntry): void | Promise<void>;
}

export function SampleShelf({ open, onClose, onAddToTimeline, onLoadSampler }: SampleShelfProps) {
  const [scan, setScan] = useState<SampleLibraryScan>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reconnectName, setReconnectName] = useState<string>();
  const [previewingId, setPreviewingId] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const linkedHandle = useRef<FileSystemDirectoryHandle>();
  const snapshotInput = useRef<HTMLInputElement>(null);
  const previewAudio = useRef<HTMLAudioElement>();
  const previewUrl = useRef<string>();
  const supportsLinkedFolder = typeof (window as FolderPickerWindow).showDirectoryPicker === 'function';

  function stopPreview() {
    previewAudio.current?.pause();
    previewAudio.current = undefined;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = undefined;
    setPreviewingId(undefined);
  }

  async function readHandle(handle: FileSystemDirectoryHandle) {
    setLoading(true);
    setError(undefined);
    try {
      const next = await scanSampleDirectory(handle);
      linkedHandle.current = handle;
      setScan(next);
      setReconnectName(undefined);
      setCategory((current) => current === 'ALL' || next.categories.includes(current) ? current : 'ALL');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Studio could not read this sample folder.');
    } finally {
      setLoading(false);
    }
  }

  async function restoreFolder() {
    setLoading(true);
    try {
      const saved = await loadSavedSampleFolder();
      if (!saved) {
        setLoading(false);
        return;
      }
      linkedHandle.current = saved;
      const permission = await sampleFolderPermission(saved);
      if (permission !== 'granted') {
        setReconnectName(saved.name);
        setError(`Studio needs permission to read ${saved.name}.`);
        setLoading(false);
        return;
      }
      await readHandle(saved);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Studio could not restore the sample folder.');
      setLoading(false);
    }
  }

  useEffect(() => {
    void restoreFolder();
    return stopPreview;
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => {
      const handle = linkedHandle.current;
      if (!handle || busyId) return;
      void sampleFolderPermission(handle).then((permission) => {
        if (permission === 'granted') void readHandle(handle);
      });
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [busyId]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (open && event.key === 'Escape' && !busyId) onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [busyId, onClose, open]);

  useEffect(() => {
    if (!open) stopPreview();
  }, [open]);

  async function connect() {
    setError(undefined);
    const existing = linkedHandle.current;
    if (reconnectName && existing) {
      const permission = await sampleFolderPermission(existing, true);
      if (permission === 'granted') {
        await readHandle(existing);
        return;
      }
    }
    const picker = (window as FolderPickerWindow).showDirectoryPicker;
    if (!picker) {
      snapshotInput.current?.click();
      return;
    }
    try {
      const handle = await picker.call(window, { mode: 'read' });
      await saveSampleFolder(handle);
      await readHandle(handle);
    } catch (problem) {
      if (problem instanceof DOMException && problem.name === 'AbortError') return;
      setError(problem instanceof Error ? problem.message : 'Studio could not connect that folder.');
    }
  }

  async function refresh() {
    setError(undefined);
    const handle = linkedHandle.current;
    if (!handle) {
      snapshotInput.current?.click();
      return;
    }
    const permission = await sampleFolderPermission(handle);
    if (permission !== 'granted') {
      setReconnectName(handle.name);
      setError(`Studio needs permission to read ${handle.name}.`);
      return;
    }
    await readHandle(handle);
  }

  function chooseSnapshot() {
    snapshotInput.current?.click();
  }

  function acceptSnapshot(files: FileList | null) {
    if (!files?.length) return;
    stopPreview();
    try {
      const next = sampleEntriesFromFiles(files);
      linkedHandle.current = undefined;
      setScan(next);
      setError(undefined);
      setReconnectName(undefined);
      setCategory('ALL');
      setLoading(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Studio could not read those sounds.');
    }
  }

  async function preview(entry: SampleLibraryEntry) {
    if (previewingId === entry.id) {
      stopPreview();
      return;
    }
    stopPreview();
    try {
      const file = await entry.getFile();
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      previewUrl.current = url;
      previewAudio.current = audio;
      audio.addEventListener('ended', stopPreview, { once: true });
      audio.addEventListener('error', () => {
        stopPreview();
        setError(`${entry.name} could not play in this browser.`);
      }, { once: true });
      setPreviewingId(entry.id);
      await audio.play();
    } catch (problem) {
      stopPreview();
      setError(problem instanceof Error ? problem.message : `${entry.name} could not play.`);
    }
  }

  async function use(entry: SampleLibraryEntry, action: (item: SampleLibraryEntry) => Promise<void>) {
    stopPreview();
    setBusyId(entry.id);
    setError(undefined);
    try {
      await action(entry);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : `${entry.name} could not be added.`);
    } finally {
      setBusyId(undefined);
    }
  }

  const folderInputProps: InputHTMLAttributes<HTMLInputElement> & { webkitdirectory: string } = {
    type: 'file', multiple: true, accept: 'audio/*,.wav,.mp3,.m4a,.aac,.ogg,.oga,.flac,.webm',
    webkitdirectory: '',
  };

  if (!open) return null;
  return createPortal(<>
    <input
      {...folderInputProps}
      ref={snapshotInput}
      className="sample-shelf-folder-input"
      onChange={(event) => { acceptSnapshot(event.target.files); event.target.value = ''; }}
    />
    <SampleShelfView
      scan={scan} query={query} category={category} loading={loading} error={error}
      reconnectName={reconnectName} previewingId={previewingId} busyId={busyId}
      supportsLinkedFolder={supportsLinkedFolder}
      onQueryChange={setQuery} onCategoryChange={setCategory} onClose={onClose}
      onConnect={connect} onRefresh={refresh} onChooseSnapshot={chooseSnapshot}
      onPreview={preview}
      onAddToTimeline={(entry) => use(entry, onAddToTimeline)}
      onLoadSampler={(entry) => use(entry, onLoadSampler)}
    />
  </>, document.body);
}

export function SampleShelfView({
  scan, query, category, loading, error, reconnectName, previewingId, busyId,
  supportsLinkedFolder = true,
  onQueryChange, onCategoryChange, onClose, onConnect, onRefresh, onChooseSnapshot,
  onPreview, onAddToTimeline, onLoadSampler,
}: SampleShelfViewProps) {
  const visible = useMemo(() => searchSampleEntries(scan?.entries ?? [], query, category), [scan, query, category]);
  const connected = !!scan;
  return <div className="sample-shelf-backdrop" role="presentation" onPointerDown={(event) => {
    if (event.target === event.currentTarget && !busyId) onClose();
  }}>
    <section className="sample-shelf" role="dialog" aria-modal="true" aria-labelledby="sample-shelf-title">
      <header>
        <div className="sample-shelf-identity"><span className={`shelf-lamp ${previewingId ? 'playing' : connected ? 'on' : ''}`} /><div><small>SOUND SHELF</small><h2 id="sample-shelf-title">{scan?.folderName ?? reconnectName ?? 'Choose your sounds'}</h2><p>{connected ? `${scan.entries.length} sounds · ${scan.linked ? 'linked folder' : 'folder loaded for this session'}` : 'Connect the folder your adviser fills with sounds.'}</p></div></div>
        <div className="sample-shelf-head-actions">
          {connected && <button type="button" onClick={() => void onRefresh()} disabled={loading || !!busyId}>↻ Refresh</button>}
          <button type="button" onClick={() => void onConnect()} disabled={loading || !!busyId}>{reconnectName ? 'Reconnect folder' : connected ? 'Change folder' : supportsLinkedFolder ? 'Connect folder' : 'Choose folder'}</button>
          <button type="button" className="sample-shelf-close" aria-label="Close Sound Shelf" onClick={onClose} disabled={!!busyId}>×</button>
        </div>
      </header>

      {error && <div className="sample-shelf-error" role="alert"><span>!</span><b>{error}</b>{reconnectName && <button type="button" onClick={() => void onConnect()}>Reconnect folder</button>}</div>}

      {loading ? <div className="sample-shelf-loading"><span className="shelf-lamp playing" /><b>Reading the shelf…</b></div> : !connected ? <div className="sample-shelf-disconnected">
        <span className="sample-crate">♫</span><div><small>EMPTY CRATE</small><h3>Point Studio to a sample folder.</h3><p>Add sounds to that folder in Finder or File Explorer. Studio reads it but never changes it.</p><div><button type="button" onClick={() => void onConnect()}>{supportsLinkedFolder ? 'Connect sample folder' : 'Choose sample folder'}</button>{supportsLinkedFolder && <button type="button" className="quiet" onClick={onChooseSnapshot}>Load a folder once</button>}</div></div>
      </div> : <div className="sample-shelf-workbench">
        <aside className="sample-shelf-categories">
          <label><span>⌕</span><input type="search" aria-label="Search sample folder" value={query} placeholder="Search sounds" onChange={(event) => onQueryChange(event.target.value)} /></label>
          <nav aria-label="Sample folders">
            <button type="button" className={category === 'ALL' ? 'active' : ''} onClick={() => onCategoryChange('ALL')}><span>▦</span><b>All sounds</b><em>{scan.entries.length}</em></button>
            {scan.categories.map((name) => <button key={name} type="button" className={category === name ? 'active' : ''} onClick={() => onCategoryChange(name)}><span>▰</span><b>{name}</b><em>{scan.entries.filter((entry) => entry.category === name).length}</em></button>)}
          </nav>
        </aside>

        <div className="sample-shelf-results">
          <div className="sample-list-heading"><div><small>{category === 'ALL' ? 'EVERY CRATE' : category.toLocaleUpperCase()}</small><b>{query ? `${visible.length} matches` : `${visible.length} sounds`}</b></div>{previewingId && <span><i /> Listening</span>}</div>
          {!scan.entries.length ? <div className="sample-shelf-empty"><span>□</span><b>This folder is empty.</b><p>Add WAV, MP3, M4A, OGG, or FLAC files, then press Refresh.</p><button type="button" onClick={() => void onRefresh()}>Refresh folder</button></div>
            : !visible.length ? <div className="sample-shelf-empty"><span>⌕</span><b>No sounds match.</b><p>Try another word or choose All sounds.</p><button type="button" onClick={() => { onQueryChange(''); onCategoryChange('ALL'); }}>Clear search</button></div>
              : <div className="sample-file-list">{visible.map((entry) => {
                const previewing = previewingId === entry.id;
                const busy = busyId === entry.id;
                return <article key={entry.id} className={previewing ? 'playing' : ''}>
                  <button type="button" className="sample-preview" aria-label={`${previewing ? 'Stop' : 'Preview'} ${entry.name}`} onClick={() => void onPreview(entry)} disabled={!!busyId}><span>{previewing ? '■' : '▶'}</span></button>
                  <div className="sample-file-name"><b>{entry.name}</b><small>{entry.relativePath}</small></div>
                  <div className="sample-file-meta"><b>{entry.extension}</b><span>{formatBytes(entry.size)}</span></div>
                  <div className="sample-file-actions"><button type="button" onClick={() => void onAddToTimeline(entry)} disabled={!!busyId}>{busy ? 'Loading…' : 'Add at playhead'}</button><button type="button" className="sampler" onClick={() => void onLoadSampler(entry)} disabled={!!busyId}>{busy ? 'Loading…' : 'Load sampler'}</button></div>
                </article>;
              })}</div>}
        </div>
      </div>}

      <footer><span><b>READ ONLY</b> Studio never changes this folder.</span><span>Used sounds are packed with the current story.</span></footer>
    </section>
  </div>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;
}
