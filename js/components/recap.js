import { html, useState, useEffect, useRef } from '../ui.js';
import { cssVar } from '../fx.js';
import { q } from '../api.js';
import { monotonePath, fmtFull, hourLabel } from '../util.js';
import { flagFor } from '../countries.js';

const W = 1080, H = 1350;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// Embed the fonts so the exported image does not fall back to a system font.
const fontCache = {};
async function fontCss(look) {
  if (fontCache[look]) return fontCache[look];
  const files = look === 'nova' ? [['Space Grotesk', 'space-grotesk-latin.woff2', '300 700'], ['JetBrains Mono', 'jetbrains-mono-latin.woff2', '100 800']] : [['Inter', 'inter-latin.woff2', '100 900'], ['JetBrains Mono', 'jetbrains-mono-latin.woff2', '100 800']];
  let css = '';
  for (const [fam, file, wt] of files) {
    try {
      const buf = await (await fetch('fonts/' + file)).arrayBuffer();
      let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      css += `@font-face{font-family:"${fam}";src:url(data:font/woff2;base64,${btoa(bin)}) format("woff2");font-weight:${wt};}`;
    } catch (e) { /* the system font is used instead */ }
  }
  return (fontCache[look] = css);
}

function recapSVG(d, fonts, look) {
  const c = (n) => cssVar(n) || '#888';
  const bg = c('--bg'), text = c('--text'), t2 = c('--text-2'), t3 = c('--text-3'), a = c('--line-a'), b = c('--line-b'), up = c('--up'), down = c('--down'), hot = c('--hot'), acc = c('--accent');
  const sans = look === 'nova' ? 'Space Grotesk' : 'Inter';
  const vals = d.vals, max = Math.max(1, ...vals), x0 = 80, x1 = W - 80, y0 = 700, y1 = 960;
  const pts = vals.map((v, i) => [x0 + (i * (x1 - x0)) / Math.max(1, vals.length - 1), y1 - (v / max) * (y1 - y0)]);
  const line = monotonePath(pts), area = pts.length ? `${line}L${x1},${y1}L${x0},${y1}Z` : '';
  const row = (x, y, label, value, sub) => `<text x="${x}" y="${y}" font-family="JetBrains Mono" font-size="22" letter-spacing="3" fill="${t3}">${esc(label.toUpperCase())}</text><text x="${x}" y="${y + 50}" font-family="${sans}" font-size="38" font-weight="600" fill="${text}">${esc(cut(value, 18))}</text>${sub ? `<text x="${x}" y="${y + 88}" font-family="JetBrains Mono" font-size="24" fill="${t2}">${esc(sub)}</text>` : ''}`;
  const rows = [];
  if (d.topPage && d.topPage.count >= 5) rows.push(['Top page', d.topPage.path, `${fmtFull(d.topPage.count)} visitors`]);
  if (d.topRef && d.topRef.count >= 5) rows.push(['Top referrer', d.topRef.name, `${fmtFull(d.topRef.count)} visitors`]);
  if (d.topCountry && d.topCountry.count >= 5) rows.push(['Top country', `${flagFor(d.topCountry.name)} ${d.topCountry.name}`, `${fmtFull(d.topCountry.count)} visitors`]);
  if (d.hour !== null) rows.push(['Busiest hour', hourLabel(d.hour), 'site time zone']);
  if (d.best && d.best.v >= 5) rows.push(['Best day', d.best.label, `${fmtFull(d.best.v)} visitors`]);
  const grid = rows.slice(0, 4).map((r, i) => row(80 + (i % 2) * 500, 1030 + Math.floor(i / 2) * 135, ...r)).join('');
  const delta = d.pct === null ? '' : `<text x="${W - 80}" y="590" text-anchor="end" font-family="JetBrains Mono" font-size="40" fill="${d.pct >= 0 ? up : down}">${d.pct >= 0 ? '▲' : '▼'} ${Math.abs(d.pct).toFixed(Math.abs(d.pct) < 10 ? 1 : 0)}%</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${fonts}</style>
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
  <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}" stop-opacity=".35"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient>
  <radialGradient id="r1" cx="85%" cy="6%" r="70%"><stop offset="0" stop-color="${acc}" stop-opacity=".38"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></radialGradient>
  <radialGradient id="r2" cx="6%" cy="96%" r="75%"><stop offset="0" stop-color="${hot}" stop-opacity=".26"/><stop offset="1" stop-color="${hot}" stop-opacity="0"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="${bg}"/><rect width="${W}" height="${H}" fill="url(#r1)"/><rect width="${W}" height="${H}" fill="url(#r2)"/>
  <text x="80" y="140" font-size="64">🐐</text><text x="170" y="136" font-family="JetBrains Mono" font-size="28" fill="${t2}">${esc(cut(d.site, 34))}</text>
  <text x="80" y="290" font-family="JetBrains Mono" font-size="26" letter-spacing="4" fill="${t3}">${esc(d.range.toUpperCase())}</text>
  <text x="68" y="520" font-family="${sans}" font-size="250" font-weight="600" letter-spacing="-8" fill="url(#g)">${esc(fmtFull(d.cur))}</text>
  <text x="80" y="590" font-family="${sans}" font-size="46" fill="${t2}">visitors</text>${delta}
  <path d="${area}" fill="url(#f)"/><path d="${line}" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  ${grid}
  <text x="80" y="1312" font-family="JetBrains Mono" font-size="22" fill="${t3}">GoatCounter Dashboard · ${esc(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }))}</text></svg>`;
}

