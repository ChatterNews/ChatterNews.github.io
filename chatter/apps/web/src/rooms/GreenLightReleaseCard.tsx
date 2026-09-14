import { useState } from 'react';
import type { ReleaseLaneId, StoryReleaseCard } from '@chatter/shared';
import './GreenLightReleaseCard.css';

const STATUS_LABEL = { CLEAR: 'Checked', OPEN: 'Needs work', NOT_NEEDED: 'Not used', EXCEPTION: 'Adviser exception' } as const;

export function GreenLightReleaseCard({ card, adviser, busy, onNavigate, onApproveException, onClearException }: {
  card: StoryReleaseCard;
  adviser: boolean;
  busy: boolean;
  onNavigate: (route: string) => void;
  onApproveException: (laneId: ReleaseLaneId, reason: string) => void | Promise<void>;
  onClearException: (laneId: ReleaseLaneId) => void | Promise<void>;
}) {
  const [exceptionLane, setExceptionLane] = useState<ReleaseLaneId>();
  const [reason, setReason] = useState('');
  const activeLane = card.lanes.find((lane) => lane.id === exceptionLane);

  return <section className="greenlight-release-board" aria-labelledby="release-board-title">
    <header><div><span className="newsroom-eyebrow">RELEASE BOARD</span><h2 id="release-board-title">{card.ready ? 'Release path clear' : `${card.openCount} ${card.openCount === 1 ? 'stop' : 'stops'} before release`}</h2><p>Follow the signal from reporting to the files the audience will receive.</p></div><div className={`greenlight-board-lamp ${card.ready ? 'ready' : 'open'}`}><i /><b>{card.ready ? 'CLEAR' : 'HOLD'}</b><small>{card.ready ? 'Final listen, then release' : 'Open a card for the next move'}</small></div></header>
    <div className="greenlight-signal-line" aria-hidden="true"><i style={{ width: `${Math.round(card.lanes.filter((lane) => lane.status !== 'OPEN').length / Math.max(1, card.lanes.length) * 100)}%` }} /></div>
    <div className="greenlight-release-lanes">{card.lanes.map((lane, index) => <article key={lane.id} data-status={lane.status}>
      <div className="greenlight-lane-number"><span>{String(index + 1).padStart(2, '0')}</span><i /></div>
      <div className="greenlight-lane-copy"><span>{lane.room}</span><h3>{lane.icon} {lane.label}</h3><b>{STATUS_LABEL[lane.status]}</b><p>{lane.detail}</p>{lane.exception && <blockquote><strong>Adviser exception</strong>{lane.exception.reason}</blockquote>}</div>
      <div className="greenlight-lane-actions">{lane.route && (lane.status === 'OPEN' || lane.status === 'EXCEPTION') && <button className="newsroom-button" disabled={busy} onClick={() => onNavigate(lane.route!)}>{lane.actionLabel ?? 'Open room'} ↗</button>}{adviser && lane.status === 'OPEN' && lane.exceptionAllowed && <button className="greenlight-exception-button" disabled={busy} onClick={() => { setExceptionLane(lane.id); setReason(''); }}>Approve exception</button>}{adviser && lane.status === 'EXCEPTION' && <button className="greenlight-exception-button" disabled={busy} onClick={() => void onClearException(lane.id)}>Remove exception</button>}{lane.status === 'OPEN' && !lane.exceptionAllowed && <small>Required · no exception</small>}</div>
    </article>)}</div>
    {activeLane && <form className="greenlight-exception-form" onSubmit={(event) => { event.preventDefault(); if (!reason.trim()) return; void Promise.resolve(onApproveException(activeLane.id, reason)).then(() => { setExceptionLane(undefined); setReason(''); }); }}><div><span className="newsroom-eyebrow">VISIBLE EXCEPTION · {activeLane.label.toUpperCase()}</span><h3>Record why this release can move without this check</h3><p>The crew will see this reason. A revision or new export clears the exception.</p></div><textarea autoFocus aria-label="Exception reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="State the evidence, limitation, or deadline decision." /><div><button type="button" className="newsroom-button" disabled={busy} onClick={() => { setExceptionLane(undefined); setReason(''); }}>Cancel</button><button type="submit" className="newsroom-button primary" disabled={busy || reason.trim().length < 12}>Save exception</button></div></form>}
  </section>;
}
