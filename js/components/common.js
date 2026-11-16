import { html, useState, useEffect, useRef, useContext, createContext, reducedMotion } from '../ui.js';
import { tweenTo, monotonePath, fmtFull } from '../util.js';

export const Ctx = createContext({});

// Loads one endpoint. Keeps the previous answer on screen while the next one loads, so cards do not jump.
export function useApi(api, endpoint, { ttl = 60_000, enabled = true } = {}) {
  const ctx = useContext(Ctx);
  const [s, setS] = useState({ data: null, error: null, loading: enabled, stale: false });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled || !endpoint) return;
    let dead = false;
    setS((p) => ({ ...p, loading: true, error: null }));
    api.get(endpoint, { ttl, force: n > 0, onStale: (d) => { if (!dead) setS({ data: d, error: null, loading: true, stale: true }); } })
      .then((d) => { if (!dead) setS({ data: d, error: null, loading: false, stale: false }); })
      .catch((e) => { if (dead) return; if (e.kind === 'auth' && ctx.onAuthError) ctx.onAuthError(e); setS((p) => ({ ...p, error: e, loading: false })); });
    return () => { dead = true; };
  }, [api, endpoint, enabled, n, ttl]);
  return { ...s, retry: () => setN((x) => x + 1) };
}

// A number that springs to its target. instant skips the spring (used while the pointer scrubs the chart).
// One ticker should stay mounted, so a change of target animates from where it is now, never from zero.
export function useTicker(target, { instant = false } = {}) {
  const cur = useRef(0);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === null || target === undefined) return;
    if (instant || reducedMotion()) { cur.current = target; setV(target); return; }
    return tweenTo(cur.current, target, (x) => { cur.current = x; setV(x); }, 320);
  }, [target, instant]);
  return target === null || target === undefined ? null : v;
}
export const Num = ({ value }) => { const v = useTicker(value); return html`<span class="num">${v === null ? '-' : fmtFull(v)}</span>`; };

export function Skeleton({ h = 16, w = '100%', r }) { return html`<div class="skeleton" style=${{ height: h + 'px', width: w, borderRadius: r }} aria-hidden="true"></div>`; }
export const SkeletonRows = ({ n = 5 }) => html`<div aria-busy="true" role="status"><span class="sr">Loading</span>${Array.from({ length: n }, (_, i) => html`<div style="padding:9px 8px"><${Skeleton} h=${12} w=${70 - i * 6 + '%'} /><div style="height:8px"></div><${Skeleton} h=${4} /></div>`)}</div>`;

export function ErrorBox({ error, retry }) {
  return html`<div class="err" role="alert">${error && error.message ? error.message : 'Something went wrong.'}${retry ? html`<div><button type="button" onClick=${retry}>Try again</button></div>` : null}</div>`;
}

export function Sparkline({ values, w = 96, h = 26, label }) {
  const max = Math.max(1, ...values), n = values.length;
  if (n < 2) return null;
  const pts = values.map((v, i) => [2 + (i * (w - 4)) / (n - 1), h - 3 - (v / max) * (h - 6)]);
  const last = pts[n - 1];
  return html`<svg class="spark" viewBox=${`0 0 ${w} ${h}`} width=${w} height=${h} role="img" aria-label=${label || 'trend'}>
    <path d=${monotonePath(pts)} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
    <circle cx=${last[0]} cy=${last[1]} r="2.4" fill="currentColor"/></svg>`;
}

export const Delta = ({ pct }) => (pct === null || !Number.isFinite(pct) ? null : html`<span class=${'delta ' + (pct >= 0 ? 'up' : 'down')}>${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%</span>`);
