import type { RoomPreviewKind } from './RoomPreview.js';

// All objects share a 128-unit drawing grid, a single light direction and
// rounded, optically balanced outlines. Detail is geometry, never tiny text.
const ink = '#211a35';
const paper = '#fff4d6';
const metal = '#d4e2e8';
const shade = '#8e9aaa';
const accent = 'var(--stage-color, #ffe35a)';

function Screw({ x, y }: { x: number; y: number }) {
  return <g strokeWidth="1.4"><circle cx={x} cy={y} r="2" fill={metal} /><path d={`M${x - 1} ${y + 1}l2-2`} /></g>;
}
function Reel({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle r="20" fill={metal} /><circle r="15.5" fill={paper} strokeWidth="1.5" />
    {[0, 120, 240].map(angle => <path key={angle} transform={`rotate(${angle})`} d="M-3-7-5-13Q0-17 5-13L3-7Z" fill={shade} strokeWidth="1.5" />)}
    <circle r="5" fill={accent} strokeWidth="2" /><circle r="1.5" fill={ink} stroke="none" />
  </g>;
}
function Notebook() {
  return <g transform="rotate(-7 64 64)">
    <path d="M31 21h63v91H31q-9 0-9-9V30q0-9 9-9Z" fill={shade} />
    <path d="M29 16h65v91H29q-7 0-7-7V23q0-7 7-7Z" fill={accent} />
    <path d="M36 19h54v80H36Z" fill={paper} strokeWidth="1.5" />
    <path d="M46 23v70" stroke="#ed8691" strokeWidth="1.5" />
    {[34, 45, 56, 67, 78, 89].map(y => <path key={y} d={`M51 ${y}h30`} stroke="#a8b9cb" strokeWidth="1.5" />)}
    {[29, 47, 65, 83].map(y => <path key={y} d={`M31 ${y}h-13q-5 0-5 4t5 4h4`} fill="none" stroke={metal} strokeWidth="4" />)}
    <path d="m79 31 8-7 8 8-8 7-22 49-9 7 1-13Z" fill="#ffd35b" />
    <path d="m79 31 8 8M57 82l8 6m-9 7 2-10 5 5Z" fill={ink} strokeWidth="1.5" />
    <path d="m87 24 4-4q3-2 5 1l3 3q2 3 0 5l-4 3" fill="#ef8498" />
  </g>;
}
function Typewriter() {
  return <>
    <rect x="38" y="13" width="54" height="43" rx="3" fill={paper} />
    <path d="M47 24h33M47 31h33M47 38h21" stroke={shade} strokeWidth="2" />
    <rect x="21" y="46" width="87" height="13" rx="5" fill={shade} />
    <path d="M28 46v-8h11M108 49h8v7h-8" fill="none" />
    <path d="m25 57-10 32v12q0 9 10 9h81q9 0 9-9V89L102 57Z" fill={shade} />
    <path d="M25 56h77l13 33q2 10-9 10H25q-12 0-10-10Z" fill={accent} />
    <path d="M35 61h57l3 10H32Z" fill={ink} />
    <path d="M46 66h34" stroke={metal} strokeWidth="2" />
    {[0, 1].map(row => <g key={row}>{Array.from({ length: 8 }, (_, i) => <rect key={i} x={28 + i * 9 + row * 2} y={77 + row * 9} width="6" height="5" rx="1.7" fill={paper} strokeWidth="1.2" />)}</g>)}
    <path d="M45 94h36" stroke={ink} strokeWidth="3" /><path d="M25 106h9m60 0h10" strokeWidth="4" />
    <path d="M24 58h77" stroke="white" strokeOpacity=".55" strokeWidth="2" />
  </>;
}
function Microphone() {
  return <>
    <path d="M45 109h38l10 7H35Z" fill={shade} /><rect x="59" y="83" width="10" height="26" rx="3" fill={metal} />
    <path d="M33 52v12a31 31 0 0 0 62 0V52" fill="none" stroke={ink} strokeWidth="10" />
    <path d="M33 52v12a31 31 0 0 0 62 0V52" fill="none" stroke={accent} strokeWidth="5" />
    <rect x="43" y="12" width="42" height="67" rx="20" fill={shade} />
    <rect x="43" y="12" width="37" height="64" rx="18" fill={metal} />
    {[25, 33, 41, 49, 57].map(y => <path key={y} d={`M50 ${y}h23`} stroke={ink} strokeWidth="3" />)}
    <path d="M62 19v44" stroke={metal} strokeWidth="3" />
    <rect x="58" y="66" width="13" height="7" rx="2" fill={accent} strokeWidth="1.5" />
    <Screw x={34} y={56} /><Screw x={94} y={56} />
    <path d="M66 113h14" stroke={paper} strokeWidth="2" />
  </>;
}
function TapeDeck() {
  return <>
    <rect x="13" y="31" width="103" height="76" rx="10" fill={shade} />
    <rect x="13" y="26" width="103" height="75" rx="10" fill={accent} />
    <path d="M23 32h80" stroke="white" strokeOpacity=".6" strokeWidth="2" />
    <rect x="23" y="63" width="83" height="29" rx="5" fill={ink} />
    <path d="m41 57 12 13h23l11-13" fill="none" stroke="#665f6b" strokeWidth="4" />
    <Reel x={39} y={48} /><Reel x={90} y={48} />
    <rect x="31" y="77" width="20" height="9" rx="2" fill={paper} strokeWidth="1.5" />
    <path d="m36 83 4-4 5 4" stroke="#e6806c" strokeWidth="1.5" fill="none" />
    <rect x="60" y="77" width="11" height="10" rx="2" fill={metal} strokeWidth="1.5" />
    <path d="m63 79 5 3-5 3Z" fill={ink} stroke="none" /><circle cx="86" cy="82" r="5" fill="#f07180" />
    <path d="M24 108v4h13v-4m57 0v4h13v-4" fill={ink} stroke="none" />
    <Screw x={21} y={93} /><Screw x={108} y={93} />
  </>;
}
function PrintCarousel() {
  return <>
    <g transform="rotate(-13 60 67)"><rect x="21" y="25" width="64" height="79" rx="4" fill={shade} /><rect x="21" y="21" width="64" height="79" rx="4" fill="#bfadeb" /></g>
    <g transform="rotate(10 69 64)"><rect x="43" y="23" width="63" height="81" rx="4" fill={shade} /><rect x="43" y="19" width="63" height="81" rx="4" fill={accent} /></g>
    <rect x="29" y="20" width="64" height="87" rx="4" fill={paper} />
    <rect x="37" y="29" width="48" height="11" rx="2" fill={ink} stroke="none" />
    <path d="M40 34h32" stroke={paper} strokeWidth="2" />
    <rect x="37" y="48" width="29" height="29" rx="2" fill={accent} strokeWidth="1.5" />
    <circle cx="57" cy="55" r="3" fill={paper} stroke="none" /><path d="m39 73 8-11 7 6 6-6 5 11" fill={shade} stroke="none" />
    <path d="M73 49h11m-11 7h11m-11 7h11m-11 7h9M38 86h45M38 93h34" stroke={shade} strokeWidth="2" />
    <path d="M32 103h58" stroke="#d4cbb6" strokeWidth="1.5" />
  </>;
}
function BroadcastLens() {
  return <>
    <path d="M36 18h54l13 18v59l-12 16H36L23 95V36Z" fill={shade} />
    <path d="M36 14h54l13 18v59l-12 16H36L23 91V32Z" fill={accent} />
    <rect x="34" y="24" width="57" height="16" rx="3" fill={ink} />
    <path d="M42 32h6m6 0h6m6 0h16" stroke={paper} strokeWidth="2" />
    <circle cx="63" cy="70" r="27" fill={metal} /><circle cx="63" cy="70" r="21" fill={ink} />
    <circle cx="63" cy="70" r="15" fill="#447f9b" stroke="#759aa9" strokeWidth="2" />
    <path d="m63 55 12 8-3 14H56l-5-13Z" fill="#233753" stroke="#85b3c1" strokeWidth="1" />
    <path d="m54 64 7-5" stroke={paper} strokeWidth="3" /><circle cx="72" cy="78" r="2" fill={metal} stroke="none" />
    <Screw x={32} y={45} /><Screw x={94} y={94} />
    <path d="m101 11 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill={paper} strokeWidth="1.5" />
  </>;
}
function EditMonitor() {
  return <>
    <path d="m53 98-4 12h32l-5-12" fill={shade} /><rect x="39" y="109" width="51" height="6" rx="3" fill={metal} />
    <path d="M21 22h87v72q0 7-7 7H27q-7 0-7-7Z" fill={shade} />
    <rect x="14" y="17" width="94" height="79" rx="9" fill={accent} />
    <rect x="23" y="26" width="76" height="47" rx="6" fill={ink} />
    <path d="M29 33h29v31H29Zm35 0h29v31H64Z" fill="#3e6888" stroke="#7ab8ca" strokeWidth="1.5" />
    <path d="m39 42 11 6-11 6Z" fill={paper} stroke="none" />
    <path d="m67 59 9-13 8 8 5-6 3 11Z" fill="#77acb5" stroke="none" />
    <path d="M29 81h18m5 0h10m5 0h17" stroke={paper} strokeWidth="4" />
    <circle cx="95" cy="83" r="3" fill="#b9ed71" strokeWidth="1.5" />
    <path d="M21 21h75" stroke="white" strokeOpacity=".55" strokeWidth="2" />
  </>;
}
function SignalStack() {
  return <>
    <path d="M54 101v12h20v-12" fill={shade} />
    <rect x="40" y="12" width="49" height="94" rx="14" fill={shade} />
    <rect x="34" y="9" width="49" height="94" rx="14" fill="#494359" />
    {[29, 56, 83].map((y, i) => <g key={y}>
      <path d={`M42 ${y - 6}q17-17 33 0`} fill="none" stroke={ink} strokeWidth="5" />
      <circle cx="58.5" cy={y} r="10.5" fill={['#925b64', '#b39c5b', '#b6ef73'][i]} />
      {i < 2 ? <path d={`M53 ${y - 4}h10`} stroke="white" strokeOpacity=".22" strokeWidth="2" /> : <path d="m53 83 4 4 7-8" fill="none" strokeWidth="2.5" />}
    </g>)}
    <path d="M44 17q4-5 9-4" stroke={metal} strokeOpacity=".6" fill="none" strokeWidth="2" />
    <path d="M89 69h13m-13 14h19m-19 14h12" stroke={accent} strokeWidth="3" />
  </>;
}
function MediaWheel() {
  return <>
    <path d="M24 101h79l-7 11H31Z" fill={shade} />
    <circle cx="64" cy="61" r="44" fill={shade} /><circle cx="64" cy="57" r="44" fill={metal} />
    <path d="M64 17a40 40 0 0 1 38 28L78 53A15 15 0 0 0 64 42Z" fill={accent} />
    <path d="M103 48a40 40 0 0 1-17 43L72 69a15 15 0 0 0 7-13Z" fill="#e98f9e" />
    <path d="M82 93a40 40 0 0 1-42-3l14-21a15 15 0 0 0 15 2Z" fill="#f8d870" />
    <path d="M36 87a40 40 0 0 1-11-41l24 8a15 15 0 0 0 4 12Z" fill="#84c9b0" />
    <path d="M27 42a40 40 0 0 1 33-25v25a15 15 0 0 0-11 9Z" fill={paper} />
    <circle cx="64" cy="57" r="12" fill={paper} /><circle cx="64" cy="57" r="4" fill={ink} />
    <path d="M41 24q-10 5-14 16" stroke="white" strokeWidth="3" fill="none" />
  </>;
}
function ArchiveCarousel() {
  return <>
    <g transform="rotate(-11 37 65)"><rect x="13" y="24" width="30" height="75" rx="4" fill={shade} /><rect x="13" y="20" width="30" height="75" rx="4" fill={accent} /><rect x="20" y="30" width="16" height="40" rx="2" fill={paper} strokeWidth="1.5" /><path d="M24 37h8m-8 6h8m-8 6h8" stroke={shade} strokeWidth="1.5" /></g>
    <g transform="rotate(11 92 65)"><rect x="82" y="25" width="30" height="75" rx="4" fill={shade} /><rect x="82" y="21" width="30" height="75" rx="4" fill="#82cbb2" /><rect x="89" y="31" width="16" height="39" rx="2" fill={paper} strokeWidth="1.5" /><circle cx="97" cy="47" r="5" fill={accent} strokeWidth="1.5" /></g>
    <rect x="44" y="13" width="37" height="94" rx="5" fill={shade} /><rect x="42" y="9" width="37" height="94" rx="5" fill="#f7d16b" />
    <rect x="49" y="20" width="23" height="55" rx="3" fill={paper} strokeWidth="1.5" />
    <path d="m55 36 12 8-12 8Z" fill={ink} stroke="none" /><path d="M53 60h15m-15 6h11" stroke={shade} strokeWidth="1.5" />
    <path d="M51 88h19" stroke={ink} strokeWidth="3" /><Screw x={60} y={96} />
  </>;
}
function AssignmentDial() {
  return <>
    <rect x="20" y="21" width="91" height="87" rx="13" fill={shade} /><rect x="16" y="16" width="91" height="87" rx="13" fill={paper} />
    <circle cx="61" cy="60" r="33" fill={accent} />
    <path d="M61 60V27a33 33 0 0 1 33 33Z" fill="#87c9c0" /><path d="M61 60h33a33 33 0 0 1-33 33Z" fill="#f4d16b" /><path d="M61 60v33a33 33 0 0 1-33-33Z" fill="#ea93a9" />
    {[0, 90, 180, 270].map(angle => <g key={angle} transform={`rotate(${angle} 61 60)`}><circle cx="61" cy="37" r="3.5" fill={paper} strokeWidth="1.5" /><path d="M56 45q5-5 10 0" fill="none" strokeWidth="1.8" /></g>)}
    <path d="m61 41 7 20-7 10-7-10Z" fill={ink} /><circle cx="61" cy="60" r="6" fill={metal} /><circle cx="61" cy="60" r="2" fill={ink} stroke="none" />
    <Screw x={24} y={24} /><Screw x={99} y={95} />
  </>;
}
function NewsroomTable() {
  return <>
    {[[-26, -8], [26, -8], [-26, 35], [26, 35]].map(([x, y], i) => <g key={i} transform={`translate(${64 + x!} ${48 + y!})`}><rect x="-11" y="-13" width="22" height="24" rx="8" fill={shade} /><rect x="-11" y="-17" width="22" height="23" rx="8" fill={paper} /></g>)}
    <ellipse cx="64" cy="68" rx="48" ry="30" fill={shade} /><ellipse cx="64" cy="61" rx="48" ry="30" fill={accent} />
    <path d="M24 51q12-14 30-14" stroke={paper} strokeWidth="3" fill="none" opacity=".7" />
    <g transform="rotate(-12 53 58)"><rect x="36" y="46" width="28" height="24" rx="2" fill={paper} strokeWidth="1.5" /><path d="M42 52h15m-15 6h15m-15 6h8" stroke={shade} strokeWidth="1.5" /></g>
    <ellipse cx="82" cy="58" rx="8" ry="4" fill={shade} stroke="none" /><path d="M77 49v8q5 5 10 0v-8" fill={paper} strokeWidth="1.5" /><ellipse cx="82" cy="49" rx="5" ry="2.5" fill="#806051" strokeWidth="1.5" />
    <path d="M87 51h3q4 5-3 5" fill="none" strokeWidth="1.5" />
  </>;
}

const OBJECTS = {
  table: NewsroomTable, notebook: Notebook, 'assignment-dial': AssignmentDial,
  typewriter: Typewriter, microphone: Microphone, 'podcast-reels': TapeDeck,
  'print-carousel': PrintCarousel, 'broadcast-lens': BroadcastLens,
  'edit-monitor': EditMonitor, 'signal-stack': SignalStack,
  'media-wheel': MediaWheel, 'archive-carousel': ArchiveCarousel,
} satisfies Record<RoomPreviewKind, () => React.JSX.Element>;

export function RoomIcon({ kind }: { kind: RoomPreviewKind }) {
  const ObjectDrawing = OBJECTS[kind];
  return <svg className="room-object-art" viewBox="0 0 128 128" aria-hidden="true" focusable="false" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <ObjectDrawing />
  </svg>;
}
