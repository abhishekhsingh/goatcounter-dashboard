import { html, useState, useEffect, useRef, useMemo } from '../ui.js';
import { monotonePath, niceScale, fmtNum, fmtFull, clamp } from '../util.js';

// The main chart: visitors per bucket with a ghost line for the previous period, a dashed live edge,
// annotated spikes, a crosshair (pointer, touch and arrow keys) and click-to-zoom.
export function HeroChart({ series, prev, spikes, hover, onHover, onZoom, rangeKey, hourly }) {
  const box = useRef(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver((es) => setW(Math.max(280, Math.round(es[0].contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const H = w < 520 ? 230 : 320, M = { t: 14, r: 12, b: 28, l: 42 };
  const pw = w - M.l - M.r, ph = H - M.t - M.b;
  const n = series.length;

  const g = useMemo(() => {
    const vals = series.filter((p) => p.v !== null).map((p) => p.v);
    const pv = prev.map((p) => p.v || 0);
    const { ymax, step: ystep } = niceScale(Math.max(1, ...vals, ...pv));
    const x = (i) => M.l + (n > 1 ? (i * pw) / (n - 1) : pw / 2);
    const y = (v) => M.t + ph - (v / ymax) * ph;
    const live = series.filter((p) => p.v !== null);
    const lastIdx = live.length - 1;
    const partial = lastIdx >= 0 && live[lastIdx].partial;
    const solid = (partial ? live.slice(0, -1) : live).map((p) => [x(p.i), y(p.v)]);
    const dashed = partial && lastIdx > 0 ? [live[lastIdx - 1], live[lastIdx]].map((p) => [x(p.i), y(p.v)]) : null;
    const all = live.map((p) => [x(p.i), y(p.v)]);
    const area = all.length ? `${monotonePath(all)}L${all[all.length - 1][0]},${M.t + ph}L${all[0][0]},${M.t + ph}Z` : '';
    const ghost = prev.slice(0, n).map((p, i) => [x(i), y(p.v || 0)]);
    const step = hourly ? 4 : Math.max(1, Math.ceil(n / (w < 520 ? 4 : 7)));
    const xt = series.filter((p, i) => (hourly ? p.hour % 4 === 0 : i % step === 0));
    return { ymax, ystep, x, y, solid, dashed, area, ghost, xt, lastLive: live.length ? live[live.length - 1].i : 0 };
  }, [series, prev, w, n, hourly]);

  const idxFromEvent = (e) => {
    const r = box.current.getBoundingClientRect();
    const px = e.clientX - r.left - M.l;
    return clamp(Math.round((px / pw) * (n - 1)), 0, g.lastLive);
  };
  const onKey = (e) => {
    const cur = hover === null ? g.lastLive : hover;
    const k = e.key;
    if (k === 'ArrowLeft') onHover(clamp(cur - 1, 0, g.lastLive));
    else if (k === 'ArrowRight') onHover(clamp(cur + 1, 0, g.lastLive));
    else if (k === 'Home') onHover(0);
    else if (k === 'End') onHover(g.lastLive);
    else if (k === 'Escape') onHover(null);
    else if (k === 'Enter' && hover !== null && !hourly) onZoom(series[hover].day);
    else return;
    e.preventDefault();
  };

  const hp = hover !== null ? series[hover] : null;
  const pp = hover !== null ? prev[hover] : null;
  const spike = hover !== null ? spikes.find((s) => s.i === hover) : null;
  const tipLeft = hp ? (g.x(hover) > w * 0.62 ? g.x(hover) - 252 : g.x(hover) + 14) : 0;
  const readout = hp ? `${hp.long}: ${fmtFull(hp.v || 0)} visitors${pp ? `, ${fmtFull(pp.v || 0)} in the previous period` : ''}` : '';

  return html`<div class="chart" ref=${box} style=${{ height: H + 'px' }} tabindex="0" role="group"
      aria-label="Visitors over time. Use the left and right arrow keys to read each point."
      onKeyDown=${onKey} onFocus=${() => hover === null && onHover(g.lastLive)} onBlur=${() => onHover(null)}
      onPointerMove=${(e) => onHover(idxFromEvent(e))} onPointerLeave=${() => onHover(null)} onClick=${(e) => { if (!hourly) { const i = idxFromEvent(e); onZoom(series[i].day); } }}>
    <svg viewBox=${`0 0 ${w} ${H}`} width=${w} height=${H} aria-hidden="true">
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--area)" stop-opacity=".28"/><stop offset="1" stop-color="var(--area)" stop-opacity="0"/></linearGradient><linearGradient id="hline" gradientUnits="userSpaceOnUse" x1=${M.l} y1="0" x2=${w - M.r} y2="0"><stop offset="0" stop-color="var(--line-a)"/><stop offset="1" stop-color="var(--line-b)"/></linearGradient>
        <filter id="hglow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      ${[0, 1, 2, 3, 4].map((k) => { const v = g.ystep * k, yy = g.y(v); return html`<g key=${k}><line x1=${M.l} x2=${w - M.r} y1=${yy} y2=${yy} stroke="var(--grid)"/><text x=${M.l - 8} y=${yy + 4} text-anchor="end" font-size="10.5" fill="var(--text-3)" font-family="var(--mono)">${fmtNum(v)}</text></g>`; })}
      ${g.xt.map((p) => html`<text key=${p.key} x=${g.x(p.i)} y=${H - 8} text-anchor=${p.i === 0 ? 'start' : p.i === n - 1 ? 'end' : 'middle'} font-size="10.5" fill="var(--text-3)" font-family="var(--mono)">${p.label}</text>`)}
      <g key=${'g' + rangeKey}>
        <path d=${g.area} fill="url(#hg)" class="area-in"/>
        ${g.ghost.length > 1 ? html`<path d=${monotonePath(g.ghost)} fill="none" stroke="var(--ghost)" stroke-width="1.6" stroke-dasharray="2 5" stroke-linecap="round"/>` : null}
        <path d=${monotonePath(g.solid)} fill="none" stroke="url(#hline)" stroke-width="6" opacity=".38" filter="url(#hglow)" pathLength="1" class="line-draw"/>
        <path d=${monotonePath(g.solid)} fill="none" stroke="url(#hline)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="line-draw"/>
        ${g.dashed ? html`<path d=${monotonePath(g.dashed)} fill="none" stroke="var(--line-b)" stroke-width="2.4" stroke-dasharray="3 4" stroke-linecap="round"/>` : null}
      </g>
      ${spikes.map((s) => html`<circle key=${s.i} cx=${g.x(s.i)} cy=${g.y(series[s.i].v)} r="4.5" fill="var(--surface)" stroke="var(--line-b)" stroke-width="2"/>`)}
      ${hp && hp.v !== null ? html`<g><line x1=${g.x(hover)} x2=${g.x(hover)} y1=${M.t} y2=${M.t + ph} stroke="var(--hair-2)"/><circle cx=${g.x(hover)} cy=${g.y(hp.v)} r="5" fill="var(--line-b)" stroke="var(--surface)" stroke-width="2"/></g>` : null}
    </svg>
    ${hp ? html`<div class="tip" style=${{ left: tipLeft + 'px' }} aria-hidden="true"><b>${hp.long}${hp.partial ? ' (so far)' : ''}</b><div class="v">${fmtFull(hp.v || 0)}</div>${pp ? html`<div class="p">${fmtFull(pp.v || 0)} in the previous period</div>` : null}${spike ? html`<div class="note">${spike.ratio.toFixed(1)}x a normal day</div>` : null}</div>` : null}
    <div class="sr" aria-live="polite">${readout}</div>
  </div>`;
}
