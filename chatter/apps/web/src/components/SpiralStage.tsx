import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { RoomPreview } from './RoomPreview.js';
import { SpiralRoomMap, type RoomRevealRequest } from './SpiralRoomMap.js';
import { SPIRAL_ROOMS } from './spiral-navigation.js';
import { progressFromScroll, roomIndexFromSlug, settledRoomNavigation, stagePoint, stationFromScroll } from './spiral-stage-model.js';

interface OrbitStyle extends CSSProperties {
  '--stage-x': string;
  '--stage-y': string;
  '--stage-scale': number;
  '--stage-opacity': number;
  '--stage-rotate': string;
  '--stage-color': string;
  '--stage-depth': number;
}

export interface SpiralStageProps {
  currentRoom: string;
  recommendedRoom?: string;
  roomRevealRequest?: RoomRevealRequest;
  storyTitle?: string;
  onNavigate: (room: string) => void;
  storyControl: ReactNode;
  driveControl: ReactNode;
  identityControl: ReactNode;
  mediaControl: ReactNode;
  adviserControl?: ReactNode;
  children: ReactNode;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function SpiralStage({
  currentRoom,
  recommendedRoom,
  roomRevealRequest,
  storyTitle,
  onNavigate,
  storyControl,
  driveControl,
  identityControl,
  mediaControl,
  adviserControl,
  children,
}: SpiralStageProps) {
  const routedIndex = roomIndexFromSlug(currentRoom);
  const initialIndex = Math.max(0, routedIndex);
  const [progress, setProgress] = useState(initialIndex);
  const [workView, setWorkView] = useState(currentRoom === 'studio');
  useEffect(() => { if (currentRoom === 'studio') setWorkView(true); }, [currentRoom]);
  const scrollerRef = useRef<HTMLElement>(null);
  const frameRequest = useRef<number>();
  const settleTimer = useRef<number>();
  const pendingNavigation = useRef<string>();
  const firstRouteSync = useRef(true);
  const lastAnnounced = useRef(currentRoom);
  const activeRoom = SPIRAL_ROOMS[routedIndex];
  const selectedIndex = Math.round(progress);
  const selectedRoom = SPIRAL_ROOMS[selectedIndex] ?? SPIRAL_ROOMS[0]!;
  const orbitPath = useMemo(() => {
    const points = Array.from({ length: 120 }, (_, sample) => {
      const value = (sample / 119) * (SPIRAL_ROOMS.length - 1);
      const point = stagePoint(Math.round(value), progress + (Math.round(value) - value), SPIRAL_ROOMS.length);
      return `${sample === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    });
    return points.join(' ');
  }, [progress]);

  function scrollToStation(index: number, behavior: ScrollBehavior = 'smooth') {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const top = index * scroller.clientHeight;
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top, behavior });
    else scroller.scrollTop = top;
  }

  function settleRoute() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const index = stationFromScroll(scroller.scrollTop, scroller.clientHeight, SPIRAL_ROOMS.length);
    const room = SPIRAL_ROOMS[index]!;
    const destination = settledRoomNavigation(currentRoom, pendingNavigation.current, room.slug);
    if (destination !== undefined) {
      pendingNavigation.current = destination;
      onNavigate(destination);
    }
    if (lastAnnounced.current !== room.slug) lastAnnounced.current = room.slug;
  }

  function scheduleSettle() {
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settleRoute, 160);
  }

  function handleScroll(event: UIEvent<HTMLElement>) {
    const top = event.currentTarget.scrollTop;
    const height = event.currentTarget.clientHeight;
    if (frameRequest.current !== undefined) cancelAnimationFrame(frameRequest.current);
    frameRequest.current = requestAnimationFrame(() => {
      setProgress(progressFromScroll(top, height, SPIRAL_ROOMS.length));
      frameRequest.current = undefined;
    });
    scheduleSettle();
  }

  function moveByKeyboard(event: KeyboardEvent<HTMLElement>) {
    let destination: number | undefined;
    const now = stationFromScroll(event.currentTarget.scrollTop, event.currentTarget.clientHeight, SPIRAL_ROOMS.length);
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') destination = Math.min(SPIRAL_ROOMS.length - 1, now + 1);
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') destination = Math.max(0, now - 1);
    if (event.key === 'Home') destination = 0;
    if (event.key === 'End') destination = SPIRAL_ROOMS.length - 1;
    if (destination === undefined) return;
    event.preventDefault();
    scrollToStation(destination, prefersReducedMotion() ? 'auto' : 'smooth');
  }

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || routedIndex < 0) return;
    const expected = routedIndex * scroller.clientHeight;
    if (Math.abs(scroller.scrollTop - expected) < 2) return;
    if (firstRouteSync.current) {
      scroller.scrollTop = expected;
      setProgress(routedIndex);
      firstRouteSync.current = false;
      return;
    }
    scrollToStation(routedIndex, prefersReducedMotion() ? 'auto' : 'smooth');
  }, [routedIndex]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScrollEnd = () => settleRoute();
    scroller.addEventListener('scrollend', onScrollEnd);
    return () => scroller.removeEventListener('scrollend', onScrollEnd);
  });

  useEffect(() => () => {
    if (frameRequest.current !== undefined) cancelAnimationFrame(frameRequest.current);
    window.clearTimeout(settleTimer.current);
  }, []);

  useEffect(() => {
    if (!workView) return;
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !(event.target instanceof HTMLElement && event.target.closest('.studio-workbench'))) setWorkView(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [workView]);

  return (
    <div
      className="wrap spiral-stage-shell"
      data-room={currentRoom || 'clubhouse'}
      data-active-room={currentRoom || 'clubhouse'}
      data-work-view={String(workView)}
      data-navigation-world="newsroom-solar-system"
    >
      <nav
        ref={scrollerRef}
        className="spiral-stage-scroller"
        aria-label="Travel the newsroom solar system"
        data-stage-scroll="native-snap"
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={moveByKeyboard}
      >
        <div className="spiral-stage-scroll-track" style={{ '--stage-count': SPIRAL_ROOMS.length } as CSSProperties}>
          <div className="spiral-orbit">
            <svg className="spiral-orbit-wire" viewBox="0 0 100 100" aria-hidden="true">
              <path d={orbitPath} pathLength="100" />
              <circle cx="50" cy="50" r="13" />
              <circle cx="50" cy="50" r="18" />
            </svg>

            {SPIRAL_ROOMS.map((room, index) => {
              const point = stagePoint(index, progress, SPIRAL_ROOMS.length);
              const active = index === routedIndex;
              const style: OrbitStyle = {
                '--stage-x': `${point.x}%`,
                '--stage-y': `${point.y}%`,
                '--stage-scale': point.scale,
                '--stage-opacity': point.opacity,
                '--stage-rotate': `${point.rotate}deg`,
                '--stage-color': room.color,
                '--stage-depth': point.depth,
              };
              return (
                <button
                  type="button"
                  key={room.slug || 'clubhouse'}
                  className={`spiral-room-station${active ? ' is-active' : ''}${index === selectedIndex ? ' is-target' : ''}`}
                  style={style}
                  aria-current={active ? 'page' : undefined}
                  aria-label={`${room.name}: ${room.verb}`}
                  data-room-station={room.slug || 'clubhouse'}
                  data-process-planet={room.slug || 'clubhouse'}
                  data-recommended={room.slug === recommendedRoom ? 'true' : undefined}
                  data-stage-near={Math.abs(point.distance) <= 1.25 ? 'true' : undefined}
                  onClick={() => scrollToStation(index, prefersReducedMotion() ? 'auto' : 'smooth')}
                >
                  <RoomPreview room={room} active={active} distance={point.distance} title={storyTitle} />
                </button>
              );
            })}

            <div className="spiral-aperture" aria-hidden="true"><span /><span /><span /></div>
          </div>

          <ol className="spiral-snap-points" aria-hidden="true">
            {SPIRAL_ROOMS.map((room, index) => (
              <li key={room.slug || 'clubhouse'} data-snap-station={index} />
            ))}
          </ol>
        </div>
      </nav>

      <div className="spiral-stage-brand">
        <button type="button" onClick={() => scrollToStation(0, prefersReducedMotion() ? 'auto' : 'smooth')} aria-label="Go to Clubhouse">
          <span>CN</span><b>CHATTER</b><small>NEWSROOM</small>
        </button>
      </div>

      <section className="spiral-center-frame" aria-label={`${activeRoom?.name ?? 'Front Desk'} workspace`}>
        <div className="spiral-window-shell">
          <header className="spiral-window-toolbar" data-has-story-control={!!storyControl}>
            {storyControl && <div className="spiral-workflow-dock" data-frame-slot="left-progress">{storyControl}</div>}
            <button
              type="button"
              className="spiral-frame-hardware"
              data-frame-control="workspace-mode"
              data-frame-slot="right-room"
              aria-label={workView ? 'Show newsroom solar system' : 'Expand room workspace'}
              aria-pressed={workView}
              onClick={() => setWorkView((open) => !open)}
            >
              <span className="spiral-hardware-lamps" aria-hidden="true"><i /><i /><i /></span>
              <span className="spiral-hardware-room"><small>{activeRoom?.mark ?? 'FD'}</small><b>{activeRoom?.name ?? 'Front Desk'}</b></span>
              <span className="spiral-hardware-mode"><i aria-hidden="true">{workView ? '◎' : '↗'}</i><b>{workView ? 'Show planets' : 'Work view'}</b></span>
            </button>
          </header>
          <div className="spiral-center-room">{children}</div>
        </div>
      </section>

      <aside className="spiral-satellites" aria-label="Newsroom controls">
        <div className="spiral-satellite spiral-satellite-drive">{driveControl}</div>
        <div className="spiral-satellite spiral-satellite-badge">{identityControl}</div>
        <div className="spiral-satellite spiral-satellite-media">{mediaControl}</div>
        {adviserControl && <div className="spiral-satellite spiral-satellite-adviser">{adviserControl}</div>}
      </aside>

      <SpiralRoomMap
        currentRoom={currentRoom}
        recommendedRoom={recommendedRoom}
        revealRequest={roomRevealRequest}
        onSelect={(index) => scrollToStation(index, prefersReducedMotion() ? 'auto' : 'smooth')}
      />

      <p className="spiral-keyboard-note">Use arrow keys to travel one room at a time</p>
      <div className="spiral-route-status" aria-live="polite" aria-atomic="true">
        {selectedRoom.name} approaching the center
      </div>
    </div>
  );
}
