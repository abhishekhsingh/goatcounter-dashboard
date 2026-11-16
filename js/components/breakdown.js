import { html, useState, useEffect, useMemo, useInView } from '../ui.js';
import { useApi, Skeleton, ErrorBox } from './common.js';
import { SubRows } from './cards.js';
import { fmtFull, fmtNum } from '../util.js';
import { shareOf } from '../model.js';

const SIZE_NAMES = { phone: 'Phones', tablet: 'Tablets', desktop: 'Laptop and desktop', desktophd: 'HD displays', largerscreen: 'Large screens', unknown: 'Unknown' };
const labelOf = (r, kind) => (kind === 'device' ? SIZE_NAMES[r.id] || r.name || r.id : r.name || (r.id === '' ? '(unknown)' : r.id));

function Chip({ icons, row, kind, color }) {
  let svg = null;
  if (icons) {
    if (kind === 'device') svg = html`<svg class="line" viewBox="0 0 24 24" aria-hidden="true"><path d=${icons.DEVICE[row.id] || icons.DEVICE.unknown} /></svg>`;
    else { const d = icons.BRAND[icons.BRAND_ALIAS[row.name]]; svg = d ? html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${d} /></svg>` : html`<svg class="line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>`; }
  }
  return html`<span class="chip" style=${{ '--c': color }}>${svg}</span>`;
}

// A donut with rounded, gradient segments. Hover a slice or a legend row to read it in the centre.
function Donut({ rows, total, active, setActive, label, uid }) {
  const R = 70, C = 2 * Math.PI * R, gap = rows.length > 1 ? 6 : 0;
  let off = 0;
  return html`<div class="dn" role="img" aria-label=${label}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <defs>${rows.map((r, i) => html`<linearGradient key=${i} id=${`dg-${uid}-${i}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color=${r.color}/><stop offset="1" stop-color=${r.color} style=${{ stopColor: `color-mix(in oklab, ${r.color} var(--seg-mix, 100%), white)` }}/></linearGradient>`)}</defs>
      <g transform="rotate(-90 100 100)">
        <circle cx="100" cy="100" r=${R} fill="none" stroke="var(--hair)" stroke-width="20"/>
        ${rows.map((r, i) => { const len = Math.max(0.5, (r.count / total) * C - gap), o = off; off += (r.count / total) * C; return html`<circle key=${r.key} class=${'seg' + (active === i ? ' on' : '') + (active !== null && active !== i ? ' dim' : '')} cx="100" cy="100" r=${R} fill="none" stroke=${`url(#dg-${uid}-${i})`} stroke-width="20" stroke-linecap="round" stroke-dasharray=${`${len} ${C}`} stroke-dashoffset=${-o} style=${{ '--c': r.color, '--len': len, '--C': C, animation: `dn-grow .9s var(--ease) ${i * 70}ms backwards` }} onPointerEnter=${() => setActive(i)} onPointerLeave=${() => setActive(null)}/>`; })}
      </g>
    </svg>
    <div class="ctr" aria-hidden="true">${active === null ? html`<b>${fmtNum(total)}</b><span>visitors</span>` : html`<b>${shareOf(rows[active].count, total).toFixed(1)}%</b><span>${rows[active].label}</span>`}</div>
  </div>`;
}

let uidN = 0;
export function BreakdownCard({ api, title, sub, endpoint, ttl, kind, drill, span = 'span-4' }) {
  const [ref, seen] = useInView();
  const [icons, setIcons] = useState(null);
  const [active, setActive] = useState(null);
  const [open, setOpen] = useState(null);
  const uid = useMemo(() => ++uidN, []);
  useEffect(() => { if (seen) import('../icons.js').then(setIcons).catch(() => {}); }, [seen]);
  const { data, error, retry } = useApi(api, endpoint, { ttl, enabled: seen });
  const rows = useMemo(() => {
    const raw = ((data && data.stats) || []).filter((r) => r.count > 0);
    const top = raw.slice(0, 5).map((r, i) => ({ ...r, label: labelOf(r, kind), color: `var(--c${i + 1})`, key: (r.id || r.name) + ':' + i }));
    const rest = raw.slice(5).reduce((a, r) => a + r.count, 0);
    if (rest > 0) top.push({ id: '__other', name: 'Other', count: rest, label: 'Other', color: 'var(--c7)', key: 'other' });
    return top;
  }, [data, kind]);
  const total = rows.reduce((a, r) => a + r.count, 0);
  return html`<section class=${'card ' + span} ref=${ref} aria-label=${title}>
    <div class="card-h"><div><h2>${title}</h2>${sub ? html`<p class="sub">${sub}</p>` : null}</div></div>
    ${error ? html`<${ErrorBox} error=${error} retry=${retry} />` : !data ? html`<div class="dn"><${Skeleton} h=${190} r="50%" /></div>` : !rows.length ? html`<div class="empty">No data in this range.</div>` : html`
      <${Donut} rows=${rows} total=${total} active=${active} setActive=${setActive} label=${`${title} breakdown`} uid=${uid} />
      <ul class="rows lg">${rows.map((r, i) => { const can = drill && r.id !== '__other' && drill(r), isOpen = open === r.key;
        return html`<li key=${r.key} onPointerEnter=${() => setActive(i)} onPointerLeave=${() => setActive(null)}>
          <button class="row-btn" type="button" aria-expanded=${can ? String(isOpen) : undefined} onClick=${() => can && setOpen(isOpen ? null : r.key)} style=${{ cursor: can ? 'pointer' : 'default' }}>
            <div class="row"><${Chip} icons=${icons} row=${r} kind=${kind} color=${r.color} /><span class="name">${r.label}</span><span class="cnt">${fmtNum(r.count)}</span><span class="pct">${shareOf(r.count, total).toFixed(1)}%</span></div>
          </button>
          ${isOpen && can ? html`<${SubRows} api=${api} endpoint=${can} ttl=${ttl} total=${r.count} />` : null}
        </li>`; })}</ul>`}
  </section>`;
}
