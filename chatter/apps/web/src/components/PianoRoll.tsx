import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { MidiNote } from '@chatter/shared';

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const ROW_HEIGHT = 20;

export type PianoTool = 'SELECT' | 'DRAW';

export function noteName(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

type Drag = {
  mode: 'MOVE' | 'RESIZE' | 'MARQUEE' | 'VELOCITY';
  startX: number;
  startY: number;
  rect: DOMRect;
  originals: MidiNote[];
  additive?: boolean;
};

export function PianoRoll({
  notes, selectedIds, tool, lowestPitch, clipBeats, gridBeat, playheadBeat,
  activePitches, onSelectionChange, onCreate, onChange, onDelete,
  onAuditionStart, onAuditionStop,
}: {
  notes: MidiNote[];
  selectedIds: string[];
  tool: PianoTool;
  lowestPitch: number;
  clipBeats: number;
  gridBeat: number;
  playheadBeat: number;
  activePitches: number[];
  onSelectionChange: (ids: string[]) => void;
  onCreate: (pitch: number, startBeat: number, durationBeats: number) => void;
  onChange: (note: MidiNote, patch: Partial<Omit<MidiNote, 'engineId'>>) => void;
  onDelete: (notes: MidiNote[]) => void;
  onAuditionStart: (pitch: number) => void;
  onAuditionStop: (pitch: number) => void;
}) {
  const pitchCount = 36;
  const highestPitch = lowestPitch + pitchCount - 1;
  const pitches = useMemo(
    () => Array.from({ length: pitchCount }, (_, index) => highestPitch - index),
    [highestPitch],
  );
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const centeredOnContent = useRef(false);
  const [drag, setDrag] = useState<Drag>();
  const [drafts, setDrafts] = useState<Record<string, MidiNote>>({});
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number }>();
  const visibleNotes = useMemo(
    () => notes.filter((note) => note.pitch >= lowestPitch && note.pitch <= highestPitch),
    [highestPitch, lowestPitch, notes],
  );
  const displayedNotes = visibleNotes.map((note) => drafts[note.engineId] ?? note);

  useEffect(() => {
    if (centeredOnContent.current || !scrollRef.current) return;
    const targetPitch = visibleNotes.length
      ? visibleNotes.map((note) => note.pitch).sort((a, b) => a - b)[Math.floor(visibleNotes.length / 2)]!
      : Math.min(highestPitch, lowestPitch + 12);
    const targetRow = highestPitch - targetPitch;
    scrollRef.current.scrollTop = Math.max(0, targetRow * ROW_HEIGHT - scrollRef.current.clientHeight / 2);
    centeredOnContent.current = true;
  }, [highestPitch, lowestPitch, visibleNotes]);

  useLayoutEffect(() => {
    if (!drag) return;
    let finalDrafts: Record<string, MidiNote> = {};
    const move = (event: PointerEvent) => {
      if (drag.mode === 'MARQUEE') {
        const x0 = drag.startX - drag.rect.left;
        const y0 = drag.startY - drag.rect.top;
        const x1 = Math.max(0, Math.min(drag.rect.width, event.clientX - drag.rect.left));
        const y1 = Math.max(0, Math.min(drag.rect.height, event.clientY - drag.rect.top));
        setMarquee({ x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) });
        return;
      }
      const deltaBeat = Math.round(((event.clientX - drag.startX) / drag.rect.width * clipBeats) / gridBeat) * gridBeat;
      const deltaPitch = Math.round((drag.startY - event.clientY) / ROW_HEIGHT);
      const next: Record<string, MidiNote> = {};
      drag.originals.forEach((note) => {
        if (drag.mode === 'MOVE') {
          next[note.engineId] = {
            ...note,
            startBeat: Math.max(0, Math.min(clipBeats - note.durationBeats, note.startBeat + deltaBeat)),
            pitch: Math.max(0, Math.min(127, note.pitch + deltaPitch)),
          };
        } else if (drag.mode === 'RESIZE') {
          next[note.engineId] = {
            ...note,
            durationBeats: Math.max(gridBeat, Math.min(clipBeats - note.startBeat, note.durationBeats + deltaBeat)),
          };
        } else if (drag.mode === 'VELOCITY') {
          const velocity = Math.max(0.05, Math.min(1, 1 - (event.clientY - drag.rect.top) / drag.rect.height));
          next[note.engineId] = { ...note, velocity };
        }
      });
      finalDrafts = next;
      setDrafts(next);
    };
    const up = (event: PointerEvent) => {
      if (drag.mode === 'MARQUEE') {
        const x0 = Math.min(drag.startX, event.clientX) - drag.rect.left;
        const x1 = Math.max(drag.startX, event.clientX) - drag.rect.left;
        const y0 = Math.min(drag.startY, event.clientY) - drag.rect.top;
        const y1 = Math.max(drag.startY, event.clientY) - drag.rect.top;
        const hits = visibleNotes.filter((note) => {
          const left = note.startBeat / clipBeats * drag.rect.width;
          const right = (note.startBeat + note.durationBeats) / clipBeats * drag.rect.width;
          const top = (highestPitch - note.pitch) * ROW_HEIGHT;
          return right >= x0 && left <= x1 && top + ROW_HEIGHT >= y0 && top <= y1;
        }).map((note) => note.engineId);
        onSelectionChange(drag.additive ? Array.from(new Set([...selectedIds, ...hits])) : hits);
      } else {
        Object.values(finalDrafts).forEach((next) => {
          const original = notes.find((note) => note.engineId === next.engineId);
          if (!original) return;
          onChange(original, {
            pitch: next.pitch, startBeat: next.startBeat,
            durationBeats: next.durationBeats, velocity: next.velocity,
          });
        });
      }
      setDrag(undefined);
      setDrafts({});
      setMarquee(undefined);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [clipBeats, drag, gridBeat, highestPitch, notes, onChange, onSelectionChange, selectedIds, visibleNotes]);

  const beginNoteDrag = (event: ReactPointerEvent, note: MidiNote, mode: Drag['mode']) => {
    event.preventDefault();
    event.stopPropagation();
    if (tool === 'DRAW') {
      onDelete([note]);
      return;
    }
    const selected = selectedIds.includes(note.engineId)
      ? selectedIds
      : event.shiftKey ? [...selectedIds, note.engineId] : [note.engineId];
    onSelectionChange(selected);
    setDrag({
      mode, startX: event.clientX, startY: event.clientY,
      rect: gridRef.current!.getBoundingClientRect(),
      originals: notes.filter((candidate) => selected.includes(candidate.engineId)),
    });
  };

  const gridPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || tool === 'DRAW') return;
    if (!event.shiftKey) onSelectionChange([]);
    setDrag({
      mode: 'MARQUEE', startX: event.clientX, startY: event.clientY,
      rect: event.currentTarget.getBoundingClientRect(), originals: [], additive: event.shiftKey,
    });
  };

  const createAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rawBeat = (event.clientX - rect.left) / rect.width * clipBeats;
    const startBeat = Math.floor(rawBeat / gridBeat) * gridBeat;
    const pitch = highestPitch - Math.floor((event.clientY - rect.top) / ROW_HEIGHT);
    onCreate(pitch, startBeat, gridBeat);
  };

  return (
    <div className="piano-editor" data-tool={tool.toLowerCase()}>
      <div className="piano-ruler-row">
        <div className="piano-corner">PITCH</div>
        <div className="piano-ruler">
          {Array.from({ length: Math.ceil(clipBeats / 4) }, (_, bar) => (
            <span key={bar} style={{ left: `${bar * 4 / clipBeats * 100}%` }}>{bar + 1}</span>
          ))}
        </div>
      </div>

      <div className="piano-scroll" ref={scrollRef}>
        <div className="piano-keys" style={{ height: pitchCount * ROW_HEIGHT }}>
          {pitches.map((pitch) => <button
            key={pitch} type="button"
            className={`${[1, 3, 6, 8, 10].includes(pitch % 12) ? 'black' : ''} ${activePitches.includes(pitch) ? 'active' : ''}`}
            onPointerDown={() => onAuditionStart(pitch)} onPointerUp={() => onAuditionStop(pitch)}
            onPointerLeave={() => activePitches.includes(pitch) && onAuditionStop(pitch)}
            aria-label={`Audition ${noteName(pitch)}`}
          >{pitch % 12 === 0 ? noteName(pitch) : ''}</button>)}
        </div>
        <div
          ref={gridRef} className="piano-grid"
          style={{
            height: pitchCount * ROW_HEIGHT,
            '--beat-width': `${100 / clipBeats}%`, '--bar-width': `${400 / clipBeats}%`,
            '--row-height': `${ROW_HEIGHT}px`,
          } as CSSProperties}
          onPointerDown={tool === 'DRAW' ? createAtPointer : gridPointerDown}
          onDoubleClick={tool === 'SELECT' ? createAtPointer : undefined}
        >
          <div className="piano-playhead" style={{ left: `${Math.max(0, Math.min(1, playheadBeat / clipBeats)) * 100}%` }} />
          {displayedNotes.map((note) => <button
            key={note.engineId} type="button"
            className={`midi-note ${selectedIds.includes(note.engineId) ? 'selected' : ''}`}
            style={{
              left: `${note.startBeat / clipBeats * 100}%`, width: `${note.durationBeats / clipBeats * 100}%`,
              top: (highestPitch - note.pitch) * ROW_HEIGHT + 2, height: ROW_HEIGHT - 4,
              '--note-velocity': note.velocity,
            } as CSSProperties}
            onPointerDown={(event) => beginNoteDrag(event, note, 'MOVE')}
            onDoubleClick={(event) => { event.stopPropagation(); onDelete([note]); }}
            aria-label={`${selectedIds.includes(note.engineId) ? 'Selected ' : ''}${noteName(note.pitch)} at beat ${note.startBeat + 1}`}
          >
            <span>{noteName(note.pitch)}</span>
            <i onPointerDown={(event) => beginNoteDrag(event, note, 'RESIZE')} aria-hidden="true" />
          </button>)}
          {marquee && <div className="note-marquee" style={marquee} />}
        </div>
      </div>

      <div className="velocity-row">
        <div className="velocity-label">VELOCITY</div>
        <div className="velocity-lane">
          {displayedNotes.map((note) => <button
            key={note.engineId} type="button"
            className={selectedIds.includes(note.engineId) ? 'selected' : ''}
            style={{ left: `${note.startBeat / clipBeats * 100}%`, height: `${note.velocity * 100}%` }}
            title={`${noteName(note.pitch)} velocity ${Math.round(note.velocity * 127)}`}
            onPointerDown={(event) => {
              event.preventDefault();
              const selected = selectedIds.includes(note.engineId) ? selectedIds : [note.engineId];
              onSelectionChange(selected);
              setDrag({
                mode: 'VELOCITY', startX: event.clientX, startY: event.clientY,
                rect: event.currentTarget.parentElement!.getBoundingClientRect(),
                originals: notes.filter((candidate) => selected.includes(candidate.engineId)),
              });
            }}
          />)}
        </div>
      </div>
    </div>
  );
}
