export function BlastHistoryControls({
  canUndo, canRedo, onUndo, onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return <div className="blast-history" role="group" aria-label="Undo and redo">
    <button type="button" disabled={!canUndo} onClick={onUndo} aria-label="Undo last change" title="Undo (⌘Z)">
      <span aria-hidden="true">↶</span><b>Undo</b>
    </button>
    <button type="button" disabled={!canRedo} onClick={onRedo} aria-label="Redo last change" title="Redo (⇧⌘Z)">
      <span aria-hidden="true">↷</span><b>Redo</b>
    </button>
  </div>;
}
