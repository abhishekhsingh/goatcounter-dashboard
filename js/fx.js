// Pointer effects that only make sense for a fine pointer and when motion is allowed.
import { useEffect } from './ui.js';

export const canTilt = () => matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tilts every .kpi inside the ref'd element toward the pointer and moves a glare highlight with it.
export function useTilt(ref, enabled) {
  useEffect(() => {
    if (!enabled || !ref.current || !canTilt()) return;
    const root = ref.current;
    const move = (e) => {
      const el = e.target.closest && e.target.closest('.kpi');
      if (!el) return;
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 12}deg) rotateY(${(x - 0.5) * 16}deg) translateZ(6px)`;
      el.style.setProperty('--gx', x * 100 + '%'); el.style.setProperty('--gy', y * 100 + '%');
    };
    // pointerout also fires when moving between a card's own children, so only reset when the pointer truly leaves it
    const leave = (e) => { const el = e.target.closest && e.target.closest('.kpi'); if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) el.style.transform = ''; };
    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerout', leave);
    return () => { root.removeEventListener('pointermove', move); root.removeEventListener('pointerout', leave); };
  }, [enabled]);
}

export const hexToRgb = (h) => { const n = parseInt(String(h).trim().replace('#', '').slice(0, 6), 16) || 0; return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Tells the card under the mouse where the pointer is, for the glow that follows the cursor (see nova.css). One frame at a time, one card at a time.
export function installPointerFX() {
  if (!canTilt()) return;
  let card = null, x = 0, y = 0, raf = 0;
  const apply = () => { raf = 0; if (!card) return; const r = card.getBoundingClientRect(); card.style.setProperty('--sx', x - r.left + 'px'); card.style.setProperty('--sy', y - r.top + 'px'); };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    card = e.target.closest && e.target.closest('.card'); x = e.clientX; y = e.clientY;
    if (card && !raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
}
