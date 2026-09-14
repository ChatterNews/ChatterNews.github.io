/**
 * What the checker was not sure about, waiting for a teacher.
 *
 * SPEC S4 routes a middling score here rather than approving or rejecting it.
 * Nothing else in the app can clear this queue, so without it a quarantined
 * picture blocks publishing forever.
 */
import { useEffect, useState } from 'react';
import { quarantined, releaseFromQuarantine, rejectFromQuarantine, type Asset } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';

export function QuarantineQueue({ adviser, onChanged }: {
  adviser: boolean;
  onChanged: () => void;
}) {
  const store = useStore();
  const [waiting, setWaiting] = useState<Asset[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let urls: string[] = [];
    (async () => {
      const rows = await quarantined(store);
      setWaiting(rows);

      // Only a teacher ever sees these bytes rendered.
      if (!adviser) return;
      const made: Record<string, string> = {};
      for (const asset of rows) {
        if (!asset.kind.startsWith('IMAGE')) continue;
        const bytes = await store.blobs.get(asset.sha256);
        if (!bytes) continue;
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: asset.mime }));
        made[asset.id] = url;
        urls.push(url);
      }
      setPreviews(made);
    })();
    return () => { urls.forEach(URL.revokeObjectURL); };
  }, [store, adviser, note]);

  async function decide(asset: Asset, letThrough: boolean) {
    try {
      const decider = {
        actor: 'me',
        role: adviser ? ('ADVISER' as const) : ('STUDENT' as const),
      };
      if (letThrough) await releaseFromQuarantine(store, asset.id, decider);
      else await rejectFromQuarantine(store, asset.id, decider);
      setNote(letThrough ? 'That one can be used now.' : 'Thrown out, and the file is gone.');
      onChanged();
    } catch (error) {
      setNote((error as Error).message);
    }
  }

  if (waiting.length === 0) return null;

  return (
    <div className="sect">
      <h2>
        {adviser ? 'Media checkpoint' : 'Waiting for an adviser'}
        <span className="zig" />
      </h2>
      <p className="sub" style={{ margin: '0 0 14px' }}>
        {adviser
          ? 'Preview each item, confirm that it belongs in the story, then approve it or send it back.'
          : 'These files need an adviser decision before the crew can publish them.'}
      </p>

      {note && <p className="note" style={{ marginBottom: 12 }}>{note}</p>}

      <div className="rows">
        {waiting.map((asset) => (
          <div className="r" key={asset.id}>
            <span className="chip k-wait"><span className="d" />
              {asset.kind === 'IMAGE' ? 'Picture' : asset.kind === 'AUDIO' ? 'Sound' : 'Video'}
            </span>

            {adviser && previews[asset.id] && (
              <img
                src={previews[asset.id]}
                alt=""
                style={{
                  width: 56, height: 56, objectFit: 'cover',
                  border: 'var(--bw) solid var(--ink)', borderRadius: 6,
                }}
              />
            )}

            <div className="grow">
              <div className="nm">{asset.creator ?? 'Somebody in the club added this'}</div>
              <div className="sb">
                {asset.gateScore !== undefined
                  ? `The checker was ${Math.round(asset.gateScore * 100)}% unsure`
                  : 'The checker was not running when this arrived'}
              </div>
            </div>

            {adviser && (
              <>
                <button className="b sm go" onClick={() => decide(asset, true)}>Let it through</button>
                <button className="b sm" onClick={() => decide(asset, false)}>Throw it out</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
