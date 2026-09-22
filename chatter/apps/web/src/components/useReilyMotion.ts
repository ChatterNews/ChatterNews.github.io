import { useEffect, useState, type RefObject } from 'react';

export type ReilyMotion = 'rest' | 'blink' | 'wink' | 'glance' | 'perk';
const duration = { blink: 280, wink: 650, glance: 1400, perk: 900 };

/** Brief, interruptible gestures with plenty of stillness between them. */
export function useReilyMotion(character: RefObject<HTMLButtonElement | null>, parked: boolean, lowSpec: boolean) {
  const [motion, setMotion] = useState<ReilyMotion>('rest');
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let idle: ReturnType<typeof setTimeout> | undefined;
    let finish: ReturnType<typeof setTimeout> | undefined;
    let near = false;
    let lastPerk = -Infinity;
    let lastGesture: ReilyMotion = 'rest';
    const enabled = () => !parked && !lowSpec && !preference?.matches && !document.hidden;
    const visible = () => {
      const button = character.current;
      if (!button || !button.getClientRects().length) return false;
      const dock = button.closest('.reilly-guide');
      return !dock || (getComputedStyle(dock).opacity !== '0' && getComputedStyle(dock).display !== 'none');
    };
    const clear = () => { clearTimeout(idle); clearTimeout(finish); };
    function schedule(first = false) {
      clearTimeout(idle);
      if (enabled()) idle = setTimeout(() => {
        const active = document.activeElement;
        const writing = active?.matches('input,textarea,[contenteditable="true"]');
        if (!visible() || writing || near || character.current?.contains(active)) { schedule(); return; }
        const chance = Math.random();
        let next: Exclude<ReilyMotion, 'rest' | 'perk'> = chance < .6 ? 'blink' : chance < .8 ? 'wink' : 'glance';
        if (next === lastGesture && next !== 'blink') next = 'blink';
        play(next);
      }, first ? 12000 + Math.random() * 10000 : 18000 + Math.random() * 24000);
    }
    function play(next: Exclude<ReilyMotion, 'rest'>) {
      if (!enabled() || !visible()) return;
      clear(); lastGesture = next; setMotion(next);
      finish = setTimeout(() => { setMotion('rest'); schedule(); }, duration[next]);
    }
    function perk() {
      if (performance.now() - lastPerk < 12000 || !enabled() || !visible()) return;
      lastPerk = performance.now(); play('perk');
    }
    function pointer(event: PointerEvent) {
      if (event.pointerType === 'touch' || !enabled()) return;
      const rect = character.current?.getBoundingClientRect(); if (!rect) return;
      const distance = Math.hypot(Math.max(rect.left - event.clientX, 0, event.clientX - rect.right), Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom));
      if (!near && distance < 64) { near = true; perk(); }
      else if (near && distance > 110) near = false;
    }
    function focus(event: FocusEvent) { if (character.current?.contains(event.target as Node)) perk(); }
    function reset() { clear(); near = false; setMotion('rest'); schedule(true); }
    reset();
    if (!parked && !lowSpec) {
      window.addEventListener('pointermove', pointer, { passive: true });
      window.addEventListener('focusin', focus);
      document.addEventListener('visibilitychange', reset);
      preference?.addEventListener('change', reset);
    }
    return () => {
      clear(); window.removeEventListener('pointermove', pointer); window.removeEventListener('focusin', focus);
      document.removeEventListener('visibilitychange', reset); preference?.removeEventListener('change', reset);
    };
  }, [character, parked, lowSpec]);
  return motion;
}
