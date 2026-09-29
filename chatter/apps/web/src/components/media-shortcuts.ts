/** Let native controls and help own their keys instead of editing the timeline behind them. */
export function ignoreMediaShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.altKey) return true;
  const target = event.target;
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, button, a, summary, [role="button"], [role="tab"], [contenteditable]:not([contenteditable="false"]), [data-reily-local-help]',
  ));
}
