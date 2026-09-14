/**
 * The Picture Box. Every candidate goes through gate.ingest before it is ever
 * shown in the story - there is no path from here to a Story.body that skips
 * the Gate. SPEC S4.
 *
 * Openverse search needs the media proxy (it screens the query server-side,
 * because a check that runs only in the browser is a suggestion, not a
 * control). Until that proxy is deployed, the box says so plainly and the
 * upload path - which is fully local - still works.
 */
import { useState } from 'react';
import { recordRole, type User } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { useGate } from '../gate/GateProvider.js';
import { Icon } from './Sprite.js';

export function PictureBox({ storyId, me, onPicked, onClose }: {
  storyId: string;
  me?: User;
  onPicked: (src: string, credit: string) => void;
  onClose: () => void;
}) {
  const { gate, classifierReady } = useGate();
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setRefused(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await gate.ingest({
        bytes,
        source: 'upload',
        meta: { kind: 'IMAGE', mime: file.type || 'image/jpeg', origin: 'UPLOAD', storyId, license: 'OWN' },
      });

      if (result.status === 'APPROVED' && result.assetId) {
        if (me) await recordRole(store, { userId: me.id, storyId, role: 'picture' });
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: file.type }));
        onPicked(url, 'Original photo · Chatter crew');
        return;
      }

      setRefused(
        result.status === 'QUARANTINED'
          ? 'This photo needs an adviser check before it can be published. You can keep working while it waits.'
          : 'This photo cannot be used here. Choose a different one and keep going.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="picker" role="dialog" aria-labelledby="pk-t" style={{ display: 'block' }}>
      <div className="pkhead">
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
          <h3 id="pk-t" style={{ margin: 0, fontFamily: 'var(--f-pop)', fontSize: 23 }}>The Picture Box</h3>
          <div className="grow" />
          <button className="b sm" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="pkbody">
        <div className="shield" style={{ marginBottom: 14 }}>
          <Icon name="ic-gate" />
          <div>
            {classifierReady
              ? 'Photo checkpoint: use an original or properly licensed image, name the creator, and make sure everyone pictured has permission.'
              : 'New photos need an adviser check right now. You can add one and keep working on the rest of the page.'}
          </div>
        </div>

        <div className="rows">
          <div className="r">
            <div className="grow">
              <div className="nm">Add your own photo</div>
              <div className="sb">Choose a clear original image and be ready to credit the photographer.</div>
            </div>
            <label className="b sm go" style={{ cursor: 'pointer' }}>
              {busy ? 'Checking…' : 'Choose one'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
              />
            </label>
          </div>

          <div className="r">
            <div className="grow">
              <div className="nm">Find a reusable photo</div>
              <div className="sb">
                Openverse searches pictures with reuse licenses. Check the exact license and keep the creator credit.
              </div>
            </div>
            <span className="chip k-wait"><span className="d" />Coming soon</span>
          </div>
        </div>

        {refused && <p className="note" style={{ marginTop: 14 }}>{refused}</p>}
      </div>
    </div>
  );
}
