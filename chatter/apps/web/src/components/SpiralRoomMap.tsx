import { useEffect, useRef, type CSSProperties } from 'react';
import { RoomPreview } from './RoomPreview.js';
import { SPIRAL_ROOMS, SPIRAL_ROOM_PURPOSES } from './spiral-navigation.js';
import type { ReilyRoom } from './reily-advice.js';

interface PlanetStyle extends CSSProperties {
  '--planet-color': string;
  '--stage-color': string;
}

const ORBIT_BANDS = [
  { group: 'START', number: '01', name: 'Plan & report', note: 'Choose the angle, crew, and words.' },
  { group: 'MAKE', number: '02', name: 'Create', note: 'Record, design, score, and edit.' },
  { group: 'FINISH', number: '03', name: 'Finish & publish', note: 'Check, pack, and replay the work.' },
] as const;

export interface RoomRevealRequest {
  id: number;
  room: ReilyRoom;
}

export function SpiralRoomMap({
  currentRoom,
  recommendedRoom,
  revealRequest,
  onSelect,
}: {
  currentRoom: string;
  recommendedRoom?: string;
  revealRequest?: RoomRevealRequest;
  onSelect: (index: number) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const active = SPIRAL_ROOMS.find((room) => room.slug === currentRoom);
  const next = SPIRAL_ROOMS.find((room) => room.slug === recommendedRoom);
  const clubhouse = SPIRAL_ROOMS[0]!;

  useEffect(() => {
    if (!revealRequest || !detailsRef.current) return;
    detailsRef.current.open = true;
    const station = revealRequest.room === 'home' ? 'clubhouse' : revealRequest.room;
    const target = detailsRef.current.querySelector<HTMLElement>(`[data-map-station="${station}"]`);
    if (target && typeof target.scrollIntoView === 'function') {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      target.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [revealRequest?.id, revealRequest?.room]);

  function selectRoom(index: number, target: HTMLElement) {
    onSelect(index);
    target.closest('details')?.removeAttribute('open');
  }

  return (
    <details ref={detailsRef} className="spiral-room-map">
      <summary aria-label="Open room map">
        <span className="spiral-map-dial" aria-hidden="true"><i /><i /><i /><b>CN</b></span>
        <span><small>Room system</small><b>{active?.name ?? 'Newsroom'}</b></span>
      </summary>
      <div className="spiral-room-map-popover" aria-label="Room map">
        <header className="solar-atlas-head">
          <span><small>NEWSROOM SYSTEM</small><b>Pick a planet</b></span>
          <p>Every room has one job. Follow the lit signal or choose the tool you need.</p>
          <div className="solar-atlas-route"><small>STORY ROUTE</small><b>{next ? `Next: ${next.name}` : `Now: ${active?.name ?? 'Clubhouse'}`}</b></div>
          <button type="button" className="solar-atlas-close" aria-label="Close room system" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}><span aria-hidden="true">×</span> Close</button>
        </header>
        <div className="solar-atlas">
          <aside className="solar-atlas-home">
            <small>HOME SIGNAL</small>
            <button
              type="button"
              style={{ '--planet-color': clubhouse.color, '--stage-color': clubhouse.color } as PlanetStyle}
              data-map-station="clubhouse"
              data-reily-target={revealRequest?.room === 'home' ? 'true' : undefined}
              aria-current={currentRoom === '' ? 'page' : undefined}
              aria-label={`Clubhouse: ${SPIRAL_ROOM_PURPOSES.clubhouse}${revealRequest?.room === 'home' ? ' Chosen with Reily.' : ''}`}
              onClick={(event) => selectRoom(0, event.currentTarget)}
            >
              <span className="solar-home-sun" aria-hidden="true"><i>CN</i><b>LIVE</b></span>
              <strong>Clubhouse</strong>
              <span>{SPIRAL_ROOM_PURPOSES.clubhouse}</span>
              {currentRoom === '' && <em>You are here</em>}
            </button>
          </aside>
          <div className="solar-atlas-bands">
            {ORBIT_BANDS.map((band) => {
              const rooms = SPIRAL_ROOMS.filter((room) => room.group === band.group && room.slug !== '');
              return (
                <section className="solar-orbit-band" data-orbit-band={band.group.toLowerCase()} key={band.group}>
                  <header><span>{band.number}</span><b>{band.name}</b><small>{band.note}</small></header>
                  <div className="solar-planet-list">
                    {rooms.map((room) => {
                      const index = SPIRAL_ROOMS.indexOf(room);
                      const recommended = room.slug === recommendedRoom;
                      const current = room.slug === currentRoom;
                      const style: PlanetStyle = { '--planet-color': room.color, '--stage-color': room.color };
                      return (
                        <button
                          type="button"
                          className="solar-planet-button"
                          key={room.slug}
                          style={style}
                          data-map-station={room.slug}
                          data-reily-target={room.slug === revealRequest?.room ? 'true' : undefined}
                          data-recommended={recommended ? 'true' : undefined}
                          aria-current={current ? 'page' : undefined}
                          aria-label={`${room.name}: ${SPIRAL_ROOM_PURPOSES[room.slug]}${recommended ? ' Next for this story.' : ''}${room.slug === revealRequest?.room ? ' Chosen with Reily.' : ''}`}
                          onClick={(event) => selectRoom(index, event.currentTarget)}
                        >
                          <RoomPreview room={room} active={current} distance={0} />
                          <span className="solar-planet-copy"><strong>{room.name}</strong><span>{SPIRAL_ROOM_PURPOSES[room.slug]}</span><small>{room.verb}</small></span>
                          {(recommended || current) && <em>{recommended ? 'Next stop' : 'You are here'}</em>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </details>
  );
}
