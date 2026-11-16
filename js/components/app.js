import { html, useState, useEffect, useMemo, useRef, Fragment } from '../ui.js';
import { API, q, ttlFor } from '../api.js';
import { Ctx, useApi, useTicker, Skeleton, Delta } from './common.js';
import { HeroChart } from './hero.js';
import { RankCard, TopPages, StatStrip, CountriesCard, schemeLabel } from './cards.js';
import { ConnectScreen } from './connect.js';
import { BreakdownCard } from './breakdown.js';
import { TimePatterns } from './skyline.js';
import { PRESETS, makeRange, labelDay, validTZ, browserTZ, fmtFull, fmtNum, relativeTime } from '../util.js';
import { buildSeries, completed, sum, findSpikes, buildInsights } from '../model.js';

const CFG_KEY = 'gc-dashboard-config-v1', THEME_KEY = 'gc-dashboard-theme-v1', RANGE_KEY = 'gc-dashboard-range-v2', LOOK_KEY = 'gc-dashboard-look-v1';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function warm(api) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { return await api.get('/api/v0/me', { force: true }); } catch (e) { last = e; if (e.kind === 'auth' || e.kind === 'notfound') throw e; await sleep(600); }
  }
  throw last;
}

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const toggle = (origin) => {
    const next = theme === 'dark' ? 'light' : 'dark';
    const swap = () => { document.documentElement.dataset.theme = next; write(THEME_KEY, next); setTheme(next); };
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return swap();
    const x = origin ? origin.x : innerWidth - 40, y = origin ? origin.y : 40;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(swap);
    vt.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
  };
  return [theme, toggle];
}

// Two looks share one engine: Nova (the new design) and Classic (the original). Switching loads the other stylesheet first.
function useLook() {
  const [look, setLook] = useState(() => document.documentElement.dataset.look || 'nova');
  const choose = async (next) => {
    if (next === look) return;
    if (!document.getElementById('look-css-' + next)) {
      await new Promise((res) => { const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `css/${next}.css`, id: 'look-css-' + next }); l.onload = l.onerror = res; document.head.append(l); });
    }
    const swap = () => { document.documentElement.dataset.look = next; write(LOOK_KEY, next); setLook(next); };
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return swap();
    document.startViewTransition(swap);
  };
  return [look, choose];
}

export function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(!!read(CFG_KEY));
  const [initialError, setInitialError] = useState('');
  const [theme, toggleTheme] = useTheme();
  const [look, chooseLook] = useLook();

  useEffect(() => {
    const raw = read(CFG_KEY);
    if (!raw) return;
    let cfg; try { cfg = JSON.parse(raw); } catch { write(CFG_KEY, null); setBooting(false); return; }
    const api = new API(cfg.baseURL, cfg.apiKey);
    warm(api).then((me) => { api.tz = validTZ((me && me.user && me.user.settings && me.user.settings.timezone) || browserTZ()); setSession({ api, demo: false }); })
      .catch((e) => { if (e.kind === 'auth') write(CFG_KEY, null); setInitialError(e.message || 'Could not reconnect.'); })
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => { const f = (e) => { if (e.persisted) location.reload(); }; addEventListener('pageshow', f); return () => removeEventListener('pageshow', f); }, []);

  const connect = async (baseURL, apiKey) => {
    const api = new API(baseURL, apiKey);
    const me = await warm(api);
    api.tz = validTZ((me && me.user && me.user.settings && me.user.settings.timezone) || browserTZ());
    write(CFG_KEY, JSON.stringify({ baseURL, apiKey }));
    setSession({ api, demo: false });
  };
  const demo = async () => { const { createDemo } = await import('../demo.js'); setSession({ api: createDemo(), demo: true }); };
  const disconnect = () => { if (session) session.api.clearCache(); write(CFG_KEY, null); setSession(null); setInitialError(''); };
  const onAuthError = (e) => { disconnect(); setInitialError(e.message); };

  if (booting) return html`<div class="connect" aria-busy="true"><div class="card"><${Skeleton} h=${28} w="60%" /><div style="height:14px"></div><${Skeleton} h=${14} /><div style="height:10px"></div><${Skeleton} h=${14} w="80%" /></div></div>`;
  if (!session) return html`<${ConnectScreen} onConnect=${connect} onDemo=${demo} initialError=${initialError} />`;
  return html`<${Ctx.Provider} value=${{ onAuthError, look }}><${Dashboard} key=${session.demo ? 'demo' : session.api.baseURL} api=${session.api} demo=${session.demo} theme=${theme} look=${look} onLook=${chooseLook} onTheme=${toggleTheme} onDisconnect=${disconnect} /><//>`;
}

