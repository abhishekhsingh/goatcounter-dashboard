import { html, useState, useEffect, useRef, useMemo, useInView } from '../ui.js';
import { useApi, Skeleton, ErrorBox } from './common.js';
import { q } from '../api.js';
import { fmtFull, fmtNum } from '../util.js';

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

// Where each top referrer sends its visitors. Sources are traced one at a time to respect the API rate limit.
export function SankeyCard({ api, range, ttl }) {
  const [ref, seen] = useInView();
  const box = useRef(null);
  const [w, setW] = useState(900);
  const [flows, setFlows] = useState(null);
  const [hot, setHot] = useState(null);
  const [note, setNote] = useState('');
  const refs = useApi(api, `/api/v0/stats/toprefs?${q({ start: range.start, end: range.end, limit: 50 })}`, { ttl, enabled: seen });

  useEffect(() => {
    if (!refs.data) return;
    const sources = (refs.data.stats || []).filter((r) => r.name && r.id).slice(0, 6);
    if (!sources.length) { setFlows({ links: [], done: 0, total: 0 }); return; }
    let dead = false; const links = [];
    setFlows({ links: [], done: 0, total: sources.length });
    (async () => {
      for (let i = 0; i < sources.length; i++) {
        try {
          const r = await api.get(`/api/v0/stats/toprefs/${encodeURIComponent(sources[i].id)}?${q({ start: range.start, end: range.end, limit: 10 })}`, { ttl });
          for (const p of (r && r.stats) || []) if (p.count > 0 && (p.name || p.id)) links.push({ src: sources[i].name, srcIdx: i, page: p.name || String(p.id), count: p.count });
        } catch (e) { /* a failed source is simply left out */ }
        if (dead) return;
        setFlows({ links: [...links], done: i + 1, total: sources.length });
      }
    })();
    return () => { dead = true; };
  }, [refs.data, range.key]);

  useEffect(() => {
    if (!box.current) return;
    let raf = 0; const ro = new ResizeObserver((es) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setW(Math.max(300, Math.round(es[0].contentRect.width)))); });
    ro.observe(box.current);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [flows && flows.links.length > 0]);

  const small = w < 600;
  const g = useMemo(() => {
    if (!flows || !flows.links.length) return null;
    const maxSrc = small ? 4 : 6, maxPages = small ? 5 : 8;
    const srcTot = new Map(), pageTot = new Map();
    for (const l of flows.links) { srcTot.set(l.src, (srcTot.get(l.src) || 0) + l.count); pageTot.set(l.page, (pageTot.get(l.page) || 0) + l.count); }
    const srcs = [...srcTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxSrc).map(([name]) => name);
    const pages = [...pageTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxPages).map(([name]) => name);
    const L = flows.links.filter((l) => srcs.includes(l.src) && pages.includes(l.page));
    const sTot = srcs.map((s) => L.filter((l) => l.src === s).reduce((a, l) => a + l.count, 0)), pTot = pages.map((p) => L.filter((l) => l.page === p).reduce((a, l) => a + l.count, 0));
    const padN = 12, H = Math.max(250, Math.max(srcs.length, pages.length) * 38);
    const unit = Math.min((H - padN * (srcs.length - 1)) / sTot.reduce((a, b) => a + b, 0), (H - padN * (pages.length - 1)) / pTot.reduce((a, b) => a + b, 0));
    const lx = small ? 98 : 150, rx = w - (small ? 104 : 230), nw = 12;
    let y = 0; const sN = srcs.map((name, i) => { const h = sTot[i] * unit, n = { name, y, h, off: 0, i, total: sTot[i] }; y += h + padN; return n; });
    y = 0; const pN = pages.map((name, i) => { const h = pTot[i] * unit, n = { name, y, h, off: 0 }; y += h + padN; return n; });
    const ribbons = [];
    for (const s of sN) for (const p of pN) { const l = L.find((x) => x.src === s.name && x.page === p.name); if (!l) continue; const h = l.count * unit, y0 = s.y + s.off, y1 = p.y + p.off; s.off += h; p.off += h; const xm = (lx + nw + rx) / 2; ribbons.push({ key: s.name + '>' + p.name, src: s, page: p, count: l.count, d: `M${lx + nw},${y0}C${xm},${y0} ${xm},${y1} ${rx},${y1}L${rx},${y1 + h}C${xm},${y1 + h} ${xm},${y0 + h} ${lx + nw},${y0 + h}Z` }); }
    return { sN, pN, ribbons, H, lx, rx, nw, total: L.reduce((a, l) => a + l.count, 0) };
  }, [flows, w, small]);

  const loading = flows && flows.done < flows.total;
  return html`<section class="card span-12" ref=${ref} aria-label="Where traffic goes">
    <div class="card-h"><div><h2>Where visitors go next</h2><p class="sub">From your biggest referrers to the pages they land on${loading ? ` · tracing source ${flows.done + 1} of ${flows.total}` : ''}</p></div></div>
    ${refs.error ? html`<${ErrorBox} error=${refs.error} retry=${refs.retry} />` : !flows ? html`<${Skeleton} h=${250} r="12px" />` : !g ? (loading ? html`<${Skeleton} h=${250} r="12px" />` : html`<div class="empty">No referrers in this range yet. Direct visits are not traced.</div>`) : html`
    <div ref=${box} class="sankey-wrap" style=${{ opacity: loading ? 0.7 : 1, transition: 'opacity .3s' }}>
      <svg class="sankey" viewBox=${`0 0 ${w} ${g.H + 4}`} width=${w} height=${g.H + 4} role="img" aria-label=${`Flows from ${g.sN.length} referrers to ${g.pN.length} pages. The lists beside the chart hold the same data.`}>
        ${g.ribbons.map((r) => html`<path key=${r.key} class="ribbon" d=${r.d} style=${{ fill: COLORS[r.src.i % 6], opacity: hot === null ? 0.34 : hot === r.key || hot === 's:' + r.src.name || hot === 'p:' + r.page.name ? 0.8 : 0.1 }} onPointerEnter=${() => { setHot(r.key); setNote(`${r.src.name} to ${r.page.name}: ${fmtFull(r.count)} visitors`); }} onPointerLeave=${() => { setHot(null); setNote(''); }}/>`)}
        ${g.sN.map((n) => html`<g key=${'s' + n.name} onPointerEnter=${() => { setHot('s:' + n.name); setNote(`${n.name}: ${fmtFull(n.total)} visitors traced`); }} onPointerLeave=${() => { setHot(null); setNote(''); }}>
          <rect x=${g.lx} y=${n.y} width=${g.nw} height=${Math.max(2, n.h)} rx="3" fill=${COLORS[n.i % 6]}/>
          <text x=${g.lx - 8} y=${n.y + n.h / 2 + 4} text-anchor="end" class="sk-l">${n.name.length > (small ? 12 : 20) ? n.name.slice(0, small ? 11 : 19) + '…' : n.name}</text></g>`)}
        ${g.pN.map((n) => html`<g key=${'p' + n.name} onPointerEnter=${() => { setHot('p:' + n.name); setNote(n.name); }} onPointerLeave=${() => { setHot(null); setNote(''); }}>
          <rect x=${g.rx} y=${n.y} width=${g.nw} height=${Math.max(2, n.h)} rx="3" fill="var(--text-3)"/>
          <text x=${g.rx + g.nw + 8} y=${n.y + n.h / 2 + 4} class="sk-l">${n.name.length > (small ? 14 : 30) ? n.name.slice(0, small ? 13 : 29) + '…' : n.name}</text></g>`)}
      </svg>
    </div>
    <div class="sky-note" aria-live="polite">${note}</div>`}
  </section>`;
}
