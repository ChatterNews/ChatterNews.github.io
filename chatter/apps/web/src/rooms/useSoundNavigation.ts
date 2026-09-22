import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom';

/** Keep the mounted draft until navigation can safely finish, including browser Back. */
export function useSoundNavigation(options: { dirty: () => boolean; blocked: () => boolean; flush: () => Promise<void>; onError: (message: string) => void }) {
  const { navigator } = useContext(UNSAFE_NavigationContext); const location = useLocation(); const latest = useRef(options); latest.current = options;
  const permitted = useRef(false);
  const currentIndex = useRef<number>(window.history.state?.idx ?? 0);
  useEffect(() => { currentIndex.current = window.history.state?.idx ?? currentIndex.current; }, [location]);
  useEffect(() => {
    let active = true; let restoring = false; let replay: (() => void) | undefined;
    const protectedWork = () => latest.current.blocked() || latest.current.dirty();
    const execute = (action: () => void) => {
      if (permitted.current) { action(); return; }
      if (latest.current.blocked()) { latest.current.onError('Finish the sound job or save the recovered recording before leaving.'); return; }
      if (!latest.current.dirty()) { action(); return; }
      // A recording/job or another edit may begin while the save is pending.
      // Re-check current protection before replaying the old navigation request.
      void latest.current.flush().then(() => { if (active) execute(action); }).catch(error => latest.current.onError(error instanceof Error ? error.message : 'Save failed. Your changes are still here.'));
    };
    const push = navigator.push.bind(navigator), replace = navigator.replace.bind(navigator), go = navigator.go.bind(navigator);
    navigator.push = (...args) => execute(() => push(...args));
    navigator.replace = (...args) => execute(() => replace(...args));
    navigator.go = delta => execute(() => go(delta));
    const pop = (event: PopStateEvent) => {
      if (restoring) { restoring = false; const action = replay; replay = undefined; if (action) queueMicrotask(() => execute(action)); return; }
      if (!protectedWork()) return;
      const nextIndex = event.state?.idx;
      if (!Number.isInteger(nextIndex)) return;
      const delta = currentIndex.current - nextIndex; if (!delta) return;
      event.stopImmediatePropagation(); restoring = true;
      replay = latest.current.blocked() ? undefined : () => go(-delta);
      if (!replay) latest.current.onError('Finish the sound job or save the recovered recording before leaving.');
      go(delta);
    };
    window.addEventListener('popstate', pop, true);
    return () => { active = false; navigator.push = push; navigator.replace = replace; navigator.go = go; window.removeEventListener('popstate', pop, true); };
  }, [navigator]);
  return (action: () => void) => { permitted.current = true; try { action(); } finally { permitted.current = false; } };
}
