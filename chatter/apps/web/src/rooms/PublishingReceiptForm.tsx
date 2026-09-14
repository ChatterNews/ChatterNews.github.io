import { useId, useState } from 'react';
import type { PublishingReceiptInput } from '@chatter/shared';
import './PublishingReceiptForm.css';

interface DestinationDraft { platform: string; url: string }

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function PublishingReceiptForm({ title, busy, disabled, onSubmit }: {
  title: string;
  busy: boolean;
  disabled?: boolean;
  onSubmit: (receipt: PublishingReceiptInput) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const platformListId = useId();
  const [destinations, setDestinations] = useState<DestinationDraft[]>([{ platform: '', url: '' }]);
  const [publishedDate, setPublishedDate] = useState(today());
  const [note, setNote] = useState('');

  function patchDestination(index: number, patch: Partial<DestinationDraft>) {
    setDestinations((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  if (!open) return <button className="newsroom-button dark publishing-receipt-open" disabled={busy || disabled} onClick={() => setOpen(true)}>Add Publishing Receipt</button>;

  return <form className="publishing-receipt" onSubmit={(event) => {
    event.preventDefault();
    const publishedAt = new Date(`${publishedDate}T12:00:00`).getTime();
    void onSubmit({ destinations, publishedAt, note });
  }}>
    <header><div><span className="newsroom-eyebrow">PUBLISHING RECEIPT</span><h3>Where can the audience find “{title}”?</h3><p>Upload with your usual school account, then keep the public link here.</p></div><button type="button" aria-label="Close Publishing Receipt" onClick={() => setOpen(false)}>×</button></header>
    <div className="publishing-receipt-destinations">
      {destinations.map((destination, index) => <div className="publishing-receipt-destination" key={index}>
        <label><span>Published on</span><input list={platformListId} value={destination.platform} onChange={(event) => patchDestination(index, { platform: event.target.value })} placeholder="School website" required /></label>
        <label><span>Public link</span><input type="url" value={destination.url} onChange={(event) => patchDestination(index, { url: event.target.value })} placeholder="https://…" required /></label>
        {destinations.length > 1 && <button type="button" aria-label={`Remove destination ${index + 1}`} onClick={() => setDestinations((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button>}
      </div>)}
    </div>
    <datalist id={platformListId}><option value="School website"/><option value="Podcast host"/><option value="YouTube"/><option value="Instagram"/><option value="Facebook"/><option value="Newsletter"/></datalist>
    <button type="button" className="publishing-receipt-add" onClick={() => setDestinations((items) => [...items, { platform: '', url: '' }])}>＋ Add another place</button>
    <div className="publishing-receipt-details"><label><span>Publication date</span><input type="date" value={publishedDate} onChange={(event) => setPublishedDate(event.target.value)} required /></label><label><span>Adviser note <small>optional</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything the next adviser should know" /></label></div>
    <footer><small>This receipt moves the finished edition into Reruns.</small><button type="submit" className="newsroom-button dark" disabled={busy}>{busy ? 'Recording…' : 'Record as published'}</button></footer>
  </form>;
}
