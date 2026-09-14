/** A room-level field guide for the craft, controls, and transferable skills. */
import { useState, type ReactNode } from 'react';
import { Icon } from './Sprite.js';

export interface InsideRow { nm: string; sb: ReactNode }

export function LookInside({ room, intro, rows, children }: {
  room: string;
  intro: string;
  rows: InsideRow[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sect" style={{ marginTop: 24 }}>
      <button className="reach" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="ic-chev" />Pro tips · {room}
      </button>
      <div className="deep" style={{ display: open ? 'block' : 'none' }}>
        <p className="note" style={{ marginBottom: 13 }}>{intro}</p>
        <div className="rows insidegrid">
          {rows.map((r) => (
            <div className="r" key={r.nm}>
              <div className="grow">
                <div className="nm">{r.nm}</div>
                <div className="sb">{r.sb}</div>
              </div>
            </div>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
