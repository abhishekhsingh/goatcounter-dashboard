import { html, useState, useEffect, useRef, useMemo, useInView, useContext } from '../ui.js';
import { Ctx, useApi, Skeleton, ErrorBox } from './common.js';
import { q } from '../api.js';
import { makeRange, hourLabel, fmtFull } from '../util.js';
import { hourWeekday } from '../model.js';
import { hexToRgb, cssVar } from '../fx.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (c, k = 1, a = 1) => `rgba(${Math.round(Math.min(255, c[0] * 255 * k))},${Math.round(Math.min(255, c[1] * 255 * k))},${Math.round(Math.min(255, c[2] * 255 * k))},${a})`;
const inPoly = (poly, x, y) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };

// A 3D skyline: one tower per weekday and hour. Hours run left to right, weekdays recede into the distance.
function Skyline({ m, n, themeKey, onNote }) {
  const cv = useRef(null);
  const state = useRef({ boxes: [], hover: null, born: 0, vis: true });
  useEffect(() => {
    const canvas = cv.current, ctx = canvas.getContext('2d'), S = state.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    S.born = performance.now(); let raf = 0, last = 0;
    const draw = (now) => {
      const W = canvas.clientWidth, H = Math.max(220, Math.round(W * (W < 600 ? 0.62 : 0.34))), dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const cols = 24, rows = 7, left = W < 600 ? 30 : 46, dX = W < 600 ? 5 : 9, dY = W < 600 ? 8 : 15, gapY = W < 600 ? 15 : 30, cw = (W - left - 16 - rows * 8) / cols, bw = cw * 0.66;
      const lo = hexToRgb(cssVar('--accent-2')), hi = hexToRgb(cssVar('--accent')), top = hexToRgb(cssVar('--hot'));
      const mx = Math.max(1, ...m.flat()), maxH = H * 0.42, t = reduced ? 9 : (now - S.born) / 1000;
      const text3 = cssVar('--text-3');
      S.boxes = [];
      for (let r = 0; r < rows; r++) {
        const ry = H - 30 - (rows - 1 - r) * gapY, rx = left + (rows - 1 - r) * 8;
        ctx.fillStyle = text3; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'right'; ctx.fillText(DAYS[r], left - 8, ry + 2); // fixed gutter, clear of every tower
        ctx.strokeStyle = rgba(hi, 1, 0.1); ctx.beginPath(); ctx.moveTo(rx, ry + 3); ctx.lineTo(rx + cols * cw, ry + 3); ctx.stroke();
        for (let c = 0; c < cols; c++) {
          const avg = m[r][c] / Math.max(1, n[r]), v = avg / mx, k = 1 - Math.pow(1 - Math.min(1, Math.max(0, (t - (c * 0.02 + (rows - r) * 0.04)) / 0.7)), 3), h = Math.max(2, v * maxH * k);
          const x = rx + c * cw + (cw - bw) / 2, y = ry, base = mix(lo, hi, Math.pow(v, 0.8)), isH = S.hover && S.hover[0] === r && S.hover[1] === c, lit = isH ? 1.4 : 1;
          ctx.fillStyle = rgba(base, 0.42 * lit); ctx.beginPath(); ctx.moveTo(x + bw, y); ctx.lineTo(x + bw + dX, y - dY); ctx.lineTo(x + bw + dX, y - dY - h); ctx.lineTo(x + bw, y - h); ctx.closePath(); ctx.fill();
          const g = ctx.createLinearGradient(x, y - h, x, y); g.addColorStop(0, rgba(base, 1.05 * lit)); g.addColorStop(1, rgba(base, 0.55 * lit)); ctx.fillStyle = g; ctx.fillRect(x, y - h, bw, h);
          ctx.fillStyle = rgba(mix(base, top, 0.4 * v), 1.2 * lit); ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + dX, y - h - dY); ctx.lineTo(x + bw + dX, y - h - dY); ctx.lineTo(x + bw, y - h); ctx.closePath(); ctx.fill();
          if (v > 0.82 && k > 0.95) { ctx.shadowColor = rgba(top, 1, 0.9); ctx.shadowBlur = 12; ctx.strokeStyle = rgba(top, 1.1, 0.8); ctx.stroke(); ctx.shadowBlur = 0; }
          S.boxes.push({ r, c, avg, poly: [[x, y - h], [x + dX, y - h - dY], [x + bw + dX, y - h - dY], [x + bw + dX, y - dY], [x + bw, y], [x, y]] });
        }
      }
      ctx.fillStyle = text3; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      for (let c = 0; c < cols; c += W < 600 ? 6 : 3) ctx.fillText(((c + 11) % 12) + 1 + (c < 12 ? 'a' : 'p'), left + c * cw + cw / 2, H - 6);
    };
    const loop = (now) => { raf = 0; if (!S.vis || document.hidden) return; draw(now); if (!reduced && now - S.born < 1600) raf = requestAnimationFrame(loop); else if (!reduced && S.hover) raf = requestAnimationFrame(loop); };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    S.kick = kick; draw(performance.now()); kick();
    const io = new IntersectionObserver((es) => { S.vis = es[0].isIntersecting; if (S.vis) { S.born = performance.now() - (reduced ? 0 : 0); kick(); } }); io.observe(canvas);
    let rraf = 0; const ro = new ResizeObserver(() => { cancelAnimationFrame(rraf); rraf = requestAnimationFrame(() => draw(performance.now())); }); ro.observe(canvas);
    return () => { if (raf) cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); };
  }, [m, n, themeKey]);
  const point = (e) => {
    const S = state.current, r = cv.current.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let hit = null; for (const b of [...S.boxes].reverse()) if (inPoly(b.poly, x, y)) { hit = b; break; }
    S.hover = hit ? [hit.r, hit.c] : null; onNote(hit ? `${DAYS[hit.r]} at ${hourLabel(hit.c)}: ${fmtFull(hit.avg)} visitors on average` : ''); S.kick && S.kick();
  };
  return html`<canvas ref=${cv} class="sky" role="img" aria-label="3D skyline of visitors by weekday and hour" onPointerMove=${point} onPointerLeave=${() => { state.current.hover = null; onNote(''); state.current.kick && state.current.kick(); }}></canvas>`;
}

