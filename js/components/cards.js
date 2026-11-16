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

export function TopPages({ api, range, hits, now }) {
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
  const wrap = useRef(null), cv = useRef(null);
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

  // the globe: created when visible, destroyed when scrolled away or when the look changes
  useEffect(() => {
    if (view !== 'globe' || !mapReady || !cent || !rows.length || !onScreen || !cv.current) return;
    // start facing the top country: cobe centres on longitude -90 - phi (degrees)
    const top = [...byCode.entries()].filter(([k]) => cent[k]).sort((a, b) => b[1].count - a[1].count)[0];
    let dead = false, g = null, phi = top ? (-(cent[top[0]][1] + 90) * Math.PI) / 180 : 0.6, drag = null, off = 0;
    const canvas = cv.current;
    import('cobe').then(({ default: createGlobe }) => {
      if (dead) return;
      try {
        const size = canvas.clientWidth || 480, dpr = Math.min(2, devicePixelRatio || 1), light = theme === 'light';
        canvas.width = canvas.height = Math.round(size * dpr);
        const markers = [...byCode.entries()].filter(([c]) => cent[c]).map(([c, v]) => ({ location: cent[c], size: 0.035 + 0.1 * Math.sqrt(v.count / maxMap) }));
        const base = hexToRgb(cssVar(light ? '--bg-2' : '--surface-2'));
        g = createGlobe(canvas, { devicePixelRatio: dpr, width: canvas.width, height: canvas.height, phi, theta: 0.3, dark: light ? 0 : 1, diffuse: light ? 1.2 : 1.6, mapSamples: 22000, mapBrightness: light ? 2.4 : 8, baseColor: light ? base : base.map((c) => c * 1.8 + 0.1), markerColor: hexToRgb(cssVar('--accent')), glowColor: light ? [0.85, 0.82, 1] : hexToRgb(cssVar('--accent-2')).map((c) => c * 0.8), markers, onRender: (s) => { if (drag === null && !matchMedia('(prefers-reduced-motion: reduce)').matches) phi += 0.0045; s.phi = phi + off; } });
        const down = (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
        const move = (e) => { if (drag !== null) { off += (e.clientX - drag) * 0.006; drag = e.clientX; } };
        const up = () => { drag = null; canvas.style.cursor = 'grab'; };
        canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
        canvas._gcCleanup = () => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); };
      } catch (e) { setView('map'); }
    }).catch(() => setView('map'));
    return () => { dead = true; if (g) g.destroy(); if (canvas._gcCleanup) canvas._gcCleanup(); };
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
        ${view === 'globe' ? html`<canvas id="globe" ref=${cv} role="img" aria-label="Globe with markers for visitor countries. The list beside it has the same data."></canvas>` :
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
