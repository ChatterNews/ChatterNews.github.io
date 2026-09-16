import type { ReactNode } from 'react';

export type ControlKind = 'files' | 'media' | 'screen' | 'rooms' | 'adviser' | 'leave' | 'back' | 'close' | 'record' | 'cut' | 'mix' | 'list' | 'package';

// Small controls use a simpler, 32-unit companion to the room illustrations.
// Current color keeps the drawings legible on both light and dark key faces.
const drawings: Record<ControlKind, ReactNode> = {
  files: <><path d="M4 10V7a2 2 0 0 1 2-2h7l3 4h10a2 2 0 0 1 2 2v13H4Z" fill="currentColor" opacity=".16" stroke="none" /><path d="M4 12V7a2 2 0 0 1 2-2h7l3 4h10a2 2 0 0 1 2 2v3M5 26h20a2 2 0 0 0 2-2l2-10H8L5 26 3 14" /><path d="M11 19h10" opacity=".6" /></>,
  media: <><rect x="4" y="7" width="21" height="18" rx="3" fill="currentColor" opacity=".12" stroke="none" /><rect x="4" y="7" width="21" height="18" rx="3" /><path d="M10 3h16a3 3 0 0 1 3 3v13M5 22l6-7 5 5 4-4 5 5" /><circle cx="18" cy="12" r="2" fill="currentColor" stroke="none" /></>,
  screen: <><path d="M5 12V5h7M20 5h7v7M27 20v7h-7M12 27H5v-7" /><rect x="11" y="11" width="10" height="10" rx="2" fill="currentColor" opacity=".16" stroke="none" /></>,
  rooms: <><circle cx="16" cy="16" r="9" fill="currentColor" opacity=".16" stroke="none" /><circle cx="16" cy="16" r="9" /><ellipse cx="16" cy="16" rx="15" ry="4.5" transform="rotate(-28 16 16)" /><circle cx="26" cy="5" r="1.5" fill="currentColor" stroke="none" /></>,
  adviser: <><rect x="5" y="6" width="22" height="23" rx="3" fill="currentColor" opacity=".12" stroke="none" /><rect x="5" y="6" width="22" height="23" rx="3" /><rect x="12" y="3" width="8" height="5" rx="2" fill="var(--control-face, #fff4d6)" /><circle cx="16" cy="15" r="3" /><path d="M11 24v-1a5 5 0 0 1 10 0v1" /></>,
  leave: <><path d="M14 5H6v22h8" /><path d="M12 16h16m-6-6 6 6-6 6" /></>,
  back: <><path d="m12 7-9 9 9 9M4 16h16a8 8 0 0 1 8 8" /></>,
  record: <><circle cx="16" cy="16" r="11" /><circle cx="16" cy="16" r="6" fill="currentColor" stroke="none" /></>,
  cut: <><circle cx="8" cy="9" r="4" /><circle cx="8" cy="24" r="4" /><path d="m11 12 17 15M11 21 28 5" /></>,
  mix: <><path d="M7 4v24M16 4v24M25 4v24" /><path d="M4 11h6M13 21h6M22 13h6" strokeWidth="5" /><path d="M4 11h6M13 21h6M22 13h6" stroke="var(--control-face, #fff4d6)" strokeWidth="2" /></>,
  list: <><rect x="5" y="3" width="22" height="26" rx="3" fill="currentColor" opacity=".12" stroke="none" /><rect x="5" y="3" width="22" height="26" rx="3" /><path d="M14 10h7M14 16h7M14 22h7M10 10h.01M10 16h.01M10 22h.01" /></>,
  package: <><path d="m4 10 12-6 12 6v15l-12 5-12-5Z" fill="currentColor" opacity=".12" stroke="none" /><path d="m4 10 12-6 12 6v15l-12 5-12-5Z" /><path d="m4 10 12 5 12-5M16 15v15M10 7l12 5v5" /></>,
  close: <path d="m9 9 14 14M23 9 9 23" />,
};

export function ControlIcon({ kind }: { kind: ControlKind }) {
  return <svg className="control-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{drawings[kind]}</svg>;
}