// The same data as a flat grid, for the Classic look.
function HeatGrid({ m, n, onNote }) {
  const vals = m.map((row, r) => row.map((v) => v / Math.max(1, n[r])));
  const mx = Math.max(1, ...vals.flat());
  const level = (v) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / mx) * 4)));
  return html`<div class="heat" role="img" aria-label="Visitors by weekday and hour">
    <span></span>${Array.from({ length: 24 }, (_, c) => html`<span class="hh" key=${c}>${c % 3 === 0 ? ((c + 11) % 12) + 1 + (c < 12 ? 'a' : 'p') : ''}</span>`)}
    ${vals.map((row, r) => html`<${Fragmentish} key=${r}><span class="hl">${DAYS[r]}</span>${row.map((v, c) => html`<span key=${c} class="hc" style=${{ '--hc': `var(--heat-${level(v)})` }} onPointerEnter=${() => onNote(`${DAYS[r]} at ${hourLabel(c)}: ${fmtFull(v)} visitors on average`)} onPointerLeave=${() => onNote('')}></span>`)}<//>`)}
  </div>`;
}

// A 24-hour clock: one wedge per hour, noon at the bottom and midnight at the top. Longer wedges are busier hours.
function HourClock({ m, onNote }) {
  const [hot, setHot] = useState(null);
  const hourly = Array.from({ length: 24 }, (_, h) => m.reduce((a, row) => a + row[h], 0) / 7);
  const mx = Math.max(1, ...hourly), peak = hourly.indexOf(Math.max(...hourly));
  const cx = 130, cy = 130, R0 = 46, R1 = 108;
  const pt = (r, deg) => [cx + r * Math.cos(((deg - 90) * Math.PI) / 180), cy + r * Math.sin(((deg - 90) * Math.PI) / 180)];
  const wedge = (h, r) => { const a0 = h * 15 + 1, a1 = h * 15 + 14, [x0, y0] = pt(R0, a0), [x1, y1] = pt(r, a0), [x2, y2] = pt(r, a1), [x3, y3] = pt(R0, a1); return `M${x0},${y0}L${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}L${x3},${y3}A${R0},${R0} 0 0 0 ${x0},${y0}Z`; };
  const label = (h) => [['12a', 0], ['6a', 6], ['12p', 12], ['6p', 18]].find((x) => x[1] === h);
  return html`<div class="clock-wrap">
    <svg class="clock" viewBox="0 0 260 260" role="img" aria-label=${`24 hour clock of visitors. Busiest around ${hourLabel(peak)}.`}>
      <circle cx=${cx} cy=${cy} r=${R0 - 4} fill="none" stroke="var(--hair)"/><circle cx=${cx} cy=${cy} r=${R1} fill="none" stroke="var(--hair)" stroke-dasharray="2 5"/>
      ${hourly.map((v, h) => html`<path key=${h} class="wedge" d=${wedge(h, R0 + Math.max(3, (v / mx) * (R1 - R0)))} style=${{ fill: h === peak ? 'var(--hot)' : 'var(--accent)', opacity: hot === null ? 0.3 + 0.7 * (v / mx) : hot === h ? 1 : 0.25, animationDelay: h * 22 + 'ms' }} onPointerEnter=${() => { setHot(h); onNote(`${hourLabel(h)}: ${fmtFull(v)} visitors an hour on a typical day`); }} onPointerLeave=${() => { setHot(null); onNote(''); }}/>`)}
      ${[0, 6, 12, 18].map((h) => { const [x, y] = pt(R1 + 15, h * 15); return html`<text key=${h} x=${x} y=${y + 3} text-anchor="middle" class="cal-t">${label(h)[0]}</text>`; })}
      <text x=${cx} y=${cy - 2} text-anchor="middle" class="clock-big">${hourLabel(hot === null ? peak : hot)}</text>
      <text x=${cx} y=${cy + 14} text-anchor="middle" class="cal-t">${hot === null ? 'busiest hour' : 'typical hour'}</text>
    </svg></div>`;
}
const Fragmentish = ({ children }) => children;

export function TimePatterns({ api, tz, look, theme, now }) {
  const [ref, seen] = useInView();
  const [note, setNote] = useState('');
  const range = useMemo(() => makeRange('90d', tz, null, now), [tz, now]);
  const { data, error, retry } = useApi(api, `/api/v0/stats/total?${q({ start: range.start, end: range.end })}`, { ttl: 6 * 3600_000, enabled: seen });
  const hw = useMemo(() => (data ? hourWeekday(data) : null), [data]);
  const enough = hw && hw.m.flat().reduce((a, b) => a + b, 0) >= 60;
  return html`<section class="card span-12" ref=${ref} aria-label="When readers show up">
    <div class="card-h"><div><h2>When your readers show up</h2><p class="sub">Typical visitors by weekday and hour over the last 90 days, in the site's time zone</p></div></div>
    ${error ? html`<${ErrorBox} error=${error} retry=${retry} />` : !data ? html`<${Skeleton} h=${240} r="12px" />` : !enough ? html`<div class="empty">Not enough traffic yet to show a pattern.</div>` : html`
      <div class="pat">
        <div class="pat-main">${look === 'nova' ? html`<${Skyline} m=${hw.m} n=${hw.n} themeKey=${look + theme} onNote=${setNote} />` : html`<${HeatGrid} m=${hw.m} n=${hw.n} onNote=${setNote} />`}</div>
        <div class="pat-clock"><${HourClock} m=${hw.m} onNote=${setNote} /></div>
      </div>
      <div class="sky-note" aria-live="polite">${note}</div>`}
  </section>`;
}
