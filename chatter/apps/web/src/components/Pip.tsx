import { workspaceStorage } from '../portable/workspace-context.js';
/** Reily, the newsroom guide. The filename remains as a compatibility shim. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Sprite.js';
import { useReilySignals } from './ReilyContextProvider.js';
import {
  eligibleReilyAdvice,
  nextReilyAdvice,
  type ReilyAdvice,
  type ReilyContext,
  type ReilyRoom,
} from './reily-advice.js';
import { REILY_GOALS, roomOrientation } from './reily-navigation.js';
import {
  createReilySeenMemory,
  initialReilyHintOpen,
  readReilyPocket,
  reduceReilyHint,
  reduceReilyPocket,
  REILY_SESSION_KEY,
  writeReilyPocket,
} from './reily-session.js';
import { SPIRAL_ROOMS } from './spiral-navigation.js';

export interface ReilyProps {
  context: ReilyContext;
  userId: string;
  recommendedRoom?: ReilyRoom;
  onNavigate(room: ReilyRoom): void;
  onRevealRoom(room: ReilyRoom): void;
}

function roomName(room: ReilyRoom): string {
  if (room === 'home') return 'Clubhouse';
  if (room === 'frontdesk') return 'Front Desk';
  return SPIRAL_ROOMS.find((entry) => entry.slug === room)?.name ?? room;
}

function adviceForId(context: ReilyContext, id: string | undefined, fallback: ReilyAdvice): ReilyAdvice {
  return eligibleReilyAdvice(context).find((card) => card.id === id) ?? fallback;
}

export function Reily({ context, userId, recommendedRoom, onNavigate, onRevealRoom }: ReilyProps) {
  const signals = useReilySignals();
  const mergedContext = useMemo<ReilyContext>(() => ({
    ...context,
    focus: signals.focus ?? context.focus,
    recovery: signals.recovery ?? context.recovery,
  }), [context, signals.focus, signals.recovery]);
  const seenMemory = useMemo(() => createReilySeenMemory(userId), [userId]);
  const initialSelection = nextReilyAdvice(mergedContext, seenMemory.read());
  const [cardId, setCardId] = useState(initialSelection.card.id);
  const [mode, setMode] = useState<'HELP' | 'FIND'>('HELP');
  const [showOrientation, setShowOrientation] = useState(false);
  const [requestedAnother, setRequestedAnother] = useState(false);
  const [hintOpen, setHintOpen] = useState(() => {
    const compact = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 700px)').matches;
    try { return initialReilyHintOpen(workspaceStorage(window.sessionStorage).getItem(REILY_SESSION_KEY), compact); }
    catch { return !compact; }
  });
  const [parked, setParked] = useState(readReilyPocket);
  const characterRef = useRef<HTMLButtonElement>(null);
  const card = adviceForId(mergedContext, cardId, initialSelection.card);
  const contextKey = `${mergedContext.room}:${mergedContext.focus ?? ''}:${mergedContext.recovery?.kind ?? ''}`;

  useEffect(() => {
    try { workspaceStorage(window.sessionStorage).setItem(REILY_SESSION_KEY, 'seen'); }
    catch { /* Storage can be unavailable in a locked-down browser. */ }
  }, []);

  useEffect(() => {
    const next = nextReilyAdvice(mergedContext, seenMemory.read());
    setCardId(next.card.id);
    setMode('HELP');
    setShowOrientation(false);
    setRequestedAnother(false);
    setHintOpen((open) => reduceReilyHint(open, 'ROOM_CHANGED'));
  }, [contextKey, mergedContext, seenMemory]);

  useEffect(() => { seenMemory.mark(card.id); }, [card.id, seenMemory]);

  useEffect(() => { writeReilyPocket(parked); }, [parked]);

  function closePanel() {
    setHintOpen((open) => reduceReilyHint(open, 'DISMISS'));
    window.requestAnimationFrame(() => characterRef.current?.focus());
  }

  function anotherTip() {
    const seen = seenMemory.mark(card.id);
    const next = nextReilyAdvice(mergedContext, seen);
    if (next.exhausted) seenMemory.replace([]);
    setCardId(next.card.id);
    setRequestedAnother(true);
  }

  function travel(room: ReilyRoom) {
    closePanel();
    onNavigate(room);
  }

  function reveal(room: ReilyRoom) {
    closePanel();
    onRevealRoom(room);
  }

  function park() {
    setHintOpen((open) => reduceReilyHint(open, 'DISMISS'));
    setParked((current) => reduceReilyPocket(current, 'PARK'));
  }

  function returnFromPocket() {
    setParked((current) => reduceReilyPocket(current, 'RETURN'));
    setHintOpen((open) => reduceReilyHint(open, 'ASK'));
  }

  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !hintOpen) return;
    event.preventDefault();
    closePanel();
  }

  if (parked) return (
    <button type="button" className="piptab reilly-return show" aria-label="Bring Reily back" onClick={returnFromPocket}>
      <span className="reilly-return-portrait" aria-hidden="true"><span className="reilly-art" /></span>
      <span><b>Reily</b><small>Open help</small></span>
    </button>
  );

  const hasRecovery = Boolean(mergedContext.recovery);
  return (
    <aside
      className={`pipdock reilly-guide ${hintOpen ? 'tips-open' : 'tips-closed'}`}
      data-mood={card.mood ?? 'smile'}
      aria-label="Reily's newsroom help"
      onKeyDown={handleKeys}
    >
      {hintOpen && (
        <div className="bubble reilly-bubble reilly-coach-panel">
          <div className="reilly-bubble-head">
            <span>REILY · {roomName(mergedContext.room)}</span>
            <button className="x" aria-label="Close Reily's help" onClick={closePanel}><Icon name="ic-x" /></button>
          </div>
          <div className="reilly-mode-tabs" role="tablist" aria-label="Reily help modes">
            <button id="reily-help-tab" type="button" role="tab" aria-selected={mode === 'HELP'} aria-controls="reily-help-panel" onClick={() => setMode('HELP')}>Help here</button>
            <button id="reily-find-tab" type="button" role="tab" aria-selected={mode === 'FIND'} aria-controls="reily-find-panel" onClick={() => setMode('FIND')}>Find a room</button>
          </div>

          <div id="reily-help-panel" className="reilly-mode-panel" role="tabpanel" aria-labelledby="reily-help-tab" hidden={mode !== 'HELP'}>
            <small className="reilly-card-kind">{card.kind.toLowerCase()}</small>
            <p className="say" aria-live={requestedAnother ? 'polite' : 'off'}>{card.text}</p>
            <div className="btns reilly-actions">
              <button className="b sm ghost" type="button" onClick={anotherTip}>Another tip →</button>
            </div>
          </div>

          <div id="reily-find-panel" className="reilly-mode-panel reilly-find-panel" role="tabpanel" aria-labelledby="reily-find-tab" hidden={mode !== 'FIND'}>
            <div className="reilly-route-actions">
              {recommendedRoom && recommendedRoom !== mergedContext.room && (
                <button type="button" onClick={() => travel(recommendedRoom)}><small>Next stop</small><b>Next stop · {roomName(recommendedRoom)}</b></button>
              )}
              {mergedContext.previousRoom && mergedContext.previousRoom !== mergedContext.room && (
                <button type="button" onClick={() => travel(mergedContext.previousRoom!)}><small>Go back</small><b>Back to {roomName(mergedContext.previousRoom)}</b></button>
              )}
              <button type="button" aria-expanded={showOrientation} onClick={() => setShowOrientation((open) => !open)}><small>This room</small><b>What happens here?</b></button>
            </div>
            {showOrientation && <p className="reilly-orientation">{roomOrientation(mergedContext.room)}</p>}
            <p className="reilly-goal-label">I want to…</p>
            <div className="reilly-goal-grid">
              {REILY_GOALS.map((goal) => <button type="button" key={goal.id} onClick={() => reveal(goal.room)}>{goal.label}</button>)}
            </div>
          </div>
        </div>
      )}

      <button type="button" className="reilly-park" aria-label="Park Reily" title="Park Reily" onClick={park}>
        <span className="reilly-park-arrow" aria-hidden="true">→</span>
      </button>

      <button
        ref={characterRef}
        key={contextKey}
        type="button"
        className="pipbody reilly-character"
        aria-label={hasRecovery ? `Ask Reily about a problem in ${roomName(mergedContext.room)}` : 'Ask Reily for help'}
        onClick={() => setHintOpen((open) => reduceReilyHint(open, 'ASK'))}
      >
        {hasRecovery && <span className="reilly-recovery-dot" aria-hidden="true" />}
        <span className="reilly-art" aria-hidden="true" />
        <span className="compact-help-label" aria-hidden="true">Help</span>
        <span className="reilly-nameplate" aria-hidden="true"><b>Reily</b><small>Newsroom guide</small></span>
      </button>
    </aside>
  );
}

/** @deprecated Misspelled compatibility name. */
export const Reilly = Reily;
/** @deprecated Use Reily. Kept for older imports. */
export const Pip = Reily;