async function toPng(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(img, 0, 0, W, H);
    return await new Promise((res) => cv.toBlob(res, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export function RecapDialog({ open, onClose, api, range, info, look }) {
  const dlg = useRef(null);
  const [svg, setSvg] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const d = dlg.current; if (!d) return;
    if (!open) { if (d.open) d.close(); return; }
    if (!d.open) d.showModal();
    let dead = false; setSvg(''); setMsg('');
    (async () => {
      let topCountry = null;
      try { const r = await api.get(`/api/v0/stats/locations?${q({ start: range.start, end: range.end, limit: 5 })}`, { ttl: 60_000 }); const t = ((r && r.stats) || []).filter((x) => x.name)[0]; if (t) topCountry = { name: t.name, count: t.count }; } catch (e) { /* the card just omits the country */ }
      const fonts = await fontCss(look);
      if (!dead) setSvg(recapSVG({ ...info, topCountry }, fonts, look));
    })();
    return () => { dead = true; };
  }, [open]);
  const url = svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) : '';
  const save = async () => { setBusy(true); try { const blob = await toPng(svg); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `goatcounter-recap-${range.to}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch (e) { setMsg('Could not create the image in this browser.'); } setBusy(false); };
  const share = async () => { setBusy(true); try { const blob = await toPng(svg); const file = new File([blob], `goatcounter-recap-${range.to}.png`, { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'My traffic recap' }); else setMsg('Sharing is not available here. Use Download instead.'); } catch (e) { /* cancelled */ } setBusy(false); };
  return html`<dialog ref=${dlg} class="recap" aria-label="Share a recap" onClose=${onClose} onCancel=${onClose} onClick=${(e) => { if (e.target === dlg.current) onClose(); }}>
    ${open ? html`<div class="recap-in">
      <div class="recap-h"><h2>Share a recap</h2><button type="button" class="iconbtn" aria-label="Close" onClick=${onClose}>✕</button></div>
      <div class="recap-prev">${url ? html`<img src=${url} alt=${`Recap card: ${fmtFull(info.cur)} visitors, ${info.range}`} />` : html`<div class="skeleton" style="aspect-ratio:4/5"></div>`}</div>
      <p class="note">Counts under 5 are left out so small numbers stay private. Everything is made in your browser.</p>
      <div class="btns"><button type="button" class="btn primary" disabled=${!svg || busy} onClick=${save}>Download PNG</button>${navigator.share ? html`<button type="button" class="btn" disabled=${!svg || busy} onClick=${share}>Share</button>` : null}</div>
      <div class="sky-note" aria-live="polite">${msg}</div>
    </div>` : null}</dialog>`;
}
