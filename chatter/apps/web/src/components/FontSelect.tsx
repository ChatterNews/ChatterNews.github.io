import type { CSSProperties } from 'react';
import { EDITOR_FONT_GROUPS } from '../styles/fonts.js';

export function FontSelect({ value, onChange, sample = 'Aa', ariaLabel }: {
  value: string;
  onChange: (value: string) => void;
  sample?: string;
  ariaLabel?: string;
}) {
  return <div className="chatter-font-picker">
    <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} style={{ fontFamily: value } as CSSProperties}>
      {EDITOR_FONT_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>
        {group.fonts.map((font) => <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>)}
      </optgroup>)}
    </select>
    <span aria-hidden="true" title={`Preview of ${value}`} style={{ fontFamily: value }}>{sample.trim().slice(0, 16) || 'Aa'}</span>
  </div>;
}
