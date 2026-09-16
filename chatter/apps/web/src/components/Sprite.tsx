/**
 * Shared tool symbols. Consistent stroke weights keep small toolbar keys clear.
 * Rendered once, referenced everywhere by <Icon name>.
 */
export function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs>
      <symbol id="ic-home" viewBox="0 0 24 24"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-mic" viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></symbol>
      <symbol id="ic-slate" viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m3.6 8 17-3.2.8 3.6-17 3.2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="m8 4.6 1.4 3.6M13.5 3.6 15 7.2" stroke="currentColor" strokeWidth="2.2"/></symbol>
      <symbol id="ic-light" viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="4" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="7.5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor" opacity=".35"/><circle cx="12" cy="16.5" r="1.9" fill="currentColor" opacity=".35"/></symbol>
      <symbol id="ic-crew" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M2.8 20c0-3.4 2.8-5.6 6.2-5.6s6.2 2.2 6.2 5.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 14.8c2.2.6 3.6 2.5 3.6 5.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></symbol>
      <symbol id="ic-star" viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-rerun" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M20 3.5V8h-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="m10.5 9.5 5 2.5-5 2.5z" fill="currentColor"/></symbol>
      <symbol id="ic-tv" viewBox="0 0 24 24"><rect x="2.5" y="6.5" width="19" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m8 6.5 4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="ic-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="ic-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/></symbol>
      <symbol id="ic-chev" viewBox="0 0 24 24"><path d="m5 9 7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="ic-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2"/><path d="m15.5 15.5 4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></symbol>
      <symbol id="ic-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2"/></symbol>
      <symbol id="ic-pen" viewBox="0 0 24 24"><path d="M4 20h4L19.5 8.5a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-cam" viewBox="0 0 24 24"><rect x="2.5" y="7" width="13" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m15.5 12 6-3.5v7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-lock" viewBox="0 0 24 24"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></symbol>
      <symbol id="ic-bolt" viewBox="0 0 24 24"><path d="M13.5 2 4.5 13.5h5L10 22l9.5-11.5h-5.2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-note" viewBox="0 0 24 24"><circle cx="7" cy="17.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="15" r="3.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M10.5 17.5V6l11-2.5V15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-play" viewBox="0 0 24 24"><path d="M7 4.5 20 12 7 19.5z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-stop" viewBox="0 0 24 24"><rect x="5.5" y="5.5" width="13" height="13" rx="2" fill="currentColor"/></symbol>
      <symbol id="ic-mail" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-pic" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="8.5" cy="10" r="1.9" fill="currentColor"/><path d="m4.5 17 5-5 4 3.5 3-2.5 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-gate" viewBox="0 0 24 24"><path d="M12 2.5 20 6v6c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M12 8v4.5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></symbol>
      <symbol id="ic-chip" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></symbol>
      <symbol id="ic-bold" viewBox="0 0 24 24"><path d="M7 4h6.5a4 4 0 0 1 0 8H7zM7 12h7.5a4 4 0 0 1 0 8H7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></symbol>
      <symbol id="ic-quote" viewBox="0 0 24 24"><path d="M9 6C6 7.5 4.5 10 4.5 13H8v5H3v-5c0-4 2-7.5 6-9zM20 6c-3 1.5-4.5 4-4.5 7H19v5h-5v-5c0-4 2-7.5 6-9z" fill="currentColor"/></symbol>
      <symbol id="ic-list" viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="4.5" cy="6.5" r="1.8" fill="currentColor"/><circle cx="4.5" cy="12" r="1.8" fill="currentColor"/><circle cx="4.5" cy="17.5" r="1.8" fill="currentColor"/></symbol>
      <symbol id="ic-head" viewBox="0 0 24 24"><path d="M5 5v14M15 5v14M5 12h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><path d="M18.5 19v-7l2.5 1.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      <symbol id="ic-q" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M9.3 9.2a2.8 2.8 0 1 1 3.5 3.1v1.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="12.6" cy="17.4" r="1.4" fill="currentColor"/></symbol>
    </defs></svg>
  );
}

/** One icon from the sprite. `name` is an id like "ic-mic". */
export function Icon({ name, className = 'i' }: { name: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <use href={`#${name}`} />
    </svg>
  );
}
