import { ReilyHelpBoundary } from './ReilyHelpBoundary.js';
import './ReilyIntro.css';
import './ReilyHelp.css';
import { mergeReilySituation } from './reily-help-context.js';
/** Reily, the newsroom guide. The filename remains as a compatibility shim. */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Sprite.js';
import { useReilySignals } from './ReilyContextProvider.js';
import type { ReilyContext, ReilyRoom } from './reily-advice.js';
import { REILY_GOALS, roomOrientation } from './reily-navigation.js';
import {
  initialReilyHintOpen,
  readReilyPocket,
  reduceReilyHint,
  reduceReilyPocket,
  readReilyIntroduced,
  markReilyIntroduced,
  writeReilyPocket,
} from './reily-session.js';
import { SPIRAL_ROOMS } from './spiral-navigation.js';
import { useReilyMotion } from './useReilyMotion.js';

export interface ReilyProps {
  lowSpec?: boolean;
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

const ReilyHelpPanel = lazy(() => import('./ReilyHelpPanel.js'));

export function Reily({ context, userId, recommendedRoom, onNavigate, onRevealRoom, lowSpec = false }: ReilyProps) {
  const signals = useReilySignals();
  const mergedContext = useMemo(() => mergeReilySituation({
    ...context, focus: signals.focus ?? context.focus, recovery: signals.recovery ?? context.recovery,
  }, signals.situations), [context, signals.focus, signals.recovery, signals.situations]);
  const [mode, setMode] = useState<'HELP' | 'FIND'>('HELP');
  const [showOrientation, setShowOrientation] = useState(false);
  const [hintOpen, setHintOpen] = useState(initialReilyHintOpen);
  const [introduced, setIntroduced] = useState(() => readReilyIntroduced(userId));
  const [parked, setParked] = useState(readReilyPocket);
  const characterRef = useRef<HTMLButtonElement>(null);
  const motion = useReilyMotion(characterRef, parked, lowSpec);
  const contextKey = `${mergedContext.room}:${mergedContext.story?.id ?? ''}`;

  useEffect(() => {
    setHintOpen(false);
    setIntroduced(readReilyIntroduced(userId));
  }, [userId]);

  function introduce() {
    setIntroduced(true);
    markReilyIntroduced(userId);
  }


  useEffect(() => {
    setMode('HELP');
    setShowOrientation(false);
  }, [contextKey]);

  useEffect(() => { writeReilyPocket(parked); }, [parked]);

  function closePanel() {
    setHintOpen((open) => reduceReilyHint(open, 'DISMISS'));
    window.requestAnimationFrame(() => characterRef.current?.focus());
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
    introduce();
    setHintOpen((open) => reduceReilyHint(open, 'DISMISS'));
    setParked((current) => reduceReilyPocket(current, 'PARK'));
  }

  function returnFromPocket() {
    introduce();
    setParked((current) => reduceReilyPocket(current, 'RETURN'));
    setHintOpen((open) => reduceReilyHint(open, 'ASK'));
  }

  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !hintOpen) return;
    event.preventDefault();
    closePanel();
  }

  if (parked) return (
    <button type="button" data-reily-local-help className="piptab reilly-return show" aria-label="Bring Reily back" onClick={returnFromPocket}>
      <span className="reilly-return-portrait" aria-hidden="true"><span className="reilly-art" /></span>
      <span><b>Reily</b><small>Open help</small></span>
    </button>
  );

  const hasRecovery = Boolean(mergedContext.recovery || mergedContext.situation?.error || mergedContext.situation?.folderError);
  return (
    <aside
      data-reily-local-help
      className={`pipdock reilly-guide ${hintOpen ? 'tips-open' : 'tips-closed'}`}
      data-mood={hasRecovery ? 'oh' : 'smile'}
      aria-label="Reily's newsroom help"
      onKeyDown={handleKeys}
    >
      {hintOpen && (
        <div id="reily-coach-panel" className="bubble reilly-bubble reilly-coach-panel">
          <div className="reilly-bubble-head">
            <span>REILY · {roomName(mergedContext.room)}</span>
            <button className="x" aria-label="Close Reily's help" onClick={closePanel}><Icon name="ic-x" /></button>
          </div>
          <div className="reilly-mode-tabs" role="tablist" aria-label="Reily help modes" onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'HELP' : event.key === 'End' ? 'FIND' : mode === 'HELP' ? 'FIND' : 'HELP';
            setMode(next); document.getElementById(next === 'HELP' ? 'reily-help-tab' : 'reily-find-tab')?.focus();
          }}>
            <button id="reily-help-tab" type="button" role="tab" tabIndex={mode === 'HELP' ? 0 : -1} aria-selected={mode === 'HELP'} aria-controls="reily-help-panel" onClick={() => setMode('HELP')}>Help here</button>
            <button id="reily-find-tab" type="button" role="tab" tabIndex={mode === 'FIND' ? 0 : -1} aria-selected={mode === 'FIND'} aria-controls="reily-find-panel" onClick={() => setMode('FIND')}>Find a room</button>
          </div>

          <div id="reily-help-panel" className="reilly-mode-panel" role="tabpanel" aria-labelledby="reily-help-tab" hidden={mode !== 'HELP'}>
            <ReilyHelpBoundary><Suspense fallback={<p className="reily-help-loading" role="status">Opening Reily’s help…</p>}>
              {mode === 'HELP' && <ReilyHelpPanel key={contextKey} context={mergedContext} canNavigate={mergedContext.situation?.scope !== 'overlay'} onNavigate={travel} />}
            </Suspense></ReilyHelpBoundary>
          </div>

          <div id="reily-find-panel" className="reilly-mode-panel reilly-find-panel" role="tabpanel" aria-labelledby="reily-find-tab" hidden={mode !== 'FIND'}>
            <div className="reilly-route-actions">
              {recommendedRoom && recommendedRoom !== mergedContext.room && (
                <button type="button" data-reily-navigation disabled={Boolean(mergedContext.situation?.busy || mergedContext.situation?.recording || mergedContext.situation?.scope === 'overlay')} onClick={() => travel(recommendedRoom)}><small>Next stop</small><b>Next stop · {roomName(recommendedRoom)}</b></button>
              )}
              {mergedContext.previousRoom && mergedContext.previousRoom !== mergedContext.room && (
                <button type="button" data-reily-navigation disabled={Boolean(mergedContext.situation?.busy || mergedContext.situation?.recording || mergedContext.situation?.scope === 'overlay')} onClick={() => travel(mergedContext.previousRoom!)}><small>Go back</small><b>Back to {roomName(mergedContext.previousRoom)}</b></button>
              )}
              <button type="button" aria-expanded={showOrientation} onClick={() => setShowOrientation((open) => !open)}><small>This room</small><b>What happens here?</b></button>
            </div>
            {showOrientation && <p className="reilly-orientation">{roomOrientation(mergedContext.room)}</p>}
            <p className="reilly-goal-label">I want to…</p>
            <div className="reilly-goal-grid">
              {REILY_GOALS.map((goal) => <button type="button" key={goal.id} data-reily-navigation disabled={Boolean(mergedContext.situation?.busy || mergedContext.situation?.recording || mergedContext.situation?.scope === 'overlay')} onClick={() => reveal(goal.room)}>{goal.label}</button>)}
            </div>
          </div>
        </div>
      )}

      <button type="button" className="reilly-park" aria-label="Park Reily" title="Park Reily" onClick={park}>
        <span className="reilly-park-arrow" aria-hidden="true">→</span>
      </button>

      <button
        ref={characterRef}
        type="button"
        className="pipbody reilly-character"
        data-motion={motion}
        aria-label={hasRecovery ? `Ask Reily about a problem in ${roomName(mergedContext.room)}` : 'Ask Reily for help'}
        aria-expanded={hintOpen}
        aria-controls="reily-coach-panel"
        onClick={() => { introduce(); setHintOpen((open) => reduceReilyHint(open, 'TOGGLE')); }}
      >
        {!introduced && <span className="reily-click-hint" aria-hidden="true">Click me</span>}
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