function Dashboard({ api, demo, theme, look, onLook, onTheme, onDisconnect }) {
  const tz = api.tz || browserTZ();
  const now = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState(() => (read(RANGE_KEY) && PRESETS.some((p) => p[0] === read(RANGE_KEY)) ? read(RANGE_KEY) : '30d'));
  const [custom, setCustom] = useState(null);
  const [hover, setHover] = useState(null);
  const range = useMemo(() => makeRange(preset, tz, custom, now), [preset, tz, custom, now]);
  const ttl = ttlFor(range);
  const choose = (p) => { setCustom(null); setPreset(p); setHover(null); if (p !== 'custom') write(RANGE_KEY, p); };
  const zoomDay = (day) => { setCustom({ start: day, end: day }); setPreset('custom'); setHover(null); };

  const E = (path, r, extra = {}) => `/api/v0/stats/${path}?${q({ start: r.start, end: r.end, ...extra })}`;
  const total = useApi(api, E('total', range), { ttl });
  const prevTotal = useApi(api, E('total', range.prev), { ttl: 6 * 3600_000 });
  const hits = useApi(api, E('hits', range, { limit: 20 }), { ttl });
  const refs = useApi(api, E('toprefs', range, { limit: 12 }), { ttl });

  const series = useMemo(() => (total.data ? buildSeries(total.data, range, now, tz) : []), [total.data, range, now, tz]);
  const prevSeries = useMemo(() => (prevTotal.data ? buildSeries(prevTotal.data, { ...range, from: range.prev.from, to: range.prev.to, live: false }, now, tz) : []), [prevTotal.data, range, now, tz]);
  const hasPrev = prevSeries.length > 0 && prevSeries.filter((p) => p.v > 0).length >= prevSeries.length * 0.6; // too little earlier data makes a comparison meaningless
  const spikes = useMemo(() => (range.hourly ? [] : findSpikes(series)), [series, range]);
  const cur = total.data ? total.data.total : null;
  const prev = prevTotal.data ? prevTotal.data.total : null;
  const done = completed(series);
  const avg = series.length && total.data ? (done.length ? sum(done) / done.length : sum(series)) : null;
  const avgPrev = prevSeries.length ? sum(prevSeries) / prevSeries.length : null;
  const peak = done.length ? done.reduce((a, p) => (p.v > a.v ? p : a), done[0]) : null;
  const topPage = hits.data && hits.data.hits && hits.data.hits[0] ? hits.data.hits[0] : null;
  const refRows = refs.data && refs.data.stats ? refs.data.stats.filter((r) => r.name) : null;
  const topRef = refRows ? (refRows[0] || false) : null;
  const insights = useMemo(() => (total.data && prevTotal.data ? buildInsights({ total: total.data, series, prevSeries, prevTotal: hasPrev ? prev : 0, range, hits: hits.data && hits.data.hits, now, tz }) : null), [total.data, prevTotal.data, hits.data, series]);
  const hp = hover !== null ? series[hover] : null;
  const bigValue = useTicker(hp ? hp.v || 0 : cur, { instant: !!hp });
  const pct = hasPrev && prev > 0 && cur !== null ? ((cur - prev) / prev) * 100 : null;
  const rangeLabel = range.days === 1 ? labelDay(range.from, true) : `${labelDay(range.from)} to ${labelDay(range.to, true)}`;
  const updated = relativeTime(Date.now());
  void updated;
  const siteName = demo ? 'Demo site' : api.baseURL.replace(/^https?:\/\//, '');

  return html`<div>
    ${demo ? html`<aside class="banner" aria-label="Demo notice"><span><b>Demo data.</b> A seeded sample site, so you can explore every view without an account.</span><button type="button" onClick=${onDisconnect}>Exit demo</button></aside>` : null}
    <header class="topbar">
      <div class="brand"><div class="mark" aria-hidden="true">🐐</div><div style="min-width:0"><h1>GoatCounter Dashboard</h1><p>${siteName} · ${tz.replace('_', ' ')}</p></div></div>
      <div class="tools">
        <div class="pills" role="group" aria-label="Date range">${PRESETS.map(([k, l]) => html`<button key=${k} type="button" class="pill" aria-pressed=${String(preset === k)} onClick=${() => choose(k)}>${l}</button>`)}<button type="button" class="pill" aria-pressed=${String(preset === 'custom')} onClick=${() => { if (preset !== 'custom') { setCustom({ start: range.from, end: range.to }); setPreset('custom'); } }}>Custom</button></div>
        ${preset === 'custom' && custom ? html`<div class="custom"><input type="date" aria-label="Start date" value=${custom.start} max=${range.today} onChange=${(e) => e.target.value && setCustom({ start: e.target.value, end: custom.end < e.target.value ? e.target.value : custom.end })} /><input type="date" aria-label="End date" value=${custom.end} max=${range.today} onChange=${(e) => e.target.value && setCustom({ start: custom.start > e.target.value ? e.target.value : custom.start, end: e.target.value })} /></div>` : null}
        <div class="looksw" role="group" aria-label="Design"><button type="button" aria-pressed=${String(look === 'nova')} onClick=${() => onLook('nova')}>Nova</button><button type="button" aria-pressed=${String(look === 'classic')} onClick=${() => onLook('classic')}>Classic</button></div>
        <button type="button" class="iconbtn" aria-label=${theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick=${(e) => { const r = e.currentTarget.getBoundingClientRect(); onTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}>
          ${theme === 'dark' ? html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>` : html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`}</button>
        ${demo ? null : html`<button type="button" class="iconbtn" aria-label="Disconnect" title="Disconnect" onClick=${onDisconnect}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg></button>`}
      </div>
    </header>

    <main>
      <section class="card hero" aria-label="Visitors over time">
        <div class="hero-top">
          <div>
            <div class="eyebrow">${hp ? hp.long : rangeLabel}</div>
            <div class="big">
              <span class="num">${bigValue === null ? '-' : fmtFull(bigValue)}</span>
              <span class="unit">visitors</span>
              ${hp ? null : html`<${Delta} pct=${pct} />`}
            </div>
          </div>
          <div class="legend" aria-hidden="true"><span><i></i>This period</span><span><i class="g"></i>Previous</span></div>
        </div>
        ${total.error ? html`<div class="err" role="alert" style="margin-top:14px">${total.error.message}<div><button type="button" onClick=${total.retry}>Try again</button></div></div>` :
          html`<div style=${{ opacity: total.loading && !total.stale && series.length ? 0.55 : 1, transition: 'opacity .2s' }}>${series.length ? html`<${HeroChart} series=${series} prev=${hasPrev ? prevSeries : []} spikes=${spikes} hover=${hover} onHover=${setHover} onZoom=${zoomDay} rangeKey=${range.key} hourly=${range.hourly} />` : html`<div style="height:320px;margin-top:14px"><${Skeleton} h=${320} r="12px" /></div>`}</div>`}
        ${insights && insights.length ? html`<div class="insights" aria-label="Highlights">${insights.map((s, i) => html`<div key=${s.k} class=${'insight ' + (s.tone || '')} style=${{ animationDelay: i * 60 + 'ms' }}><b>${s.text}</b><span>${s.detail}</span></div>`)}</div>` : null}
      </section>

      <${StatStrip} cur=${cur} prev=${hasPrev ? prev : null} avg=${avg} avgPrev=${hasPrev ? avgPrev : null} peak=${peak} topPage=${topPage} topRef=${topRef} series=${series} hourly=${range.hourly} look=${look} />

      <div class="grid">
        <${TopPages} api=${api} range=${range} hits=${hits} now=${now} />
        <${RankCard} api=${api} span="span-5" title="Referrers" sub="Where visitors arrive from" endpoint=${E('toprefs', range, { limit: 50 })} ttl=${ttl} show=${8} drill=${(r) => r.id && '/api/v0/stats/toprefs/' + encodeURIComponent(r.id) + '?' + q({ start: range.start, end: range.end, limit: 10 })} tag=${(r) => (r.name ? schemeLabel(r.ref_scheme) : '')} empty="No referrers yet. Direct visits are not listed." />
        <${CountriesCard} api=${api} range=${range} ttl=${ttl} look=${look} theme=${theme} />
        <${TimePatterns} api=${api} tz=${tz} look=${look} theme=${theme} now=${now} />
        <${BreakdownCard} api=${api} title="Browsers" sub="Click a browser for versions" kind="browser" endpoint=${E('browsers', range, { limit: 20 })} ttl=${ttl} drill=${(r) => r.id && '/api/v0/stats/browsers/' + encodeURIComponent(r.id) + '?' + q({ start: range.start, end: range.end, limit: 10 })} />
        <${BreakdownCard} api=${api} title="Operating systems" sub="Click a system for versions" kind="os" endpoint=${E('systems', range, { limit: 20 })} ttl=${ttl} drill=${(r) => r.id && '/api/v0/stats/systems/' + encodeURIComponent(r.id) + '?' + q({ start: range.start, end: range.end, limit: 10 })} />
        <${BreakdownCard} api=${api} title="Devices" sub="By screen size" kind="device" endpoint=${E('sizes', range, { limit: 20 })} ttl=${ttl} />
        <${RankCard} api=${api} span="span-12" title="Languages" endpoint=${E('languages', range, { limit: 50 })} ttl=${ttl} show=${8} />
        <${RankCard} api=${api} span="span-12" hideEmpty=${true} title="Campaigns" sub="Visits tagged with a campaign parameter" endpoint=${E('campaigns', range, { limit: 20 })} ttl=${ttl} show=${6} drill=${(r) => r.id && '/api/v0/stats/campaigns/' + encodeURIComponent(r.id) + '?' + q({ start: range.start, end: range.end, limit: 10 })} empty="No tagged campaigns in this range." />
      </div>
    </main>
    <footer class="foot"><p>Counts are visitors, as GoatCounter reports them. Days and hours use the site's time zone.<br/>Browser and system logos are trademarks of their owners, shown to identify the software only.</p></footer>
  </div>`;
}
