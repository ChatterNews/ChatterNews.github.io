/** Display preferences belong to this browser, not a student project. */
export const LOW_SPEC_KEY = 'chatter:display:low-spec';
export const AFTER_HOURS_KEY = 'chatter:display:after-hours';
export function readAfterHours(): boolean {
  try { return window.localStorage.getItem(AFTER_HOURS_KEY) === 'true'; } catch { return false; }
}
export function saveAfterHours(enabled: boolean): void {
  try { window.localStorage.setItem(AFTER_HOURS_KEY, String(enabled)); } catch { /* Still works for this visit. */ }
}
export function applyAfterHours(enabled: boolean): void {
  document.body.dataset.afterHours = String(enabled);
}
export function readLowSpec(): boolean {
  try { return window.localStorage.getItem(LOW_SPEC_KEY) === 'true'; } catch { return false; }
}
export function saveLowSpec(enabled: boolean): void {
  try { window.localStorage.setItem(LOW_SPEC_KEY, String(enabled)); } catch { /* Still works for this visit. */ }
}

type ScreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type ScreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
export function isFullscreen(doc: ScreenDocument | undefined = globalThis.document): boolean {
  if (!doc) return false;
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}
export function fullscreenAvailable(doc: ScreenDocument | undefined = globalThis.document): boolean {
  if (!doc) return false;
  const element = doc.documentElement as ScreenElement;
  return !!((typeof element.requestFullscreen === 'function' && doc.fullscreenEnabled !== false)
    || (element.webkitRequestFullscreen && doc.webkitFullscreenEnabled !== false));
}
export async function toggleFullscreen(doc: ScreenDocument = document): Promise<void> {
  const element = doc.documentElement as ScreenElement;
  if (isFullscreen(doc)) {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    else throw new Error('Fullscreen is unavailable.');
  } else {
    if (typeof element.requestFullscreen === 'function' && doc.fullscreenEnabled !== false) await element.requestFullscreen({ navigationUI: 'hide' });
    else if (element.webkitRequestFullscreen && doc.webkitFullscreenEnabled !== false) await element.webkitRequestFullscreen();
    else throw new Error('Fullscreen is unavailable.');
  }
}
