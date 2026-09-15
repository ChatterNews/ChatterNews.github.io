import { useEffect, useLayoutEffect } from 'react';
import { pointerTrailEnabled } from '../room-atmosphere.js';
import '../styles/RoomAtmosphere.css';

const TRAIL_PARTICLES = 12;
const PRECISION_SURFACES = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  'canvas',
  '.blast-stage',
  '.stinger-stage',
  '.daw-shell',
  '.dawbody',
  '.piano-roll',
].join(',');

export function RoomAtmosphere({ room }: { room: string }) {
  useLayoutEffect(() => {
    document.body.dataset.room = room;
    return () => {
      if (document.body.dataset.room === room) delete document.body.dataset.room;
    };
  }, [room]);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    const hover = window.matchMedia('(hover: hover)');
    const trail = document.querySelector<HTMLElement>('.newsroom-cursor-trail');
    if (!trail || !pointerTrailEnabled({
      finePointer: finePointer.matches,
      hover: hover.matches,
      reducedMotion: reducedMotion.matches,
    })) return;

    const particles = Array.from(trail.querySelectorAll<HTMLElement>('i'));
    let particleIndex = 0;
    let lastPaint = 0;

    const move = (event: PointerEvent) => {
      // The Orbit shell hides this effect; do not animate invisible particles.
      if (document.body.dataset.interface === 'spiral-stage' || document.body.dataset.lowSpec === 'true') return;
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const target = event.target;
      if (target instanceof Element && target.closest(PRECISION_SURFACES)) return;
      if (event.timeStamp - lastPaint < 38) return;
      lastPaint = event.timeStamp;

      const particle = particles[particleIndex % particles.length];
      particleIndex += 1;
      if (!particle) return;
      const turn = ((particleIndex * 47) % 70) - 35;
      const drift = ((particleIndex * 29) % 18) - 9;
      particle.style.left = `${event.clientX}px`;
      particle.style.top = `${event.clientY}px`;
      particle.getAnimations().forEach((animation) => animation.cancel());
      particle.animate([
        { opacity: .78, transform: `translate3d(-50%, -50%, 0) rotate(${turn}deg) scale(.72)` },
        { opacity: .42, offset: .42, transform: `translate3d(calc(-50% + ${drift}px), calc(-50% + 8px), 0) rotate(${turn + 24}deg) scale(1)` },
        { opacity: 0, transform: `translate3d(calc(-50% + ${drift * 1.7}px), calc(-50% + 22px), 0) rotate(${turn + 58}deg) scale(.28)` },
      ], { duration: 560, easing: 'cubic-bezier(.16,.72,.28,1)', fill: 'forwards' });
    };

    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);

  return (
    <>
      <div className="room-change-wash" data-atmosphere={room} key={room} aria-hidden="true" />
      <div className="newsroom-cursor-trail" aria-hidden="true">
        {Array.from({ length: TRAIL_PARTICLES }, (_, index) => <i key={index} />)}
      </div>
    </>
  );
}
