import { useState, useMemo, type CSSProperties } from 'react';
import type { BlastProject } from '@chatter/shared';
import { BLAST_RECIPE_FAMILIES, buildBlastRecipe } from './blast-recipes.js';
import { LoadingStatus } from '../components/LoadingStatus.js';
import './BlastStart.css';

const JOBS = [
  { name: 'Spread the word', description: 'Make a poster, invite people, or share an announcement.', label: 'POSTERS & INVITES', families: ['event-poster', 'club-recruitment', 'community-update'], color: '#ffcee2' },
  { name: 'Share a story', description: 'Put your news, a great person, or a big moment on the page.', label: 'NEWS & SPOTLIGHTS', families: ['family-newsletter', 'student-spotlight', 'social-story'], color: '#fff09a' },
  { name: 'Explain an idea', description: 'Show how something works or what you discovered.', label: 'GUIDES & DISCOVERIES', families: ['how-it-works', 'science-showcase', 'field-guide'], color: '#b9eeea' },
  { name: 'Tell it with photos', description: 'Let your pictures tell the story. Add words along the way.', label: 'PHOTO STORIES', families: ['photo-essay'], color: '#ded0ff' },
];

export function BlastStart({ onChoose, onClose, projects, onOpen, busy = false }: {
  onChoose: (familyId: string, directionId: string, slotValues?: Record<string, string>) => void;
  onClose?: () => void;
  projects: BlastProject[];
  onOpen: (project: BlastProject) => void;
  busy?: boolean;
}) {
  const [jobIndex, setJobIndex] = useState<number>();
  const [familyId, setFamilyId] = useState('event-poster');
  const [headline, setHeadline] = useState('');
  const [date, setDate] = useState('');
  const job = jobIndex === undefined ? undefined : JOBS[jobIndex];
  const family = BLAST_RECIPE_FAMILIES.find((item) => item.id === familyId)!;
  const saved = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
  return <section className={`blast-start${job ? ' choosing-page' : ''}`} aria-label="Start with Blast" aria-busy={busy}>
    <header className="blast-start-head">
      <div className="blast-start-wordmark" aria-hidden="true">BLAST<span>Make it yours.</span></div>
      <div><p className="blast-start-kicker">YOUR WORDS. YOUR PICTURES. YOUR STYLE.</p><h1>{job ? 'Pick a starting page.' : 'What are we making today?'}</h1><p>{job ? 'Choose a look you like. Then change the words, pictures, and colors.' : 'A big idea starts with one page. Choose what you want to make—we’ll help you get going.'}</p></div>
      {onClose && <button disabled={busy} className="blast-start-back" onClick={onClose}>Back to my design →</button>}
    </header>
    {busy && <LoadingStatus label="Getting your design ready…" detail="Saving your work and opening the page." />}
    <fieldset disabled={busy} className="blast-start-body">
      {!job ? <>
        {saved[0] && <div className="blast-start-resume"><div><small>RIGHT WHERE YOU LEFT OFF</small><b>{saved[0].title}</b></div><button onClick={() => onOpen(saved[0]!)}>Keep working →</button></div>}
        <div className="blast-start-step"><b>1</b><span>Choose your mission</span><small>Next: pick a page → make it yours</small></div>
        <div className="blast-start-jobs">{JOBS.map((item, index) => {
          const sample = BLAST_RECIPE_FAMILIES.find((entry) => entry.id === item.families[0])!;
          return <button key={item.name} className="blast-start-job" style={{ '--job-color': item.color } as CSSProperties} onClick={() => { setFamilyId(item.families[0]!); setJobIndex(index); }}>
            <div className="blast-start-sample"><BlastTemplatePreview familyId={sample.id} directionId={sample.directions[0]!.id} /></div>
            <small>{item.label}</small><h2>{item.name}</h2><p>{item.description}</p><strong>Let’s make it →</strong>
          </button>;
        })}</div>
        <p className="blast-start-reassurance">No blank-page worries. Every starting page is ready for your ideas.</p>
        {saved.length > 0 && <details className="blast-start-saved"><summary>All your saved designs ({saved.length})</summary><div>{saved.map((item) => <button key={item.id} onClick={() => onOpen(item)}><b>{item.title}</b><small>{item.pages.length} page{item.pages.length === 1 ? '' : 's'} · Edited {new Date(item.updatedAt).toLocaleDateString()}</small><span>Open →</span></button>)}</div></details>}
      </> : <>
        <div className="blast-start-step"><button className="blast-start-back" onClick={() => setJobIndex(undefined)}>← All missions</button><b>2</b><span>{job.name}</span></div>
        <div className="blast-start-formats" aria-label="Page type">{job.families.map((id) => { const item = BLAST_RECIPE_FAMILIES.find((entry) => entry.id === id)!; return <button key={id} aria-pressed={familyId === id} onClick={() => setFamilyId(id)}>{item.name}</button>; })}</div>
        <details className="blast-start-words"><summary>Add your headline first <small>(optional)</small></summary><div><label>Your headline<input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="What should people notice?" /></label><label>Date or credit line<input value={date} onChange={(event) => setDate(event.target.value)} placeholder="By the third-grade news crew" /></label></div></details>
        <div className="blast-start-looks">{family.directions.map((item) => <button key={item.id} onClick={() => onChoose(family.id, item.id, { ...(headline.trim() ? { headline: headline.trim() } : {}), ...(date.trim() ? { date: date.trim() } : {}) })} style={{ '--recipe-ink': item.palette[0], '--recipe-primary': item.palette[1], '--recipe-accent': item.palette[2], '--recipe-paper': item.palette[3] } as CSSProperties}>
          <BlastTemplatePreview familyId={family.id} directionId={item.id} /><b>{item.name}</b><small>{item.note}</small><strong>Use this page →</strong>
        </button>)}</div>
        <p className="blast-start-reassurance">Next, make it yours: start with the headline, add a photo, then fill in your story. Sample words are there to replace.</p>
      </>}
    </fieldset>
  </section>;
}

