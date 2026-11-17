// Nova dark: a quiet starfield in the empty left and right margins, and now and then a shooting star.
// The stars sit only beside the content, never behind a glass card: a card re-blurs whatever is behind it whenever that changes, and twinkling stars
// behind twenty cards would make every frame expensive. Each margin holds three small canvases drawn once (crisp, at the screen's density) and faded
// in and out by CSS at different speeds, which costs the page nothing. Shooting stars are one small CSS-animated streak at a time.
import { weak } from './ambient.js';

const html = document.documentElement;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const seeded = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TINTS = ['255,255,255', '255,255,255', '255,255,255', '200,232,255', '226,214,255', '190,243,255'];
const GROUPS = [[4.6, 0], [6.7, -2.4], [9.1, -5.1]]; // seconds per twinkle, and a head start so they never beat together

class Stars {
  constructor() { this.box = null; this.timer = 0; this.on = false; }
  start() {
    if (this.started || weak()) return; this.started = true;
    const redo = () => { clearTimeout(this.rs); this.rs = setTimeout(() => this.sync(true), 200); };
    addEventListener('resize', redo);
    new MutationObserver(() => this.sync()).observe(html, { attributes: true, attributeFilter: ['data-look', 'data-theme', 'data-bg'] });
    const app = document.getElementById('app'); if (app) new MutationObserver(redo).observe(app, { childList: true }); // connect screen to dashboard changes the content width
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(this.timer); clearTimeout(this.crossTimer); } else this.schedule(); });
    this.sync(true);
  }
  wanted() { return html.dataset.look === 'nova' && html.dataset.theme === 'dark' && html.dataset.bg !== 'off' && innerWidth >= 1000; }
  sync(redraw) {
    if (!this.wanted()) return this.clear();
    const calm = reduced() || html.dataset.bg === 'still';
    if (!this.on || redraw) this.draw();
    if (this.box) this.box.classList.toggle('calm', calm);
    this.schedule();
  }
  clear() { clearTimeout(this.timer); clearTimeout(this.crossTimer); if (this.box) { this.box.remove(); this.box = null; } this.on = false; }
  // where the content is, so the stars can keep to the empty sides
  content() {
    const m = document.querySelector('#app main') || document.querySelector('#app .connect .card') || document.querySelector('#app > *');
    const b = m && m.getBoundingClientRect(); return b && b.width > 200 ? { l: b.left, r: b.right } : { l: (innerWidth - 1200) / 2, r: (innerWidth + 1200) / 2 };
  }
  draw() {
    const host = document.querySelector('.aurora'); if (!host) return;
    if (this.box) this.box.remove();
    const box = document.createElement('div'); box.className = 'stars'; box.setAttribute('aria-hidden', 'true'); this.box = box; this.on = true;
    const vw = innerWidth, vh = innerHeight, dpr = Math.min(2, devicePixelRatio || 1), c = this.content();
    const rail = document.querySelector('.rail'), rr = rail ? rail.getBoundingClientRect() : null;
    this.sides = [{ k: 'l', x: 0, w: c.l - 16 }, { k: 'r', x: c.r + 16, w: vw - c.r - 16 }].filter((s) => s.w >= 70);
    for (const side of this.sides) {
      const rnd = seeded(side.k === 'l' ? 7 : 19), n = Math.min(110, Math.round((side.w * vh) / 3600));
      const cvs = GROUPS.map(([d, o], g) => { const el = document.createElement('canvas'); el.width = Math.round(side.w * dpr); el.height = Math.round(vh * dpr); el.style.cssText = `left:${side.x}px;width:${side.w}px;height:${vh}px;--d:${d}s;--o:${o}s`; el.getContext('2d').scale(dpr, dpr); box.append(el); return el.getContext('2d'); });
      for (let i = 0; i < n; i++) {
        const x = rnd() * side.w, y = rnd() * vh, ax = side.x + x;
        if (rr && ax < rr.right + 120 && y > rr.top - 30 && y < rr.bottom + 30) continue; // leave the section rail and its open label clear
        const kind = rnd(), r = kind < 0.62 ? 0.55 + rnd() * 0.35 : kind < 0.92 ? 1 + rnd() * 0.4 : 1.7 + rnd() * 0.5, a = 0.45 + rnd() * 0.5, tint = TINTS[Math.floor(rnd() * TINTS.length)], ctx = cvs[i % 3];
        if (r > 0.95) { const gr = ctx.createRadialGradient(x, y, 0, x, y, r * (kind < 0.92 ? 4 : 7)); gr.addColorStop(0, `rgba(${tint},${a * (kind < 0.92 ? 0.3 : 0.4)})`); gr.addColorStop(1, `rgba(${tint},0)`); ctx.fillStyle = gr; ctx.fillRect(x - r * 8, y - r * 8, r * 16, r * 16); }
        ctx.fillStyle = `rgba(${tint},${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        if (kind >= 0.92) { // the few bright ones get a fine four-point glint
          ctx.lineWidth = 0.8; for (const [dx, dy] of [[1, 0], [0, 1]]) { const g2 = ctx.createLinearGradient(x - dx * 9, y - dy * 9, x + dx * 9, y + dy * 9); g2.addColorStop(0, `rgba(${tint},0)`); g2.addColorStop(0.5, `rgba(${tint},${a * 0.7})`); g2.addColorStop(1, `rgba(${tint},0)`); ctx.strokeStyle = g2; ctx.beginPath(); ctx.moveTo(x - dx * 9, y - dy * 9); ctx.lineTo(x + dx * 9, y + dy * 9); ctx.stroke(); }
        }
      }
    }
    host.insertBefore(box, host.querySelector('#flow') ? host.querySelector('#flow').nextSibling : host.firstChild);
  }
  // Three kinds of streak. Margin streaks are steep and stay in a margin. Dives start in a margin and slant inward to finish behind the cards, where the glass softens them.
  // Crossings run from one margin all the way to the other, one or two at a time, now and then.
  schedule() {
    clearTimeout(this.timer); clearTimeout(this.crossTimer);
    if (!this.on || document.hidden || reduced() || html.dataset.bg !== 'flow' || !this.sides || !this.sides.length) return;
    this.timer = setTimeout(() => { this.shoot(Math.random() < 0.38 ? 'dive' : 'side'); this.schedule(); }, (this.first ? 5000 : 3000) + Math.random() * (this.first ? 6000 : 2500));
    if (this.sides.length === 2) this.crossTimer = setTimeout(() => { this.shoot('cross'); if (Math.random() < 0.45) setTimeout(() => this.shoot('cross'), 700 + Math.random() * 500); }, (this.first ? 28000 : 14000) + Math.random() * (this.first ? 26000 : 8000));
    this.first = true;
  }
  shoot(kind = 'side') {
    if (!this.box || !this.wanted() || !this.sides.length) return;
    const vw = innerWidth, vh = innerHeight, rad = Math.PI / 180, rand = Math.random;
    let x, y, ang, travel, len, dur, ease = 'cubic-bezier(.25, .1, .45, 1)';
    if (kind === 'cross' && this.sides.length === 2) {
      const [L, R] = this.sides, ltr = rand() < 0.5, x0 = ltr ? L.x + L.w * (0.25 + rand() * 0.5) : R.x + R.w * (0.25 + rand() * 0.5), x1 = ltr ? R.x + R.w * (0.3 + rand() * 0.4) : L.x + L.w * (0.3 + rand() * 0.4);
      const run = Math.abs(x1 - x0); y = vh * (0.06 + rand() * 0.28); const drop = Math.min(vh * 0.8 - y, run * (0.1 + rand() * 0.12)), t = Math.atan2(drop, run);
      x = x0; ang = ltr ? t : Math.PI - t; travel = Math.hypot(run, drop); len = 200 + rand() * 50; dur = 2.1 + rand() * 0.5; ease = 'cubic-bezier(.3, .15, .6, 1)';
    } else {
      const side = this.sides[Math.floor(rand() * this.sides.length)], dive = kind === 'dive';
      len = 150 + rand() * 60; travel = dive ? 430 + rand() * 220 : 190 + rand() * 90; dur = dive ? 1.4 + rand() * 0.3 : 0.95;
      const deg = dive ? 24 + rand() * 18 : 58 + rand() * 16; ang = (side.k === 'l' ? deg : 180 - deg) * rad;
      if (!dive) travel = Math.min(travel, (side.w - 28) / Math.abs(Math.cos(ang))); // shorten it to fit the margin; a narrow margin used to skip the streak
      if (travel < 110) return;
      const dx = Math.cos(ang) * travel, room = dive ? side.w - 24 : side.w - Math.abs(dx) - 16; if (room < 4) return;
      x = side.k === 'l' ? side.x + 8 + rand() * room : (dive ? side.x + side.w - 8 - rand() * room : side.x + 8 + Math.abs(dx) + rand() * room); y = vh * (0.05 + rand() * (dive ? 0.5 : 0.45));
    }
    const el = document.createElement('span'); el.className = 'shoot'; // not an <i>: nova.css styles every <i> inside .aurora as a blob
    el.style.cssText = `left:${x}px;top:${y}px;width:${len}px;--a:${ang}rad;--dx:${Math.cos(ang) * travel}px;--dy:${Math.sin(ang) * travel}px;animation-duration:${dur}s;animation-timing-function:${ease}`;
    el.addEventListener('animationend', () => el.remove()); this.box.append(el);
  }
}
export const stars = new Stars();
