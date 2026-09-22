import type { CSSProperties } from 'react';
import type { FoleyTool } from './FoleyArrangement.js';

export const foleyTools: { id: FoleyTool; label: string; color: string; hint: string }[] = [
  { id: 'SOUNDS', label: 'Sounds', color: '#78d5c6', hint: 'Find a sound or bring your own.' },
  { id: 'RECORD', label: 'Record', color: '#f1a38d', hint: 'Catch a sound from the world around you.' },
  { id: 'MAKE', label: 'Make', color: '#f3d768', hint: 'Start with a sound, then make it yours.' },
  { id: 'ARRANGE', label: 'Arrange', color: '#9cbde9', hint: 'Put sounds where you want them.' },
  { id: 'SHAPE', label: 'Shape', color: '#c7a8e8', hint: 'A softer edge. A shorter hit. A different pitch.' },
  { id: 'MIX', label: 'Mix', color: '#aecb86', hint: 'Give each layer its place in the sound.' },
  { id: 'FINISH', label: 'Finish', color: '#edb5c8', hint: 'Save it, credit it, use it.' },
];

export function FoleyToolIcon({ tool }: { tool: FoleyTool }) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {tool === 'SOUNDS' && <><path d="M6 15V9h13l5 5h18v25H6Z" fill="#fff7df" /><path d="M7 20h36l-4 19H4Z" fill="var(--tool-color)" /><path d="M17 27v5m5-8v11m5-9v7m5-5v3" /></>}
    {tool === 'RECORD' && <><rect x="16" y="5" width="16" height="26" rx="8" fill="#fff7df" /><path d="M11 23v2a13 13 0 0 0 26 0v-2M24 38v6m-8 0h16M20 12h8m-8 5h8m-8 5h8" /></>}
    {tool === 'MAKE' && <><path d="m8 38 19-19 5 5-19 19Z" fill="#fff7df" /><path d="m28 7 1 6 6 1-6 2-1 6-2-6-6-2 6-1ZM39 25v7m-3-3h6M11 9v8m-4-4h8" /></>}
    {tool === 'ARRANGE' && <><rect x="5" y="8" width="25" height="9" rx="3" fill="#fff7df" /><rect x="17" y="21" width="26" height="9" rx="3" fill="var(--tool-color)" /><rect x="9" y="34" width="22" height="8" rx="3" fill="#fff7df" /><path d="m34 9 6 4-6 4M8 21v9" /></>}
    {tool === 'SHAPE' && <><circle cx="12" cy="34" r="6" fill="#fff7df" /><circle cx="35" cy="34" r="6" fill="#fff7df" /><path d="m16 29 20-22M31 29 11 7" /><circle cx="24" cy="21" r="2" fill="currentColor" /></>}
    {tool === 'MIX' && <><path d="M11 7v34M24 7v34M37 7v34" /><rect x="5" y="14" width="12" height="7" rx="2" fill="#fff7df" /><rect x="18" y="29" width="12" height="7" rx="2" fill="#fff7df" /><rect x="31" y="10" width="12" height="7" rx="2" fill="#fff7df" /></>}
    {tool === 'FINISH' && <><path d="m6 16 18-9 18 9v24H6Z" fill="#fff7df" /><path d="m6 16 18 10 18-10M24 26v14" /><path d="m17 12 18 10v8" /><path d="m20 5 3-3m10 4 2-3" /></>}
  </svg>;
}

export function FoleyPalette({ selected, onSelect, disabled }: { selected: FoleyTool; onSelect: (tool: FoleyTool) => void; disabled: boolean }) {
  return <nav className="foley-palette" aria-label="Sound tools">{foleyTools.map(tool => <button key={tool.id} aria-pressed={selected === tool.id} disabled={disabled} title={tool.hint} style={{ '--tool-color': tool.color } as CSSProperties} onClick={() => onSelect(tool.id)}><FoleyToolIcon tool={tool.id} /><span>{tool.label}</span></button>)}</nav>;
}
