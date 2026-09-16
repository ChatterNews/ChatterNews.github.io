import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { JOB_GUIDES, recipeTrackStepForStory, resolveStoryCreationRecipe, storyPath, storyRoomPath, type CrewRole, type CrewTask, type Episode, type Story, type User } from '@chatter/shared';
import { RoomIcon } from '../components/RoomIcon.js';
import { previewKindForRoom } from '../components/RoomPreview.js';
import { STATIONS } from '../components/stations.js';
import { useStore } from '../store/StoreProvider.js';
import './Clubhouse.css';

const STATE: Record<string, [string, string]> = {
  PITCH: ['k-idle', 'Needs a lead'], WORK: ['k-go', 'Reporting & writing'], BOOTH: ['k-go', 'Ready to record'],
  REVIEW: ['k-wait', 'In crew review'], HELD: ['k-stop', 'Waiting on a safeguard'], DONE: ['k-ok', 'Published'],
};

const RACKS = [
  { id: 'PLAN', label: 'Plan', note: 'Find the story and divide the work.' },
  { id: 'MAKE', label: 'Make', note: 'Build the words, sound, and pictures.' },
  { id: 'FINISH', label: 'Finish', note: 'Check, export, and keep the edition.' },
] as const;

export function ClubhouseRoomRacks({ counts, trackedStoryId, activeRooms, onNavigate }: {
  counts: Partial<Record<string, number>>; trackedStoryId?: string;
  activeRooms: ReadonlySet<string>; onNavigate: (destination: string) => void;
}) {
  return <div className="room-racks">{RACKS.map((rack, rackIndex) => <section className={`room-rack room-rack-${rack.id.toLowerCase()}`} key={rack.id} aria-labelledby={`rack-${rack.id}`}>
    <header><span>{rackIndex + 1}</span><div><h3 id={`rack-${rack.id}`}>{rack.label}</h3><p>{rack.note}</p></div></header>
    <div>{STATIONS.filter((station) => station.group === rack.id).map((station) => {
      const count = counts[station.v]; const room = `/${station.v}`; const active = activeRooms.has(room);
      const destination = trackedStoryId ? storyRoomPath(room, trackedStoryId) : room;
      const countCopy = count && station.countLabel ? `${count} ${station.countLabel[count === 1 ? 0 : 1]}` : undefined;
      return <button className="room-cartridge" style={{ '--station-accent': station.accent, '--stage-color': station.accent } as CSSProperties} key={station.v} data-destination={destination} onClick={() => onNavigate(destination)}>
        <span className="room-cartridge-icon"><RoomIcon kind={previewKindForRoom({ slug: station.v })} /></span>
        <span className="room-cartridge-copy"><b>{station.n}</b><small>{station.d}</small></span>
        <span className={`room-cartridge-signal ${active ? 'active' : ''}`}><i />{countCopy ?? (active ? 'On this route' : station.cue)}</span>
        <span className="room-cartridge-open" aria-hidden="true">›</span>
      </button>;
    })}</div>
  </section>)}</div>;
}

export function Clubhouse({ stories, story: trackedStory, me, penName }: { stories: Story[]; story?: Story; me?: User; penName: string }) {
  const store = useStore(); const navigate = useNavigate();
  const [tasks, setTasks] = useState<CrewTask[]>([]); const [episodes, setEpisodes] = useState<Episode[]>([]);
  useEffect(() => { void Promise.all([store.crewTasks.list(), store.episodes.list()]).then(([nextTasks, nextEpisodes]) => { setTasks(nextTasks); setEpisodes(nextEpisodes); }); }, [store, stories]);
  const myTasks = tasks.filter((task) => task.assigneeId === me?.id && task.state !== 'DONE');
  const mine = stories.filter((story) => story.ownerId === me?.id || story.bylineIds.includes(me?.id ?? '') || story.bylineIds.some((byline) => byline.startsWith(penName.split(' ')[0]!)) || myTasks.some((task) => task.storyId === story.id));
  const jobs = mine.length ? mine : stories.filter((story) => story.status !== 'DONE').slice(0, 3);
  const counts = useMemo(() => ({
    slate: stories.filter((story) => story.status !== 'DONE').length,
    desk: stories.filter((story) => story.status === 'WORK').length,
    booth: stories.filter((story) => story.status === 'BOOTH').length,
    greenlight: stories.filter((story) => ['REVIEW', 'HELD'].includes(story.status)).length,
    crew: tasks.filter((task) => task.state !== 'DONE').length,
    reruns: episodes.length || stories.filter((story) => story.status === 'DONE').length,
  }), [stories, tasks, episodes]);
  const activeRecipe = trackedStory ? resolveStoryCreationRecipe(trackedStory) : undefined;
  const activeRooms = useMemo(() => new Set(activeRecipe?.steps.map((step) => step.room) ?? []), [activeRecipe]);

  return <section className="view on clubhouse-room">
    <header className="clubhouse-welcome"><div><span>CLUBHOUSE</span><h1>{penName.split(' ')[0]}'s desk</h1><p>{myTasks.length ? `${myTasks.length} active assignment${myTasks.length === 1 ? '' : 's'}. Closest deadline first.` : 'No active assignments.'}</p></div><button onClick={() => navigate('/slate')}>＋ New story</button></header>

    {myTasks.length > 0 && <div className="sect"><h2>Assignments<span className="zig" /></h2><div className="clubhouse-jobs">{myTasks.map((task) => { const guide = JOB_GUIDES[task.role as CrewRole]; const story = stories.find((item) => item.id === task.storyId); return <article key={task.id}><span style={{ background: guide.color }}>{guide.icon}</span><div><small>{guide.title} · {task.completedSteps.length}/3 steps</small><h3>{story?.title ?? 'Story assignment'}</h3><p>{task.state === 'NEEDS_HELP' ? 'Help requested. Open the assignment to add details.' : guide.promise}</p></div><button onClick={() => navigate(storyRoomPath(guide.room, task.storyId))}>Open →</button></article>; })}</div></div>}

    <div className="sect"><div className="clubhouse-section-title"><div><h2>{mine.length ? 'Stories' : 'Open stories'}<span className="zig" /></h2><p className="sub">Sorted by deadline.</p></div><button onClick={() => navigate('/crew')}>All assignments →</button></div><div className="cards">{jobs.map((story) => { const step = recipeTrackStepForStory(story); const recipe = resolveStoryCreationRecipe(story); const [kind, label] = STATE[story.status]!; return <div className="card" key={story.id}><div className="hd"><span className={`chip ${kind}`}><span className="d" />{label}</span><span className="tagline">{recipe.label}</span></div><h3>{story.title}</h3><p className="why">{story.brief?.angle || step.next}</p><div className="act"><button className="b sm go" onClick={() => navigate(storyPath(story))}>{story.status === 'DONE' ? 'Read story' : step.action} →</button><span className="tagline">{story.readTimeSec}s aloud</span></div></div>; })}</div>{!stories.length && <div className="newsroom-empty"><h2>No stories yet.</h2><p>Create a pitch in Slate.</p><button className="newsroom-button primary" onClick={() => navigate('/slate')}>New story</button></div>}</div>

    <div className="sect clubhouse-rooms"><div className="clubhouse-section-title"><div><h2>Rooms<span className="zig" /></h2><p className="sub">{trackedStory ? `The lit rooms belong to ${trackedStory.title}.` : 'Pick a room by the job you need to do.'}</p></div></div><ClubhouseRoomRacks counts={counts} trackedStoryId={trackedStory?.id} activeRooms={activeRooms} onNavigate={(destination) => navigate(destination)} /></div>
  </section>;
}
