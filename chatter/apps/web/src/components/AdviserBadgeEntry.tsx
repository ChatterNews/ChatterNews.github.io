import { useMemo, useState } from 'react';
import { initialsOf, type User } from '@chatter/shared';

export interface AdviserSetupInput {
  adviserId?: string;
  penName?: string;
  pin: string;
}

export function AdviserBadgeEntry({
  advisers, hasPin, preferredAdviserId, onBack, onSetup, onUnlock,
}: {
  advisers: User[];
  hasPin: boolean;
  preferredAdviserId?: string;
  onBack: () => void;
  onSetup: (input: AdviserSetupInput) => Promise<boolean>;
  onUnlock: (userId: string, pin: string) => Promise<boolean>;
}) {
  const initialId = useMemo(
    () => advisers.find((user) => user.id === preferredAdviserId)?.id ?? advisers[0]?.id ?? '',
    [advisers, preferredAdviserId],
  );
  const [selectedId, setSelectedId] = useState(initialId);
  const [penName, setPenName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(undefined);
    if (!/^\d{4}$/.test(pin)) { setError('Enter a four-digit PIN.'); return; }
    if (!hasPin && pin !== confirmPin) { setError('Those PINs do not match. Try them again.'); return; }
    if (!hasPin && !selectedId && !penName.trim()) { setError('Put a name on the adviser badge.'); return; }
    if (hasPin && !selectedId) { setError('Choose an adviser badge.'); return; }

    setBusy(true);
    try {
      const ok = hasPin
        ? await onUnlock(selectedId, pin)
        : await onSetup({ ...(selectedId ? { adviserId: selectedId } : { penName }), pin });
      if (!ok) setError(hasPin ? 'That PIN did not open the adviser desk.' : 'The adviser badge was not made. Press the button to try again.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The adviser badge was not made. Press the button to try again.');
    } finally { setBusy(false); }
  }

  return <section className="checkin-card adviser-entry" aria-labelledby="adviser-entry-title">
    <button type="button" className="checkin-back" onClick={onBack}>← Newsroom Check-In</button>
    <div className="checkin-eyebrow">STAFF BADGE</div>
    <h1 id="adviser-entry-title">{hasPin ? 'Adviser check-in' : 'Make the adviser badge'}</h1>
    <p>{hasPin
      ? 'Choose your badge, then use the four digits you set for the adviser desk.'
      : 'This name appears on reviews and publishing receipts. Set four digits for the adviser desk.'}</p>

    {advisers.length > 0 && <div className="adviser-badge-list" role="radiogroup" aria-label="Adviser badges">
      {advisers.map((user) => <button
        type="button"
        role="radio"
        aria-checked={selectedId === user.id}
        className={selectedId === user.id ? 'selected' : ''}
        key={user.id}
        onClick={() => setSelectedId(user.id)}
      >
        <span>{initialsOf(user.penName)}</span>
        <b>{user.penName}</b>
        <small>Adviser</small>
      </button>)}
    </div>}

    {!hasPin && advisers.length === 0 && <label className="checkin-field">
      <span>Badge name</span>
      <input autoFocus value={penName} placeholder="Ms. Rivera" onChange={(event) => setPenName(event.target.value)} />
    </label>}

    <div className="adviser-pin-fields">
      <label className="checkin-field">
        <span>Adviser PIN</span>
        <input
          autoFocus={hasPin || advisers.length > 0}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          aria-label="Adviser PIN"
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </label>
      {!hasPin && <label className="checkin-field">
        <span>Confirm PIN</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={confirmPin}
          onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </label>}
    </div>

    {error && <div className="checkin-error" role="alert"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError(undefined)}>×</button></div>}
    <button type="button" className="checkin-primary adviser" disabled={busy} onClick={() => void submit()}>
      {busy ? 'Checking badge…' : hasPin ? 'Open adviser desk' : 'Make adviser badge'}
    </button>
  </section>;
}
