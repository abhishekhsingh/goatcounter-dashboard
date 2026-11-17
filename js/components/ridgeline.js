import { html, useState, useEffect, useRef, useMemo } from '../ui.js';
import { hourLabel, fmtFull } from '../util.js';
import { hexToRgb, cssVar, canTilt } from '../fx.js';

const MAX_DAYS = 42; // six weeks
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
const dayName = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// One line per day, drawn like a mountain range: hours run left to right, height is visitors that hour.
// The oldest day is at the back and narrower, the newest in front. A day's line is brighter the busier the day.
export function days(total) {
  const rows = ((total && total.stats) || []).filter((s) => s.hourly && s.hourly.length === 24).slice(-MAX_DAYS);
  return rows.map((s) => ({ day: s.day, h: s.hourly, sum: s.hourly.reduce((a, b) => a + b, 0) }));
}

function Ridge({ rows, themeKey, look, onNote }) {
  const cv = useRef(null), wrap = useRef(null), S = useRef({ hover: -1, born: 0, vis: true, pos: [], kick: null });
  useEffect(() => {
    const canvas = cv.current, ctx = canvas.getContext('2d'), st = S.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const all = rows.flatMap((r) => r.h).filter((v) => v > 0).sort((a, b) => a - b), gmax = Math.max(1, all.length ? all[Math.floor(all.length * 0.95)] : 1), dmax = Math.max(1, ...rows.map((r) => r.sum));
    st.born = performance.now(); let raf = 0;
    const draw = (now) => {
      const W = canvas.clientWidth, H = Math.max(230, Math.min(380, Math.round(W * (W < 600 ? 0.62 : 0.3)))), dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const lo = hexToRgb(cssVar('--accent')), mid = hexToRgb(cssVar('--accent-2')), hi = hexToRgb(cssVar('--hot')), fill = hexToRgb(cssVar('--surface-2'));
      const n = rows.length, t = reduced ? 9 : (now - st.born) / 1000, top = H * 0.3, bottom = H - 26, gap = (bottom - top) / Math.max(1, n - 1), amp = Math.min(H * 0.3, gap * 9);
      const x0 = 10, x1 = W - 10; st.pos = [];
      for (let r = 0; r < n; r++) {
        const row = rows[r], depth = n > 1 ? r / (n - 1) : 1, sc = 0.66 + 0.34 * depth, cx = (x0 + x1) / 2, y0 = top + r * gap;
        const k = 1 - Math.pow(1 - Math.min(1, Math.max(0, (t - r * 0.016) / 0.8)), 3); // the range rises from back to front
        const warm = Math.pow(row.sum / dmax, 0.7), on = st.hover === r, dim = st.hover >= 0 && !on ? 0.35 : 1;
        const xs = row.h.map((_, i) => cx + ((x0 + ((x1 - x0) * i) / 23) - cx) * sc), ys = row.h.map((v) => y0 - Math.min(1.6, Math.pow(v / gmax, 1.1)) * amp * k); // a viral day is allowed above the rest, but not off the chart
        ctx.beginPath(); ctx.moveTo(xs[0], y0);
        ctx.lineTo(xs[0], ys[0]);
        for (let i = 0; i < 23; i++) { const mx = (xs[i] + xs[i + 1]) / 2, my = (ys[i] + ys[i + 1]) / 2; ctx.quadraticCurveTo(xs[i], ys[i], mx, my); }
        ctx.lineTo(xs[23], ys[23]); ctx.lineTo(xs[23], y0); ctx.closePath();
        ctx.fillStyle = rgba(fill, 0.95); ctx.fill(); // hides the ridges behind it
        const c = mix(lo, warm > 0.55 ? hi : mid, Math.min(1, warm * 1.1)), a = (0.28 + 0.72 * depth) * dim;
        const gr = ctx.createLinearGradient(0, y0 - amp * k * 1.2, 0, y0); gr.addColorStop(0, rgba(c, 0.26 * dim)); gr.addColorStop(1, rgba(c, 0)); ctx.fillStyle = gr; ctx.fill(); // a glow that fades toward the ground
        ctx.lineWidth = on ? 2.4 : 1.2; ctx.strokeStyle = rgba(on ? mix(c, [1, 1, 1], 0.3) : c, on ? 1 : a); ctx.lineJoin = 'round';
        if (on || warm > 0.8) { ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = on ? 14 : 7; }
        ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
        for (let i = 0; i < 23; i++) { const mx = (xs[i] + xs[i + 1]) / 2, my = (ys[i] + ys[i + 1]) / 2; ctx.quadraticCurveTo(xs[i], ys[i], mx, my); }
        ctx.lineTo(xs[23], ys[23]); ctx.stroke(); ctx.shadowBlur = 0;
        st.pos.push({ y: y0, depth });
      }
      const text3 = cssVar('--text-3'); ctx.fillStyle = text3; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      const sc0 = 1, cx = (x0 + x1) / 2;
      for (const h of [0, 6, 12, 18, 23]) ctx.fillText(h === 23 ? '11p' : h === 0 ? '12a' : h === 12 ? '12p' : h + (h < 12 ? 'a' : 'p'), cx + ((x0 + ((x1 - x0) * h) / 23) - cx) * sc0, H - 8);
    };
    const loop = (now) => { raf = 0; if (!st.vis || document.hidden) return; draw(now); if (!reduced && now - st.born < 2000) raf = requestAnimationFrame(loop); };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    st.kick = kick; draw(performance.now()); kick();
    const io = new IntersectionObserver((es) => { st.vis = es[0].isIntersecting; if (st.vis) { st.born = performance.now(); kick(); } }); io.observe(canvas);
    let rr = 0; const ro = new ResizeObserver(() => { cancelAnimationFrame(rr); rr = requestAnimationFrame(() => draw(performance.now())); }); ro.observe(canvas);
    return () => { if (raf) cancelAnimationFrame(raf); cancelAnimationFrame(rr); io.disconnect(); ro.disconnect(); };
  }, [rows, themeKey]);

  // hover: the nearest line to the pointer lights up and names its day
  const point = (e) => {
    const st = S.current, y = e.offsetY; let best = -1, bd = 1e9;
    st.pos.forEach((p, i) => { const d = Math.abs(p.y - y); if (d < bd) { bd = d; best = i; } });
    if (best < 0 || bd > 26) best = -1;
    if (best !== st.hover) {
      st.hover = best; st.kick && st.kick();
      if (best < 0) onNote('');
      else { const r = rows[best], pk = r.h.indexOf(Math.max(...r.h)); onNote(`${dayName(r.day)}: ${fmtFull(r.sum)} visitors, busiest around ${hourLabel(pk)}`); }
    }
  };
  // a slight lean toward the pointer, like turning a model in your hand (compositor only)
  const lean = (e) => {
    if (!canTilt() || look !== 'nova') return;
    const r = wrap.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    cv.current.style.transform = `perspective(1200px) rotateX(${6 - y * 7}deg) rotateY(${x * 7}deg)`;
  };
  const rest = () => { S.current.hover = -1; S.current.kick && S.current.kick(); onNote(''); if (cv.current) cv.current.style.transform = ''; };
  const peak = useMemo(() => rows.reduce((a, r) => (r.sum > a.sum ? r : a), rows[0]), [rows]);
  return html`<div class="ridge-wrap" ref=${wrap} onPointerMove=${lean} onPointerLeave=${rest}>
    <canvas ref=${cv} class="ridge" role="img" aria-label=${`Day by day ridgeline of the last ${rows.length} days. The busiest day was ${dayName(peak.day)} with ${fmtFull(peak.sum)} visitors.`} onPointerMove=${point}></canvas>
  </div>`;
}

export function Ridgeline({ total, look, theme }) {
  const [note, setNote] = useState('');
  const rows = useMemo(() => days(total), [total]);
  if (rows.filter((r) => r.sum > 0).length < 14) return null; // too little to draw a range
  return html`<div class="ridge-block">
    <div class="ridge-h"><h3>Day by day</h3><p class="sub">Each line is one day, oldest at the back. Height is visitors in that hour. Hover a line to read it.</p></div>
    <${Ridge} rows=${rows} themeKey=${look + theme} look=${look} onNote=${setNote} />
    <div class="sky-note" aria-live="polite">${note}</div>
  </div>`;
}
