import { html, useState, useEffect, useMemo, useRef, useInView } from '../ui.js';
import { useApi, SkeletonRows, ErrorBox, Sparkline, Skeleton, Num, Delta } from './common.js';
import { q, ttlFor } from '../api.js';
import { fmtNum, fmtFull, fmtPct } from '../util.js';
import { pageSeries, pageMovers, shareOf, schemeLabel } from '../model.js';
import { countryCode, flagFor, loadWorldMap } from '../countries.js';
import { useTilt, hexToRgb, cssVar } from '../fx.js';

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
const SIZE_NAMES = { phone: 'Phones', tablet: 'Tablets', desktop: 'Laptop and desktop', desktophd: 'HD displays', largerscreen: 'Large screens', unknown: 'Unknown' };
const nameOf = (r) => r.name || SIZE_NAMES[r.id] || (r.id === '' ? '(unknown)' : r.id) || '(direct)';

export function SubRows({ api, endpoint, ttl, total }) {
  const { data, error, loading, retry } = useApi(api, endpoint, { ttl });
  if (error) return html`<div class="sub-rows"><${ErrorBox} error=${error} retry=${retry} /></div>`;
  if (!data && loading) return html`<div class="sub-rows"><${Skeleton} h=${14} w="60%" /></div>`;
  const rows = (data && (data.stats || data.refs)) || [];
  if (!rows.length) return html`<div class="sub-rows"><div class="sub-row"><span>No detail available</span></div></div>`;
  return html`<div class="sub-rows">${rows.slice(0, 8).map((r) => html`<div class="sub-row" key=${r.id || r.name}><span>${nameOf(r)}</span><span class="num">${fmtFull(r.count)}</span></div>`)}</div>`;
}

// Generic ranked list that loads when it nears the viewport and opens a detail list on click.
export function RankCard({ api, title, sub, endpoint, ttl, pick = (d) => d.stats, drill, show = 8, color, stack = false, span = 'span-4', empty = 'No data in this range.', tag, hideEmpty = false }) {
  const [ref, seen] = useInView();
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const { data, error, loading, retry } = useApi(api, endpoint, { ttl, enabled: seen });
  const rows = data ? pick(data) || [] : [];
  const total = rows.reduce((a, r) => a + (r.count || 0), 0);
  const max = Math.max(1, ...rows.map((r) => r.count || 0));
  const shown = all ? rows : rows.slice(0, show);
  // optional cards (campaigns) stay out of the page until there is something to show; the sentinel only triggers the load
  if (hideEmpty && (!data || !rows.length || (error && error.kind === 'notfound'))) return html`<div ref=${ref} aria-hidden="true" style="position:absolute;left:0;bottom:0;width:1px;height:1px;pointer-events:none"></div>`;
  return html`<section class=${'card ' + span} ref=${ref} aria-label=${title}>
    <div class="card-h"><div><h2>${title}</h2>${sub ? html`<p class="sub">${sub}</p>` : null}</div>${rows.length ? html`<span class="sub num">${rows.length}</span>` : null}</div>
    ${error ? html`<${ErrorBox} error=${error} retry=${retry} />` : !data ? html`<${SkeletonRows} n=${Math.min(show, 5)} />` : !rows.length ? html`<div class="empty">${empty}</div>` : html`
      ${stack ? html`<div class="stack" aria-hidden="true">${rows.slice(0, 6).map((r, i) => html`<i key=${r.id || r.name} style=${{ width: shareOf(r.count, total) + '%', '--c': COLORS[i % 6] }}></i>`)}</div>` : null}
      <ul class="rows">${shown.map((r, i) => {
        const id = r.id === undefined || r.id === '' ? r.name : r.id;
        const canDrill = drill && drill(r);
        const isOpen = open === id;
        return html`<li key=${id + ':' + i}>
          <button class="row-btn" type="button" aria-expanded=${canDrill ? String(isOpen) : undefined} onClick=${() => canDrill && setOpen(isOpen ? null : id)} style=${{ cursor: canDrill ? 'pointer' : 'default' }}>
            <div class="row"><span class="name">${stack ? html`<i class="dot" style=${{ '--c': COLORS[i % 6] }}></i>` : null}${nameOf(r)}${tag && tag(r) ? html`<span class="tag">${tag(r)}</span>` : null}</span><span class="cnt">${fmtNum(r.count)}</span><span class="pct">${shareOf(r.count, total).toFixed(1)}%</span>
            <div class="track"><i style=${{ '--w': (r.count / max) * 100 + '%', '--c': color || (stack ? COLORS[i % 6] : undefined), animationDelay: i * 40 + 'ms' }}></i></div></div>
          </button>
          ${isOpen && canDrill ? html`<${SubRows} api=${api} endpoint=${canDrill} ttl=${ttl} total=${r.count} />` : null}
        </li>`;
      })}</ul>
      ${rows.length > show ? html`<button class="more" type="button" onClick=${() => setAll(!all)}>${all ? 'Show less' : `Show all ${rows.length}`}</button>` : null}`}
  </section>`;
}

