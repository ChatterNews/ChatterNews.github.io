import { useEffect, useState } from 'react';
import { linkStudioSession, type Story, type StudioProject } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';

/** Keep older work portable without loading or exposing the retired DAW. */
export function SavedStudioProjects({ stories }: { stories: Story[] }) {
  const store = useStore();
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void store.studioProjects.list().then(rows => { if (live) setProjects(rows); })
      .catch(() => { if (live) setError('Older saved projects could not load. Reopen Media Bin to retry.'); });
    return () => { live = false; };
  }, [store]);
  async function link(project: StudioProject) {
    setBusy(true); setError('');
    try {
      const saved = await linkStudioSession(store, project.project.id, selected[project.id] ?? '');
      setProjects(rows => rows.map(row => row.id === saved.id ? saved : row));
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'That project could not be linked.'); }
    finally { setBusy(false); }
  }
  if (!projects.length && !error) return null;
  return <details className="media-bin-group">
    <summary>Older saved music projects ({projects.length})</summary>
    <p>Studio is no longer available. These projects remain saved. Link each to a story so Save story and Finish session can keep its project and source audio together. Finished audio is still playable below.</p>
    {error && <p role="alert">{error}</p>}
    {projects.map(project => <div key={project.id} className="media-bin-scope">
      <b>{project.project.name}</b>
      {project.storyId ? <span>Saved with {stories.find(story => story.id === project.storyId)?.title ?? 'its original story'}</span> : <div>
        <label>Save with story <select value={selected[project.id] ?? ''} disabled={busy} onChange={event => setSelected(values => ({ ...values, [project.id]: event.target.value }))}>
          <option value="">Choose a story…</option>
          {stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}
        </select></label>
        <button disabled={busy || !selected[project.id]} onClick={() => void link(project)}>Link saved project</button>
      </div>}
    </div>)}
  </details>;
}
