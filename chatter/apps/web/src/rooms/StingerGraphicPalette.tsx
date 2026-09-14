import type { CSSProperties } from 'react';
import type { MotionSceneKind, MotionTheme } from '@chatter/shared';
import {
  STINGER_GRAPHIC_CATEGORIES,
  filterStingerGraphics,
  type StingerGraphicCategory,
  type StingerGraphicTemplate,
} from './stinger-graphics.js';

export function StingerGraphicPalette({
  sceneKind,
  category,
  query,
  recentIds,
  showAll,
  hasImages,
  theme,
  onCategory,
  onQuery,
  onToggleAll,
  onAdd,
}: {
  sceneKind: MotionSceneKind;
  category: StingerGraphicCategory;
  query: string;
  recentIds: string[];
  showAll: boolean;
  hasImages: boolean;
  theme: MotionTheme;
  onCategory: (category: StingerGraphicCategory) => void;
  onQuery: (query: string) => void;
  onToggleAll: () => void;
  onAdd: (template: StingerGraphicTemplate) => void;
}) {
  const visible = filterStingerGraphics({
    query,
    category,
    sceneKind,
    recentIds,
    includeIncompatible: showAll,
  });

  const themeStyle = {
    '--graphic-primary': theme.primary,
    '--graphic-secondary': theme.secondary,
    '--graphic-accent': theme.accent,
    '--graphic-paper': theme.paper,
    '--graphic-ink': theme.ink,
  } as CSSProperties;

  return <aside className="stinger-graphic-palette" aria-label="Add graphic" style={themeStyle}>
    <header>
      <span>ADD GRAPHIC</span>
      <h2>Put something on screen</h2>
      <p>Choose a complete piece. Every layer stays editable.</p>
    </header>
    <label className="graphic-search">
      <span>⌕</span>
      <input aria-label="Search graphics" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search graphics" />
    </label>
    <nav aria-label="Graphic categories">
      {recentIds.length > 0 && <button aria-pressed={category === 'RECENT'} onClick={() => onCategory('RECENT')}><b>↺</b><span>Recent</span></button>}
      {STINGER_GRAPHIC_CATEGORIES.map((item) => <button key={item.id} aria-pressed={category === item.id} onClick={() => onCategory(item.id)}><b>{item.mark}</b><span>{item.label}</span></button>)}
    </nav>
    <div className="graphic-compatibility">
      <span>{showAll ? 'Showing every piece' : `Fits ${sceneKind.replace('_', ' ').toLowerCase()}`}</span>
      <button onClick={onToggleAll}>{showAll ? 'Show matches' : 'Show all'}</button>
    </div>
    <div className="graphic-results">
      {visible.length ? visible.map((item) => <button key={item.id} className="graphic-card" onClick={() => onAdd(item)}>
        <span className={`graphic-preview preview-${item.preview}`} aria-hidden="true"><i /><b>Aa</b><em /></span>
        <span className="graphic-card-copy"><b>{item.name}</b><small>{item.job}</small>{item.needsImage && !hasImages && <em>Add the frame now; choose a photo later.</em>}</span>
        <span className="graphic-add">＋</span>
      </button>) : <div className="graphic-empty"><b>No matching pieces.</b><span>Try another word or show every piece.</span></div>}
    </div>
  </aside>;
}