function BlastTemplatePreview({ familyId, directionId }: { familyId: string; directionId: string }) {
  const recipe = useMemo(() => buildBlastRecipe(familyId, directionId), [familyId, directionId]);
  const page = recipe.pages[0]!;
  const preview = page.elements.filter((item) => !item.hidden && item.opacity > 0);
  return <div className="blast-recipe-preview blast-template-stage" style={{ background: page.background, aspectRatio: `${recipe.width} / ${recipe.height}` }} aria-hidden="true">
    {preview.map((item) => {
      const stageStyle = {
        left: `${item.x / recipe.width * 100}%`,
        top: `${item.y / recipe.height * 100}%`,
        width: `${item.width / recipe.width * 100}%`,
        height: `${item.height / recipe.height * 100}%`,
        color: item.fill,
        background: item.kind === 'TEXT' ? 'transparent' : item.fill,
        borderColor: item.stroke,
        borderWidth: item.strokeWidth ? `${Math.max(1, item.strokeWidth / 2)}px` : 0,
        borderStyle: 'solid',
        borderRadius: item.shape === 'ELLIPSE' ? '50%' : `${Math.min(12, item.radius / 3)}px`,
        transform: `rotate(${item.rotation}deg)`,
        fontFamily: item.fontFamily,
        fontSize: item.kind === 'TEXT' ? `${item.fontSize / recipe.width * 100}cqw` : undefined,
        fontWeight: item.fontWeight,
        lineHeight: item.lineHeight,
        textAlign: item.align,
      } as CSSProperties;
      return <span key={item.id} className={`blast-template-piece kind-${item.kind.toLowerCase()} role-${item.role?.toLowerCase() ?? 'piece'}`} style={stageStyle}>
        {item.kind === 'TEXT' ? item.text : item.kind === 'IMAGE' ? <i /> : null}
      </span>;
    })}
  </div>;
}
