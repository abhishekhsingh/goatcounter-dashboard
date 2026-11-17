import { html, useState, useEffect, useMemo, useRef, useContext, Fragment } from '../ui.js';
import { API, q, ttlFor, narrow, listSites } from '../api.js';
import { Ctx, useApi, useTicker, Skeleton, Delta } from './common.js';
import { HeroChart } from './hero.js';
import { RankCard, TopPages, StatStrip, CountriesCard, schemeLabel } from './cards.js';
import { ConnectScreen } from './connect.js';
import { BreakdownCard } from './breakdown.js';
import { TimePatterns } from './skyline.js';
import { YearCard } from './year.js';
import { SankeyCard } from './sankey.js';
import { Palette, useShortcuts } from './palette.js';
import { RecapDialog } from './recap.js';
import { SectionRail, Anchor } from './rail.js';
import { PRESETS, makeRange, labelDay, validTZ, browserTZ, fmtFull, fmtNum, relativeTime } from '../util.js';
import { buildSeries, completed, sum, findSpikes, buildInsights } from '../model.js';

const CFG_KEY = 'gc-dashboard-config-v1', RANGE_KEY = 'gc-dashboard-range-v2', SITE_KEY = 'gc-dashboard-site-v1';
const tzOf = (me) => validTZ((me && me.user && me.user.settings && me.user.settings.timezone) || browserTZ());
const savePref = () => { if (window.gcPref) window.gcPref.save(); };
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
    const swap = () => { document.documentElement.dataset.theme = next; savePref(); setTheme(next); };
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
    const swap = () => { document.documentElement.dataset.look = next; savePref(); setLook(next); };
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return swap();
    document.startViewTransition(swap);
  };
  return [look, choose];
}

