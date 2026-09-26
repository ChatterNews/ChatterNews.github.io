/** Original palette pictograms; labels stay in the surrounding button. */
export function CreativeToolIcon({ kind }: { kind: 'templates' | 'add' | 'pages' | 'layers' }) {
  return <svg className="creative-tool-icon" viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === 'templates' && <><rect x="5" y="5" width="25" height="26" rx="3" fill="#fff9df" /><path d="M5 13h25M16 13v18" /><path d="M9 9h8M20 18h6M20 23h6M9 18h3v8H9z" /><path d="m25 3 5 3-1 5" stroke="#a14349" /></>}
    {kind === 'add' && <><path d="m8 26 5-5 4 4-5 5-6 1z" fill="#d9b9d4" /><path d="m13 21 12-14 5 5-13 13z" fill="#fff9df" /><path d="m25 7 2-3 6 6-3 3M9 4v8M5 8h8M26 24v8M22 28h8" /></>}
    {kind === 'pages' && <><path d="M10 5h20v23H10z" fill="#bcd5cb" /><path d="M5 10h20v23H5z" fill="#fff9df" /><path d="M9 15h12M9 20h8M9 25h12" /></>}
    {kind === 'layers' && <><path d="m3 23 15 9 15-9-15-8z" fill="#bcd5cb" /><path d="m3 17 15 9 15-9-15-8z" fill="#d9b9d4" /><path d="m3 11 15 9 15-9-15-8z" fill="#fff9df" /></>}
  </svg>;
}