export function TopPages({ api, range, hits, now, filtered, onFilter }) {
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const { data, error, loading, retry } = hits;
  const rows = (data && data.hits) || [];
  const total = rows.reduce((a, r) => a + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const movers = new Map(pageMovers(rows).map((m) => [m.path, m]));
  const shown = all ? rows : rows.slice(0, 8);
  return html`<section class="card span-7" aria-label="Top pages">
    <div class="card-h"><div><h2>Top pages</h2><p class="sub">Click a page to see where its visitors came from</p></div>${rows.length ? html`<span class="sub num">${rows.length}${data.more ? '+' : ''} paths</span>` : null}</div>
    ${error ? html`<${ErrorBox} error=${error} retry=${retry} />` : !data ? html`<${SkeletonRows} n=${6} />` : !rows.length ? html`<div class="empty">No pageviews in this range.</div>` : html`
      <ul class="rows">${shown.map((r, i) => {
        const mv = movers.get(r.path), isOpen = open === r.path_id;
        return html`<li key=${r.path_id}>
          <button class="row-btn" type="button" aria-expanded=${String(isOpen)} onClick=${() => setOpen(isOpen ? null : r.path_id)}>
            <div class="row" style="grid-template-columns:minmax(0,1fr) auto auto auto">
              <span class="name">${r.path}${r.title && r.title !== r.path ? html`<small>${r.title}</small>` : null}</span>
              <span class="spark" style=${{ color: mv && mv.change > 0.25 ? 'var(--up)' : mv && mv.change < -0.25 ? 'var(--down)' : 'var(--text-3)' }}><${Sparkline} values=${pageSeries(r, range)} w=${64} h=${20} label=${mv ? (mv.change > 0 ? 'rising' : 'falling') : 'trend'} /></span>
              <span class="cnt">${fmtNum(r.count)}</span><span class="pct">${shareOf(r.count, total).toFixed(1)}%</span>
              <div class="track"><i style=${{ '--w': (r.count / max) * 100 + '%', animationDelay: i * 40 + 'ms' }}></i></div>
            </div>
          </button>
          ${isOpen ? html`<${SubRows} api=${api} endpoint=${'/api/v0/stats/hits/' + r.path_id + '?' + q({ start: range.start, end: range.end, limit: 10 })} ttl=${ttlFor(range)} total=${r.count} />` : null}
          ${isOpen && !filtered && onFilter ? html`<button type="button" class="only" onClick=${() => onFilter({ id: r.path_id, path: r.path })}>Show only this page</button>` : null}
        </li>`;
      })}</ul>
      ${rows.length > 8 ? html`<button class="more" type="button" onClick=${() => setAll(!all)}>${all ? 'Show less' : `Show all ${rows.length}`}</button>` : null}`}
  </section>`;
}

export function StatStrip({ cur, prev, avg, avgPrev, peak, topPage, topRef, series, hourly, look }) {
  const ref = useRef(null);
  useTilt(ref, look === 'nova');
  const pct = prev > 0 ? ((cur - prev) / prev) * 100 : null;
  const apct = avgPrev > 0 ? ((avg - avgPrev) / avgPrev) * 100 : null;
  const vals = series.filter((p) => p.v !== null).map((p) => p.v);
  const G = html`<span class="glare" aria-hidden="true"></span>`;
  return html`<section class="kpis" aria-label="Summary" ref=${ref}>
    <div class="card kpi">${G}<div class="l">Visitors</div><div class="v">${cur === null ? html`<${Skeleton} h=${26} w="70%" />` : html`<${Num} value=${cur} />`}</div><div class="s">${pct === null ? 'no earlier data to compare' : html`<${Delta} pct=${pct} /> vs previous`}</div><${Sparkline} values=${vals} w=${120} label="visitors trend" /></div>
    <div class="card kpi">${G}<div class="l">${hourly ? 'Per hour' : 'Per day'}</div><div class="v">${avg === null ? html`<${Skeleton} h=${26} w="60%" />` : html`<${Num} value=${Math.round(avg)} />`}</div><div class="s">${apct === null ? 'average' : html`<${Delta} pct=${apct} /> average`}</div></div>
    <div class="card kpi">${G}<div class="l">${hourly ? 'Peak hour' : 'Peak day'}</div><div class="v">${peak ? html`<${Num} value=${peak.v} />` : html`<${Skeleton} h=${26} w="50%" />`}</div><div class="s">${peak ? peak.label : ''}</div></div>
    <div class="card kpi">${G}<div class="l">Top page</div>${topPage ? html`<div class="v path" title=${topPage.path}>${topPage.path}</div><div class="s">${fmtNum(topPage.count)} visitors</div>` : html`<div class="v"><${Skeleton} h=${22} w="80%" /></div>`}</div>
    <div class="card kpi">${G}<div class="l">Top referrer</div>${topRef ? html`<div class="v path" title=${topRef.name}>${topRef.name}</div><div class="s">${fmtNum(topRef.count)} visitors</div>` : topRef === false ? html`<div class="v path">None yet</div>` : html`<div class="v"><${Skeleton} h=${22} w="80%" /></div>`}</div>
  </section>`;
}

export { schemeLabel };


// Where a point on the globe lands on screen. This is cobe's own rotation: spin by phi, tilt by theta, looking down the z axis.
const unit = ([lat, lon]) => { const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180 - Math.PI; return [-Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)]; };
const turn = (v, phi, theta) => { const c = Math.cos(theta), e = Math.sin(theta), d = Math.cos(phi), f = Math.sin(phi); return [v[0] * d + v[2] * f, v[0] * f * e + v[1] * c - v[2] * d * e, -v[0] * f * c + v[1] * e + v[2] * d * c]; };

