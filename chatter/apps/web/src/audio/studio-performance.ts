const PLAYHEAD_REACT_INTERVAL_MS = 1000 / 30;

/** Bar indices for a readable ruler, with a hard node budget for long songs. */
export function studioTimelineLabels(totalBars: number, pixelsPerBeat: number, maxLabels = 96): number[] {
  const bars = Math.max(0, Math.floor(totalBars));
  if (!bars) return [];
  const zoomStep = pixelsPerBeat < 14 ? 4 : pixelsPerBeat < 24 ? 2 : 1;
  const budgetStep = bars > 1 && maxLabels > 1 ? Math.ceil((bars - 1) / (maxLabels - 1)) : 1;
  const step = Math.max(zoomStep, budgetStep);
  const labels: number[] = [];
  for (let bar = 0; bar < bars; bar += step) labels.push(bar);
  if (labels.at(-1) !== bars - 1) labels.push(bars - 1);
  return labels;
}

export function shouldPublishPlayhead(previousMs: number, nowMs: number): boolean {
  return nowMs - previousMs >= PLAYHEAD_REACT_INTERVAL_MS;
}

export function playheadLeftPx(beat: number, pixelsPerBeat: number, trackHeaderPx = 220): number {
  return trackHeaderPx + beat * pixelsPerBeat;
}