export function App() {
  const [session, setSession] = useState(null); // { api (the open site), sites, key, demo, listed }
  const [booting, setBooting] = useState(!!read(CFG_KEY));
  const [initialError, setInitialError] = useState('');
  const [switching, setSwitching] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [look, chooseLook] = useLook();
  const pool = useRef(new Map()); // one client per site address
  const kit = useRef(null);       // the demo's sites

  // A ready client for a site: the demo builds one, a real site is asked who it is (its time zone) once.
  const open = async (site, key) => {
    if (kit.current) return kit.current.open(site.url);
    let a = pool.current.get(site.url);
    if (!a) { a = new API(site.url, key); a.tz = tzOf(await warm(a)); pool.current.set(site.url, a); }
    return a;
  };

  useEffect(() => {
    const raw = read(CFG_KEY);
    if (!raw) return;
    let cfg; try { cfg = JSON.parse(raw); } catch { write(CFG_KEY, null); setBooting(false); return; }
    const api = new API(cfg.baseURL, cfg.apiKey);
    warm(api).then(async (me) => {
      api.tz = tzOf(me); pool.current.set(api.baseURL, api);
      let cur = api, sites = [{ id: 0, name: api.baseURL.replace(/^https?:\/\//, ''), url: api.baseURL }], listed = false;
      const want = read(SITE_KEY);
      if (want && want !== api.baseURL) { // another site was open last time: find it before the first screen
        sites = await listSites(api); listed = true;
        const hit = sites.find((x) => x.url === want);
        if (hit) { try { cur = await open(hit, cfg.apiKey); } catch { /* stay on the site the key was made for */ } }
      }
      setSession({ api: cur, demo: false, sites, key: cfg.apiKey, listed });
    })
      .catch((e) => { if (e.kind === 'auth') write(CFG_KEY, null); setInitialError(e.message || 'Could not reconnect.'); })
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => { const f = (e) => { if (e.persisted) location.reload(); }; addEventListener('pageshow', f); return () => removeEventListener('pageshow', f); }, []);

  // Look up the account's other sites once the first screen has had the queue to itself.
  useEffect(() => {
    if (!session || session.demo || session.listed) return;
    let dead = false;
    const t = setTimeout(async () => { const sites = await listSites(session.api); if (!dead) setSession((p) => (p ? { ...p, sites, listed: true } : p)); }, 1800);
    return () => { dead = true; clearTimeout(t); };
  }, [session && session.api, session && session.listed]);

  const connect = async (baseURL, apiKey) => {
    const api = new API(baseURL, apiKey);
    api.tz = tzOf(await warm(api));
    write(CFG_KEY, JSON.stringify({ baseURL, apiKey })); write(SITE_KEY, null);
    pool.current.clear(); pool.current.set(api.baseURL, api);
    setSession({ api, demo: false, sites: [{ id: 0, name: api.baseURL.replace(/^https?:\/\//, ''), url: api.baseURL }], key: apiKey, listed: false });
  };
  const demo = async () => {
    const { createDemoSites } = await import('../demo.js');
    kit.current = createDemoSites();
    setSession({ api: kit.current.open(kit.current.sites[0].url), demo: true, sites: kit.current.sites, key: '', listed: true });
  };
  const switchSite = async (site) => {
    if (!session || site.url === session.api.baseURL) return;
    setSwitching(true);
    try {
      await new Promise((res) => setTimeout(res, 20)); // let the dimmed page paint before a demo site is built
      const api = await open(site, session.key);
      setSession((p) => ({ ...p, api }));
      if (!session.demo) write(SITE_KEY, site.url);
    } finally { setSwitching(false); }
  };
  const disconnect = () => { pool.current.forEach((a) => a.clearCache()); pool.current.clear(); kit.current = null; write(CFG_KEY, null); write(SITE_KEY, null); setSession(null); setInitialError(''); };
  const onAuthError = (e) => { disconnect(); setInitialError(e.message); };

  if (booting) return html`<div class="connect" aria-busy="true"><div class="card"><${Skeleton} h=${28} w="60%" /><div style="height:14px"></div><${Skeleton} h=${14} /><div style="height:10px"></div><${Skeleton} h=${14} w="80%" /></div></div>`;
  if (!session) return html`<${ConnectScreen} onConnect=${connect} onDemo=${demo} initialError=${initialError} />`;
  return html`<${Ctx.Provider} value=${{ onAuthError, look }}><${Dashboard} key=${session.api.baseURL} api=${session.api} demo=${session.demo} sites=${session.sites} onSite=${switchSite} switching=${switching} theme=${theme} look=${look} onLook=${chooseLook} onTheme=${toggleTheme} onDisconnect=${disconnect} /><//>`;
}

function AppearancePanel({ look, onLook }) {
  const [pinned, setPinned] = useState(() => !!(window.gcPref && window.gcPref.pinned()));
  const toggle = () => { if (!window.gcPref) return; window.gcPref.pin(!window.gcPref.pinned()); setPinned(window.gcPref.pinned()); };
  return html`<div id="appearance" popover class="pop" role="dialog" aria-label="Appearance">
    <fieldset><legend>Design</legend>
      ${[['nova', 'Nova', 'Glass, glow and 3D'], ['classic', 'Classic', 'The original, flat and calm']].map(([k, n, d]) => html`<label key=${k} class=${look === k ? 'on' : ''}><input type="radio" name="look" value=${k} checked=${look === k} onChange=${() => onLook(k)} /><span><b>${n}</b><small>${d}</small></span></label>`)}
    </fieldset>
    <button type="button" class="pin" aria-pressed=${String(pinned)} onClick=${toggle} title="Keep this design and mode for your next visit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>
      <span>${pinned ? 'Remembered on this device' : 'Remember my choice'}</span>
    </button>
    <p class="note">Otherwise every new visit opens in Nova dark.</p>
  </div>`;
}

function Dashboard({ api: baseApi, demo, sites = [], onSite, switching, theme, look, onLook, onTheme, onDisconnect }) {
  const tz = baseApi.tz || browserTZ();
  const [pageFilter, setPageFilter] = useState(null); // { id, path }: the whole dashboard narrowed to one page
  const api = useMemo(() => (pageFilter ? narrow(baseApi, [pageFilter.id]) : baseApi), [baseApi, pageFilter]);
  const now = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState(() => (read(RANGE_KEY) && PRESETS.some((p) => p[0] === read(RANGE_KEY)) ? read(RANGE_KEY) : '30d'));
  const [custom, setCustom] = useState(null);
  const [hover, setHover] = useState(null);
  const [palette, setPalette] = useState(false);
  const [recap, setRecap] = useState(false);
  const base = useContext(Ctx);
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(0); // time the refresh started, 0 when idle
  const [toast, setToast] = useState('');
  const [limit, setLimit] = useState(baseApi.blockedUntil > Date.now() ? baseApi.blockedUntil : 0); // when GoatCounter's request cap reopens
  useEffect(() => { baseApi.onLimit = setLimit; return () => { baseApi.onLimit = null; }; }, [baseApi]);
  useEffect(() => { if (!limit) return; const t = setTimeout(() => setLimit(0), Math.max(0, limit - Date.now()) + 500); return () => clearTimeout(t); }, [limit]);
  const [settled, setSettled] = useState(false);
  const [applied, setApplied] = useState(0); // the epoch the cards have started on, so "done" is never read from before they began
  useEffect(() => { setApplied(epoch); }, [epoch]); // the spinner shows for at least 700 ms
  const ctxValue = useMemo(() => ({ ...base, epoch }), [base, epoch]);
  const range = useMemo(() => makeRange(preset, tz, custom, now), [preset, tz, custom, now]);
  const ttl = ttlFor(range);
  const choose = (p) => { setCustom(null); setPreset(p); setHover(null); if (p !== 'custom') write(RANGE_KEY, p); };
  const zoomDay = (day) => { setCustom({ start: day, end: day }); setPreset('custom'); setHover(null); };

  const E = (path, r, extra = {}) => `/api/v0/stats/${path}?${q({ start: r.start, end: r.end, ...extra })}`;
  const total = useApi(api, E('total', range), { ttl, epoch });
  const prevTotal = useApi(api, E('total', range.prev), { ttl: 6 * 3600_000, epoch });
  const hits = useApi(api, E('hits', range, { limit: 20 }), { ttl, epoch });
  const refs = useApi(api, E('toprefs', range, { limit: 12 }), { ttl, epoch });

  const refresh = async () => {
    if (demo || busy) return;
    setBusy(Date.now()); setSettled(false); setToast(''); setTimeout(() => setSettled(true), 700);
    await api.clearCache();
    setEpoch((e) => e + 1);
  };
  useEffect(() => {
    if (!busy || !settled || applied !== epoch || total.loading || hits.loading || refs.loading) return;
    setBusy(0); setToast('Updated just now');
  }, [busy, settled, applied, epoch, total.loading, hits.loading, refs.loading]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

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
  const siteName = demo ? ((sites.find((x) => x.url === baseApi.baseURL) || {}).name || 'Demo site') : baseApi.baseURL.replace(/^https?:\/\//, '');
  const pickSite = (site) => { const el = document.getElementById('sitepop'); if (el && el.hidePopover) { try { el.hidePopover(); } catch { /* already closed */ } } if (site.url !== baseApi.baseURL) onSite(site).catch((e) => setToast(`Could not open ${site.name}. ${e.message || ''}`.trim())); };
  const placeSites = (e) => { // sit just under the site name, never over it
    if (e.newState !== 'open') return;
    const b = document.querySelector('.sitebtn'); if (!b) return;
    const r = b.getBoundingClientRect(), el = e.currentTarget;
    el.style.top = Math.round(r.bottom + 8) + 'px';
    el.style.left = Math.round(Math.max(14, Math.min(r.left, innerWidth - el.offsetWidth - 14))) + 'px';
  };
  const openSites = () => { const el = document.getElementById('sitepop'); if (el && el.showPopover) { try { el.showPopover(); } catch { /* already open */ } } };
  const hourSum = useMemo(() => {
    if (!total.data) return null;
    const sum = new Array(24).fill(0);
    (total.data.stats || []).forEach((d) => d.hourly && d.hourly.forEach((v, h) => { sum[h] += v; }));
    return sum.reduce((a, b) => a + b, 0) >= 30 ? sum.indexOf(Math.max(...sum)) : null;
  }, [total.data]);
  const recapInfo = { site: siteName, range: rangeLabel, cur: cur || 0, pct, vals: series.filter((p) => p.v !== null).map((p) => p.v), topPage, topRef: refRows && refRows[0] ? refRows[0] : null, hour: hourSum, best: peak ? { label: peak.long || peak.label, v: peak.v } : null };
  const go = (label) => () => { const el = document.querySelector(`[aria-label="${label}"]`); if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); };
  const commands = [
    ...[['today', 'Today', 't'], ['7d', 'Last 7 days', 'w'], ['30d', 'Last 30 days', 'm'], ['90d', 'Last 90 days', 'q'], ['12m', 'Last 12 months', 'y']].map(([k, l, key]) => ({ id: 'r-' + k, group: 'Date range', label: l, keys: key, run: () => choose(k) })),
    { id: 'a-mode', group: 'Appearance', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', keys: 'l', run: () => onTheme() },
    { id: 'a-look', group: 'Appearance', label: look === 'nova' ? 'Use the Classic design' : 'Use the Nova design', keys: 'n', run: () => onLook(look === 'nova' ? 'classic' : 'nova') },
    { id: 'a-pin', group: 'Appearance', label: window.gcPref && window.gcPref.pinned() ? 'Forget my design choice' : 'Remember my design choice', run: () => { if (window.gcPref) window.gcPref.pin(!window.gcPref.pinned()); } },
    ...(demo ? [] : [{ id: 'x-refresh', group: 'Actions', label: 'Refresh data', keys: 'shift+r', run: refresh }]),
    ...(pageFilter ? [{ id: 'x-allpages', group: 'Actions', label: 'Show all pages', run: () => setPageFilter(null) }] : []),
    ...sites.filter((x) => x.url !== baseApi.baseURL).map((x) => ({ id: 's-' + x.url, group: 'Sites', label: 'Switch to ' + x.name, run: () => pickSite(x) })),
    { id: 'x-recap', group: 'Actions', label: 'Share a recap image', keys: 'r', run: () => setRecap(true) },
    { id: 'x-out', group: 'Actions', label: demo ? 'Exit the demo' : 'Disconnect', run: onDisconnect },
    ...['Top pages', 'Referrers', 'Where traffic goes', 'Countries', 'When readers show up', 'Your year', 'Browsers', 'Operating systems', 'Devices', 'Languages'].map((l) => ({ id: 'g-' + l.replace(/\s/g, ''), group: 'Go to', label: l, run: go(l) })),
  ];
  useShortcuts({ t: () => choose('today'), w: () => choose('7d'), m: () => choose('30d'), q: () => choose('90d'), y: () => choose('12m'), l: () => onTheme(), n: () => onLook(look === 'nova' ? 'classic' : 'nova'), r: () => setRecap(true), 'shift+r': refresh, ...(sites.length > 1 ? { s: openSites } : {}), '/': () => setPalette(true), '?': () => setPalette(true), 'mod+k': () => setPalette(true) });

  return html`<${Ctx.Provider} value=${ctxValue}><div style=${switching ? 'opacity:.55;pointer-events:none;transition:opacity .2s' : null} aria-busy=${String(!!switching)}>
    ${demo ? html`<aside class="banner" aria-label="Demo notice"><span><b>Demo data.</b> A seeded sample site, so you can explore every view without an account.</span><button type="button" onClick=${onDisconnect}>Exit demo</button></aside>` : null}
    ${limit ? html`<aside class="banner" role="status"><span><b>Request limit reached.</b> GoatCounter allows a limited number of requests per hour for a key. Saved numbers are shown where there are any. It reopens in about ${Math.max(1, Math.ceil((limit - Date.now()) / 60000))} min.</span></aside>` : null}
    <header class="topbar">
      <div class="brand"><div class="mark" aria-hidden="true">🐐</div><div style="min-width:0"><h1>GoatCounter Dashboard</h1><p>${sites.length > 1 ? html`<button type="button" class="sitebtn" popovertarget="sitepop" aria-label=${'Switch site. Open now: ' + siteName} title="Switch site (s)">${siteName}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>` : siteName} · ${tz.replace('_', ' ')}</p></div></div>
      <div class="tools">
        <div class="pills" role="group" aria-label="Date range">${PRESETS.map(([k, l]) => html`<button key=${k} type="button" class="pill" aria-pressed=${String(preset === k)} onClick=${() => choose(k)}>${l}</button>`)}<button type="button" class="pill" aria-pressed=${String(preset === 'custom')} onClick=${() => { if (preset !== 'custom') { setCustom({ start: range.from, end: range.to }); setPreset('custom'); } }}>Custom</button></div>
        ${preset === 'custom' && custom ? html`<div class="custom"><input type="date" aria-label="Start date" value=${custom.start} max=${range.today} onChange=${(e) => e.target.value && setCustom({ start: e.target.value, end: custom.end < e.target.value ? e.target.value : custom.end })} /><input type="date" aria-label="End date" value=${custom.end} max=${range.today} onChange=${(e) => e.target.value && setCustom({ start: custom.start > e.target.value ? e.target.value : custom.start, end: e.target.value })} /></div>` : null}
        <button type="button" class="iconbtn" aria-label="Open the command palette (shortcut: /)" title="Commands (/)" onClick=${() => setPalette(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
        <button type="button" class="iconbtn" aria-label="Share a recap image" title="Share a recap (r)" onClick=${() => setRecap(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button>
        <button type="button" class="iconbtn" aria-label="Appearance" title="Appearance" popovertarget="appearance"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".6" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".6" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".6" fill="currentColor"/><path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2c0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3a2 2 0 0 1 2-2H17a5 5 0 0 0 5-5c0-4.4-4.5-8-10-8z"/></svg></button>
        <button type="button" class="iconbtn" aria-label=${theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick=${(e) => { const r = e.currentTarget.getBoundingClientRect(); onTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}>
          ${theme === 'dark' ? html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>` : html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`}</button>
        ${demo ? null : html`<button type="button" class=${'iconbtn' + (busy ? ' spin' : '')} aria-label="Refresh data" title="Refresh data (Shift+R)" aria-busy=${String(!!busy)} onClick=${refresh}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5"/></svg></button>`}
        ${demo ? null : html`<button type="button" class="iconbtn" aria-label="Disconnect" title="Disconnect" onClick=${onDisconnect}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg></button>`}
      </div>
    </header>

    <${SectionRail} />
    <main>
      <${Anchor} id="overview" />
      ${pageFilter ? html`<div class="filterbar" role="status"><span>Only <b>${pageFilter.path}</b></span><button type="button" onClick=${() => setPageFilter(null)}>Show all pages <span aria-hidden="true">✕</span></button></div>` : null}
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
        <${Anchor} id="traffic" />
        <${TopPages} api=${api} range=${range} hits=${hits} now=${now} filtered=${!!pageFilter} onFilter=${(r) => { setPageFilter(r); setHover(null); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }} />
        <${RankCard} api=${api} span="span-5" title="Referrers" sub="Where visitors arrive from" endpoint=${E('toprefs', range, { limit: 50 })} ttl=${ttl} show=${8} drill=${(r) => r.id && '/api/v0/stats/toprefs/' + encodeURIComponent(r.id) + '?' + q({ start: range.start, end: range.end, limit: 10 })} tag=${(r) => (r.name ? schemeLabel(r.ref_scheme) : '')} empty="No referrers yet. Direct visits are not listed." />
        <${SankeyCard} api=${api} range=${range} ttl=${ttl} />
        <${Anchor} id="audience" />
        <${CountriesCard} api=${api} range=${range} ttl=${ttl} look=${look} theme=${theme} />
        <${RankCard} api=${api} span="span-12" title="Languages" endpoint=${E('languages', range, { limit: 50 })} ttl=${ttl} show=${8} />
        <${Anchor} id="rhythm" />
        <${TimePatterns} api=${api} tz=${tz} look=${look} theme=${theme} now=${now} />
        <${YearCard} api=${api} tz=${tz} now=${now} look=${look} />
        <${Anchor} id="tech" />
        <${BreakdownCard} api=${api} title="Browsers" sub="Click a browser for versions" kind="browser" endpoint=${E('browsers', range, { limit: 20 })} ttl=${ttl} drill=${(r) => r.id && '/api/v0/stats/browsers/' + encodeURIComponent(r.id) + '?' + q({ start: range.start, end: range.end, limit: 10 })} />
        <${BreakdownCard} api=${api} title="Operating systems" sub="Click a system for versions" kind="os" endpoint=${E('systems', range, { limit: 20 })} ttl=${ttl} drill=${(r) => r.id && '/api/v0/stats/systems/' + encodeURIComponent(r.id) + '?' + q({ start: range.start, end: range.end, limit: 10 })} />
        <${BreakdownCard} api=${api} title="Devices" sub="By screen size" kind="device" endpoint=${E('sizes', range, { limit: 20 })} ttl=${ttl} />
        <${RankCard} api=${api} span="span-12" hideEmpty=${true} title="Campaigns" sub="Visits tagged with a campaign parameter" endpoint=${E('campaigns', range, { limit: 20 })} ttl=${ttl} show=${6} drill=${(r) => r.id && '/api/v0/stats/campaigns/' + encodeURIComponent(r.id) + '?' + q({ start: range.start, end: range.end, limit: 10 })} empty="No tagged campaigns in this range." />
      </div>
    </main>
    <${AppearancePanel} look=${look} onLook=${onLook} />
    ${sites.length > 1 ? html`<div id="sitepop" popover class="pop sitepop" role="dialog" aria-label="Sites" onToggle=${placeSites}><div class="pop-h">Sites</div><ul>${sites.map((x) => html`<li key=${x.url}><button type="button" class=${x.url === baseApi.baseURL ? 'on' : ''} aria-current=${x.url === baseApi.baseURL ? 'true' : null} onClick=${() => pickSite(x)}><span>${x.name}</span>${x.url === baseApi.baseURL ? html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>` : null}</button></li>`)}</ul></div>` : null}
    <${Palette} open=${palette} onClose=${() => setPalette(false)} commands=${commands} />
    <${RecapDialog} open=${recap} onClose=${() => setRecap(false)} api=${api} range=${range} info=${recapInfo} look=${look} />
    <div class=${'toast' + (toast ? ' on' : '')} role="status" aria-live="polite">${toast}</div>
    <footer class="foot"><p>Counts are visitors, as GoatCounter reports them. Days and hours use the site's time zone.<br/>Browser and system logos are trademarks of their owners, shown to identify the software only.</p></footer>
  </div><//>`;
}