// Centre of each country's largest shape, read from the map paths (equirectangular, latitude 84 down to -58).
function centroids(paths) {
  const out = {};
  for (const code in paths) {
    let best = null;
    for (const sub of paths[code].split('M').slice(1)) {
      const pts = [...sub.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [+m[1], +m[2]]);
      if (!pts.length) continue;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), area = (x1 - x0) * (y1 - y0);
      if (!best || area > best.area) best = { area, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    }
    if (best) out[code] = [84 - best.cy * (142 / 500), (best.cx / 1000) * 360 - 180];
  }
  return out;
}

// Countries: a WebGL globe (Nova) or a choropleth map beside the ranked list. Hovering a row lights its country.
export function CountriesCard({ api, range, ttl, look, theme }) {
  const [ref, seen] = useInView();
  const [mapReady, setMapReady] = useState(typeof window !== 'undefined' && !!window.WORLD_MAP_PATHS);
  const [view, setView] = useState(look === 'nova' ? 'globe' : 'map');
  const [onScreen, setOnScreen] = useState(true);
  const [hot, setHot] = useState(null);
  const [tip, setTip] = useState(null);
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const wrap = useRef(null), box = useRef(null);
  useEffect(() => setView(look === 'nova' ? 'globe' : 'map'), [look]);
  useEffect(() => { if (seen) loadWorldMap().then(() => setMapReady(true)); }, [seen]);
  const { data, error, retry } = useApi(api, `/api/v0/stats/locations?${q({ start: range.start, end: range.end, limit: 100 })}`, { ttl, enabled: seen });
  const rows = data ? data.stats || [] : [];
  const total = rows.reduce((a, r) => a + (r.count || 0), 0);
  const max = Math.max(1, ...rows.map((r) => r.count || 0));
  const byCode = useMemo(() => {
    const m = new Map();
    if (!mapReady) return m;
    for (const r of rows) { const c = countryCode(r); if (c) m.set(c, { name: r.name || r.id, count: (m.get(c) ? m.get(c).count : 0) + r.count }); }
    return m;
  }, [rows, mapReady]);
  const maxMap = Math.max(1, ...[...byCode.values()].map((v) => v.count));
  const paths = typeof window !== 'undefined' ? window.WORLD_MAP_PATHS : null;
  const cent = useMemo(() => (mapReady && paths ? centroids(paths) : null), [mapReady]);

  // the globe: created when visible, destroyed when scrolled away or when the look changes.
  // cobe draws the sphere and its markers. Everything that moves on top of it (arcs, travelling dots, pulse rings, labels) is drawn
  // here on a second, flat canvas from the same rotation, so it costs almost nothing and needs no special browser support.
  useEffect(() => {
    if (view !== 'globe' || !mapReady || !cent || !rows.length || !onScreen || !box.current) return;
    const ranked = [...byCode.entries()].filter(([k]) => cent[k]).sort((a, b) => b[1].count - a[1].count);
    const top = ranked[0];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let dead = false, g = null, phi = top ? (-(cent[top[0]][1] + 90) * Math.PI) / 180 : 0.6, drag = null, off = 0, dirty = true;
    const host = box.current, canvas = document.createElement('canvas'), over = document.createElement('canvas');
    canvas.id = 'globe'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Globe with markers for visitor countries. The list beside it has the same data.');
    over.className = 'globe-over'; over.setAttribute('aria-hidden', 'true');
    host.replaceChildren(canvas, over);
    import('cobe').then(({ default: createGlobe }) => {
      if (dead) return;
      try {
        const size = host.clientWidth || 480, dpr = Math.min(2, devicePixelRatio || 1), light = theme === 'light', theta = 0.3;
        canvas.width = canvas.height = over.width = over.height = Math.round(size * dpr);
        const markers = ranked.map(([c, v]) => ({ location: cent[c], size: 0.035 + 0.1 * Math.sqrt(v.count / maxMap) }));
        const base = hexToRgb(cssVar(light ? '--bg-2' : '--surface-2'));
        const accent = cssVar('--accent'), cool = cssVar(light ? '--accent' : '--accent-2'), hot = cssVar('--hot'), panel = cssVar('--surface');
        const lit = ranked.slice(0, 7), t0 = performance.now();
        const arcs = ranked.slice(1, 8).map(([c], i) => ({ a: unit(cent[top[0]]), b: unit(cent[c]), start: 500 + i * 380 }));
        const ctx = over.getContext('2d');
        const drawOver = (now, ph) => {
          const t = reduced ? 1e6 : now - t0, R = size * 0.4, cx = size / 2;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
          const at = (v, k = 1) => { const r = turn(v, ph, theta); return { x: cx + R * k * r[0], y: cx - R * k * r[1], z: r[2], seen: r[2] > -0.02 || r[0] * r[0] + r[1] * r[1] > 1 }; };
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const arc of arcs) { // each arc flies out from the top country, then a small dot keeps travelling along it
            const grow = reduced ? 1 : Math.min(1, Math.max(0, (t - arc.start) / 1100)); if (!grow) continue;
            const w = Math.acos(Math.max(-1, Math.min(1, arc.a[0] * arc.b[0] + arc.a[1] * arc.b[1] + arc.a[2] * arc.b[2]))), lift = 0.1 + 0.2 * (w / Math.PI), N = 40, pts = [];
            for (let i = 0; i <= N; i++) { const u = i / N, so = Math.sin(w) || 1, ka = Math.sin((1 - u) * w) / so, kb = Math.sin(u * w) / so, v = [ka * arc.a[0] + kb * arc.b[0], ka * arc.a[1] + kb * arc.b[1], ka * arc.a[2] + kb * arc.b[2]]; pts.push(at(v, 1 + lift * Math.sin(Math.PI * u))); }
            const end = Math.round(N * grow);
            ctx.strokeStyle = cool; ctx.shadowColor = cool; ctx.shadowBlur = 6; ctx.lineWidth = 1.4;
            for (let i = 1; i <= end; i++) { const p0 = pts[i - 1], p1 = pts[i]; if (!p0.seen || !p1.seen) continue; ctx.globalAlpha = 0.25 + 0.6 * (i / N); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
            ctx.shadowBlur = 0; ctx.globalAlpha = 1;
            const head = grow < 1 ? pts[end] : (reduced ? null : pts[Math.floor(((t - arc.start) / 2600) % 1 * N)]);
            if (head && head.seen) { ctx.fillStyle = '#fff'; ctx.shadowColor = cool; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(head.x, head.y, 2.2, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
          }
          lit.forEach(([c, v], i) => { // pulse rings on the busiest countries, and a bright centre on the top one
            const p = at(unit(cent[c])); if (p.z < 0.08) return; const vis = Math.min(1, (p.z - 0.08) / 0.3), col = i === 0 ? hot : cool;
            ctx.strokeStyle = col; ctx.lineWidth = 1.5;
            for (const off2 of [0, 0.5]) { const ph2 = reduced ? 0.35 : ((t / 3200 + i * 0.17 + off2) % 1); ctx.globalAlpha = Math.pow(1 - ph2, 1.6) * 0.8 * vis; ctx.beginPath(); ctx.arc(p.x, p.y, 4 + 20 * ph2, 0, 7); ctx.stroke(); }
            if (i === 0) { ctx.globalAlpha = vis; ctx.fillStyle = hot; ctx.shadowColor = hot; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
            ctx.globalAlpha = 1;
          });
          ctx.font = '600 11.5px "Space Grotesk", system-ui, sans-serif'; ctx.textBaseline = 'middle';
          lit.slice(0, 3).forEach(([c, v]) => { // names beside the three busiest, only while they face you
            const p = at(unit(cent[c])); if (p.z < 0.3) return; const label = `${flagFor(v.name)} ${v.name}`, w = ctx.measureText(label).width + 18, h = 22, x = p.x + 12, y = p.y - h / 2;
            ctx.globalAlpha = Math.min(1, (p.z - 0.3) / 0.3); ctx.fillStyle = panel; ctx.globalAlpha *= 0.82; ctx.beginPath(); ctx.roundRect(x, y, w, h, 11); ctx.fill();
            ctx.globalAlpha = Math.min(1, (p.z - 0.3) / 0.3); ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = light ? '#1b1535' : '#ece8ff'; ctx.fillText(label, x + 9, p.y + 0.5); ctx.globalAlpha = 1;
          });
        };
        g = createGlobe(canvas, { devicePixelRatio: dpr, width: canvas.width, height: canvas.height, phi, theta, dark: light ? 0 : 1, diffuse: light ? 1.2 : 1.6, mapSamples: 22000, mapBrightness: light ? 2.4 : 8, baseColor: light ? base : base.map((c) => c * 1.8 + 0.1), markerColor: hexToRgb(cssVar('--accent')), glowColor: light ? [0.85, 0.82, 1] : hexToRgb(cssVar('--accent-2')).map((c) => c * 0.8), markers,
          onRender: (st) => { if (drag === null && !reduced) phi += 0.0045; st.phi = phi + off; if (!reduced || dirty) { drawOver(performance.now(), phi + off); dirty = false; } } });
        const down = (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
        const move = (e) => { if (drag !== null) { off += (e.clientX - drag) * 0.006; drag = e.clientX; dirty = true; } };
        const up = () => { drag = null; canvas.style.cursor = 'grab'; };
        canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
        canvas._gcCleanup = () => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); };
      } catch (e) { setView('map'); }
    }).catch(() => setView('map'));
    return () => { dead = true; if (g) g.destroy(); if (canvas._gcCleanup) canvas._gcCleanup(); host.replaceChildren(); };
  }, [view, mapReady, cent, rows, onScreen, theme, look]);
  useEffect(() => {
    if (!wrap.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => setOnScreen(es[0].isIntersecting), { rootMargin: '100px' });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, [data, view]);

  const shown = all ? rows : rows.slice(0, 9);
  const onMove = (e) => {
    const t = e.target.closest && e.target.closest('path');
    if (!t || t.dataset.has !== '1') { setTip(null); setHot(null); return; }
    const entry = byCode.get(t.dataset.code), r = wrap.current.getBoundingClientRect();
    setHot(t.dataset.code);
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, name: entry.name, count: entry.count });
  };
  return html`<section class="card span-12" ref=${ref} aria-label="Countries">
    <div class="card-h"><div><h2>Countries</h2><p class="sub">Where your visitors are. Click a country for its regions.</p></div>${rows.length ? html`<span class="sub num">${rows.length}</span>` : null}</div>
    ${error ? html`<${ErrorBox} error=${error} retry=${retry} />` : !data ? html`<${Skeleton} h=${280} r="12px" />` : !rows.length ? html`<div class="empty">No visitors in this range.</div>` : html`
    <div class="geo">
      <div class="map-wrap" ref=${wrap}>
        ${look === 'nova' ? html`<div class="seg-tabs" role="group" aria-label="Map style"><button type="button" aria-pressed=${String(view === 'globe')} onClick=${() => setView('globe')}>Globe</button><button type="button" aria-pressed=${String(view === 'map')} onClick=${() => setView('map')}>Map</button></div>` : null}
        ${view === 'globe' ? html`<div class="globe-box" ref=${box}></div><p class="globe-note" aria-hidden="true">Arcs link your top country to the next seven. Drag to turn the globe.</p>` :
          paths ? html`<svg class="map" viewBox=${window.WORLD_MAP_VIEWBOX || '0 0 1000 500'} preserveAspectRatio="xMidYMid meet" role="img" aria-label="World map shaded by visitors" onMouseMove=${onMove} onMouseLeave=${() => { setTip(null); setHot(null); }}>
          ${Object.keys(paths).map((code) => { const e = byCode.get(code); return html`<path key=${code} d=${paths[code]} data-code=${code} data-has=${e ? '1' : '0'} class=${code === hot ? 'hot' : ''} fill-opacity=${e ? 0.22 + 0.78 * Math.sqrt(e.count / maxMap) : 1} />`; })}</svg>` : html`<${Skeleton} h=${260} r="12px" />`}
        ${tip && view === 'map' ? html`<div class="tip" style=${{ left: Math.max(4, Math.min(tip.x + 14, (wrap.current ? wrap.current.clientWidth : 800) - 190)) + 'px', top: Math.max(4, tip.y - 56) + 'px', minWidth: '150px' }}><b>${flagFor(tip.name)} ${tip.name}</b><div class="v">${fmtFull(tip.count)}</div><div class="p">${shareOf(tip.count, total).toFixed(1)}% of visitors</div></div>` : null}
        ${view === 'map' ? html`<div class="legend map-legend" aria-hidden="true"><span>Fewer</span><i class="ramp"></i><span>More</span></div>` : null}
      </div>
      <div>
        <ul class="rows">${shown.map((r, i) => { const code = countryCode(r), id = r.id || r.name, isOpen = open === id; return html`<li key=${id + i} onMouseEnter=${() => setHot(code)} onMouseLeave=${() => setHot(null)}>
          <button class="row-btn" type="button" aria-expanded=${String(isOpen)} onClick=${() => setOpen(isOpen ? null : id)}>
            <div class="row"><span class="name"><span aria-hidden="true">${flagFor(r.name)}</span> ${nameOf(r)}</span><span class="cnt">${fmtNum(r.count)}</span><span class="pct">${shareOf(r.count, total).toFixed(1)}%</span>
            <div class="track"><i style=${{ '--w': (r.count / max) * 100 + '%', animationDelay: i * 40 + 'ms' }}></i></div></div></button>
          ${isOpen && r.id ? html`<${SubRows} api=${api} endpoint=${'/api/v0/stats/locations/' + r.id + '?' + q({ start: range.start, end: range.end, limit: 10 })} ttl=${ttl} total=${r.count} />` : null}</li>`; })}</ul>
        ${rows.length > 9 ? html`<button class="more" type="button" onClick=${() => setAll(!all)}>${all ? 'Show less' : `Show all ${rows.length}`}</button>` : null}
      </div>
    </div>`}
  </section>`;
}
