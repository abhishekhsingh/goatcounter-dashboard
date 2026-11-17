// Seeded demo site. One hourly model for ~400 days is generated once; every API answer is computed
// from it, so any range, previous period and drill-down stays consistent.
import { addDays, diffDays, parseYMD, ymdOf, zoned, browserTZ } from './util.js';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const PAGES = [
  { path: '/', title: 'Home', w: 15, kind: 'evergreen' },
  { path: '/blog/building-distributed-systems-at-scale', title: 'Building Distributed Systems at Scale', w: 14, kind: 'evergreen' },
  { path: '/blog/mcp-server-production-guide', title: 'How I Built a Production MCP Server', w: 9, kind: 'viral' },
  { path: '/blog/rate-limiting-lessons', title: "Rate Limiting Lessons from GoatCounter's API", w: 7, kind: 'rising' },
  { path: '/projects', title: 'Projects', w: 8, kind: 'evergreen' },
  { path: '/blog/neo4j-rbac-graph-permissions', title: 'Graph-Based RBAC with Neo4j', w: 5, kind: 'declining' },
  { path: '/blog/dag-pipeline-architecture', title: 'Designing a DAG Pipeline Engine', w: 5, kind: 'evergreen' },
  { path: '/blog/llm-fallback-patterns', title: 'LLM Provider Fallback Patterns', w: 6, kind: 'launch' },
  { path: '/about', title: 'About', w: 4, kind: 'evergreen' },
  { path: '/blog/search-relevance-notes', title: 'Notes on Search Relevance', w: 3, kind: 'rising' },
  { path: '/blog/idempotent-webhooks', title: 'Idempotent Webhook Delivery', w: 3, kind: 'evergreen' },
  { path: '/blog/postgres-partitioning', title: 'Partitioning Postgres for Analytics', w: 3, kind: 'declining' },
  { path: '/blog/observability-budget', title: 'An Observability Budget That Holds', w: 2.5, kind: 'evergreen' },
  { path: '/resume', title: 'Resume', w: 2.5, kind: 'evergreen' },
  { path: '/blog/tenant-isolation-patterns', title: 'Tenant Isolation Patterns', w: 2, kind: 'rising' },
  { path: '/blog/cost-of-retries', title: 'The Real Cost of Retries', w: 2, kind: 'evergreen' },
  { path: '/contact', title: 'Contact', w: 1.5, kind: 'evergreen' },
  { path: '/blog/feature-flags-at-scale', title: 'Feature Flags at Scale', w: 1.5, kind: 'declining' },
  { path: '/uses', title: 'Uses', w: 1.2, kind: 'evergreen' },
  { path: '/blog/backpressure-in-queues', title: 'Backpressure in Queues', w: 1.2, kind: 'evergreen' },
];

const REFERRERS = [
  { name: '', scheme: 'h', share: 0.27 },                       // direct
  { name: 'Google', scheme: 'g', share: 0.24 },
  { name: 'news.ycombinator.com', scheme: 'h', share: 0.02 },
  { name: 'linkedin.com', scheme: 'h', share: 0.075 },
  { name: 'github.com', scheme: 'h', share: 0.06 },
  { name: 'twitter.com', scheme: 'h', share: 0.04 },
  { name: 'reddit.com', scheme: 'h', share: 0.03 },
  { name: 'dev.to', scheme: 'h', share: 0.025 },
  { name: 'lobste.rs', scheme: 'h', share: 0.015 },
  { name: 'DuckDuckGo', scheme: 'g', share: 0.02 },
  { name: 'Bing', scheme: 'g', share: 0.015 },
  { name: 'newsletter', scheme: 'c', share: 0.01 },
  { name: 'claude.ai', scheme: 'h', share: 0.012 },
];

const COUNTRIES = [
  ['US', 'United States', 31], ['IN', 'India', 13], ['DE', 'Germany', 7], ['GB', 'United Kingdom', 6.5], ['CA', 'Canada', 4], ['FR', 'France', 3.5],
  ['NL', 'Netherlands', 3], ['AU', 'Australia', 2.8], ['BR', 'Brazil', 2.6], ['SG', 'Singapore', 2.2], ['SE', 'Sweden', 2], ['ES', 'Spain', 1.9],
  ['JP', 'Japan', 1.8], ['PL', 'Poland', 1.6], ['IT', 'Italy', 1.5], ['CH', 'Switzerland', 1.4], ['IE', 'Ireland', 1.3], ['IL', 'Israel', 1.2],
  ['NO', 'Norway', 1.1], ['KR', 'South Korea', 1.1], ['MX', 'Mexico', 1], ['ZA', 'South Africa', 0.9], ['AE', 'United Arab Emirates', 0.9], ['ID', 'Indonesia', 0.8],
  ['PT', 'Portugal', 0.8], ['UA', 'Ukraine', 0.7], ['NZ', 'New Zealand', 0.7], ['AR', 'Argentina', 0.6], ['TR', 'Turkey', 0.6], ['PH', 'Philippines', 0.5],
  ['VN', 'Vietnam', 0.5], ['FI', 'Finland', 0.5], ['DK', 'Denmark', 0.5], ['CZ', 'Czechia', 0.4], ['NG', 'Nigeria', 0.4], ['EG', 'Egypt', 0.3],
  ['CL', 'Chile', 0.3], ['TH', 'Thailand', 0.3], ['KE', 'Kenya', 0.2], ['', '(unknown)', 2],
];
const REGIONS = {
  US: [['California', 24], ['New York', 13], ['Texas', 10], ['Washington', 9], ['Massachusetts', 6], ['Virginia', 5], ['Illinois', 5], ['Colorado', 4]],
  IN: [['Karnataka', 28], ['Maharashtra', 18], ['Telangana', 14], ['Delhi', 11], ['Tamil Nadu', 9], ['Uttar Pradesh', 6]],
  DE: [['Berlin', 24], ['Bavaria', 20], ['Hesse', 12], ['North Rhine-Westphalia', 12], ['Hamburg', 8]],
  GB: [['England', 78], ['Scotland', 10], ['Wales', 4], ['Northern Ireland', 2]],
};
const BROWSERS = [['Chrome', 61, ['126', '125', '124', '123']], ['Safari', 17, ['17.5', '17.4', '16.6']], ['Firefox', 8, ['127', '126', '115 ESR']], ['Edge', 7, ['126', '125']], ['Arc', 2.2, ['1.5']], ['Brave', 1.6, ['1.67']], ['Opera', 0.9, ['111']], ['Samsung Browser', 0.9, ['25']], ['Other', 1.4, []]];
const SYSTEMS = [['macOS', 36, ['14', '13', '12']], ['Windows', 28, ['11', '10']], ['iOS', 13, ['17', '16']], ['Android', 11, ['14', '13', '12']], ['Linux', 9, ['Ubuntu', 'Fedora']], ['Chrome OS', 1.4, []], ['Other', 1.6, []]];
const SIZES = [['phone', 'Phones', 29], ['tablet', 'Tablets', 6], ['desktop', 'Laptop/Desktop', 41], ['desktophd', 'HD Display', 19], ['largerscreen', 'Large screen', 4], ['unknown', 'Unknown', 1]];
const LANGS = [['en', 'English', 75], ['de', 'German', 7.5], ['ja', 'Japanese', 3.3], ['fr', 'French', 3], ['pt', 'Portuguese', 2.1], ['es', 'Spanish', 1.8], ['ko', 'Korean', 1.3], ['nl', 'Dutch', 1.2], ['it', 'Italian', 1], ['', '(unknown)', 3]];
const CAMPAIGNS = [['newsletter-nov', 'newsletter-nov', 38], ['hn-launch', 'hn-launch', 24], ['linkedin-post', 'linkedin-post', 20], ['conf-talk', 'conf-talk', 12], ['x-thread', 'x-thread', 6]];

function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
function poisson(lambda, r) {
  if (lambda <= 0) return 0;
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(r)));
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}
function shares(list, weightIdx, total) {
  const sum = list.reduce((a, x) => a + x[weightIdx], 0);
  const raw = list.map((x) => (x[weightIdx] / sum) * total);
  const floor = raw.map(Math.floor);
  let rest = total - floor.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - floor[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest-- > 0) floor[i]++; });
  return floor;
}

export function createDemo({ seed = 20261116, days = 760, tz = browserTZ(), pages = PAGES, rate = 560, host = '_demo_' } = {}) {
  const PAGES = pages;
  const r = mulberry32(seed);
  let sel = null; // page indices a request is narrowed to (include_paths), null for all pages
  const hasViral = PAGES.some((x) => x.kind === 'viral'), k = rate / 560;
  const now = new Date();
  const today = ymdOf(now, tz);
  const nowHour = zoned(now, tz).hour;
  const N = days + 1;
  const first = addDays(today, -days);
  const dayOf = (d) => addDays(first, d);
  const tzOff = -new Date(now).getTimezoneOffset() / 60; // close enough for a diurnal shape

  // visitors come from several time zones, so the site-local hour profile blends them
  const audiences = [[0.38, -5], [0.27, 1], [0.17, 5.5], [0.1, 9], [0.08, -8]];
  const curve = (lh) => 0.18 + Math.exp(-Math.pow(((lh - 14 + 36) % 24) - 12 + 12 - 12, 2) / 24) * 0;
  const f = (lh) => { const a = ((lh % 24) + 24) % 24; return 0.2 + Math.exp(-Math.pow(a - 14, 2) / (2 * 3.6 * 3.6)) + 0.45 * Math.exp(-Math.pow(a - 10, 2) / (2 * 2 * 2)); };
  void curve;
  const diurnal = Array.from({ length: 24 }, (_, h) => audiences.reduce((s, [w, off]) => s + w * f(h - tzOff + off), 0));
  const dm = diurnal.reduce((a, b) => a + b, 0) / 24; for (let h = 0; h < 24; h++) diurnal[h] /= dm;

  const dow = [0.62, 1.1, 1.15, 1.1, 1.05, 0.9, 0.6]; // Sunday first
  const wsum = PAGES.reduce((a, p) => a + p.w, 0);
  const launchDay = days - 46, viralDay = days - 23;
  const PULSES = [9, 37, 64, 93, 118, 151, 181, 213, 240, 274, 301, 338, 366, 402, 431, 470, 505, 541].map((k) => days - k);
  const H = PAGES.map(() => new Float32Array(N * 24));
  const dailyRefs = REFERRERS.map(() => new Float32Array(N));
  const tilt = PAGES.map(() => REFERRERS.map(() => 0.55 + r() * 0.9)); // each page leans on different referrers

  for (let d = 0; d < N; d++) {
    const date = dayOf(d), wd = new Date(parseYMD(date)).getUTCDay();
    const doy = (parseYMD(date) - Date.UTC(+date.slice(0, 4), 0, 0)) / 864e5;
    const season = 1 + 0.1 * Math.sin((2 * Math.PI * (doy - 80)) / 365) - (doy > 352 || doy < 4 ? 0.3 : 0);
    const growth = 0.55 + 0.5 * Math.pow(d / days, 1.15);
    const lull = d === days - 118 || d === days - 117 ? 0.3 : 1;
    const dayRate = rate * growth * dow[wd] * season * lull * Math.exp(0.14 * gauss(r));
    let dayTotal = 0;
    PAGES.forEach((p, i) => {
      let pc = 1;
      if (p.kind === 'rising') pc = 0.5 + 1.1 * (d / days);
      if (p.kind === 'declining') pc = 1.5 - 1.1 * (d / days);
      if (p.kind === 'launch') pc = d < launchDay ? 0 : 0.28 + 3.2 * Math.exp(-(d - launchDay) / 4.5);
      const base = dayRate * (p.w / wsum) * pc * Math.exp(0.12 * gauss(r));
      for (let h = 0; h < 24; h++) {
        if (d === days && h > nowHour) continue;
        let lam = (base / 24) * diurnal[h];
        const t = d * 24 + h;
        if (p.kind === 'viral') { const t0 = viralDay * 24 + 9; if (t >= t0) lam += 2400 * Math.exp(-(t - t0) / 8) / 8 + 70 * Math.exp(-(t - t0) / 40); }
        if ((i === 0 || i === 4) && PULSES.includes(d)) { const t0 = d * 24 + 8; if (t >= t0) lam += 90 * Math.exp(-(t - t0) / 12); }
        const v = poisson(lam, r);
        H[i][t] = v; dayTotal += v;
      }
    });
    REFERRERS.forEach((ref, j) => {
      let v = dayTotal * 0.87 * ref.share * (0.8 + 0.4 * r());
      if (hasViral && ref.name === 'news.ycombinator.com') { const dk = d - viralDay; if (dk >= 0) v += 2000 * Math.exp(-dk / 0.9); }
      if (ref.name === 'reddit.com' && d === days - 60) v += 420 * k;
      if (ref.name === 'newsletter' && PULSES.includes(d)) v += 260 * k;
      if (ref.name === 'linkedin.com' && d === days - 30) v += 300 * k;
      dailyRefs[j][d] = v;
    });
  }

  // ---- derived views ----
  const siteHourly = (d, h) => { let s = 0; for (let i = 0; i < PAGES.length; i++) if (!sel || sel.has(i)) s += H[i][d * 24 + h]; return Math.round(s * 0.87); };
  const dayIdx = (ymd) => diffDays(ymd, first);
  const windowOf = (start, end) => {
    const a = Math.max(0, dayIdx(ymdOf(new Date(start), tz))), b = Math.min(N - 1, dayIdx(ymdOf(new Date(end), tz)));
    return [a, Math.max(a, b)];
  };
  const pageCount = (i, a, b) => { let s = 0; for (let t = a * 24; t < (b + 1) * 24; t++) s += H[i][t]; return s; };
  const totalIn = (a, b) => { let s = 0; for (let d = a; d <= b; d++) for (let h = 0; h < 24; h++) s += siteHourly(d, h); return s; };
  const statsFor = (i, a, b) => { const out = []; for (let d = a; d <= b; d++) { const hourly = []; let daily = 0; for (let h = 0; h < 24; h++) { const v = H[i][d * 24 + h]; hourly.push(v); daily += v; } out.push({ day: dayOf(d), daily, hourly }); } return out; };
  const refCounts = (a, b, pageIdx) => {
    let narrow = 1; // narrowed to some pages: the referrers shrink with them
    if (sel && pageIdx == null) { let part = 0, all = 0; PAGES.forEach((x, i) => { const c = pageCount(i, a, b); all += c; if (sel.has(i)) part += c; }); narrow = all ? part / all : 0; }
    const base = REFERRERS.map((ref, j) => { let s = 0; for (let d = a; d <= b; d++) s += dailyRefs[j][d]; return pageIdx == null ? s * narrow : s * (tilt[pageIdx][j] / 1.0) * (PAGES[pageIdx].w / wsum) * 1.0; });
    const want = pageIdx == null ? null : pageCount(pageIdx, a, b);
    const sum = base.reduce((x, y) => x + y, 0) || 1;
    return base.map((v, j) => ({ ...REFERRERS[j], count: Math.round(v * (want == null ? 1 : want / sum)) })).filter((x) => x.count > 0).sort((x, y) => y.count - x.count);
  };
  const lim = (arr, p) => arr.slice(+(p.offset || 0), +(p.offset || 0) + Math.min(100, +(p.limit || 20)));
  const listFrom = (list, idIdx, nameIdx, wIdx, total, extra) => shares(list, wIdx, total).map((c, i) => ({ id: list[i][idIdx], name: list[i][nameIdx], count: c, ...(extra ? extra(list[i]) : {}) })).filter((x) => x.count > 0).sort((x, y) => y.count - x.count);

  function respond(endpoint) {
    const [path, qs] = endpoint.split('?');
    const p = Object.fromEntries(new URLSearchParams(qs || ''));
    sel = p.include_paths ? new Set(p.include_paths.split(',').map((x) => +x - 1001)) : null;
    const parts = path.replace('/api/v0', '').split('/').filter(Boolean);
    const [a, b] = p.start ? windowOf(p.start, p.end || now.toISOString()) : [N - 7, N - 1];
    const total = totalIn(a, b);
    if (parts[0] === 'me') return { token: { name: 'demo', permissions: { stats: true }, sites: [] }, user: { id: 1, site: 1, email: 'demo@example.com', settings: { timezone: tz } } };
    if (parts[0] === 'sites') return { sites: DEMO_SITES.map((x, i) => ({ id: i + 1, code: x.code, cname: x.name })), more: false };
    if (parts[0] !== 'stats') return {};
    const kind = parts[1], id = parts[2];
    if (kind === 'total') {
      const stats = [];
      for (let d = a; d <= b; d++) { const hourly = []; let daily = 0; for (let h = 0; h < 24; h++) { const v = siteHourly(d, h); hourly.push(v); daily += v; } stats.push({ day: dayOf(d), daily, hourly }); }
      return { total, total_utc: total, total_events: 0, stats };
    }
    if (kind === 'hits' && id) { const i = PAGES.findIndex((x, k) => String(1001 + k) === id); return { refs: lim(refCounts(a, b, Math.max(0, i)).map((x) => ({ id: x.name || 'direct', name: x.name, count: x.count, ref_scheme: x.scheme })), p), more: false }; }
    if (kind === 'hits') {
      const rows = PAGES.map((pg, i) => ({ i, c: pageCount(i, a, b) })).filter((x) => x.c > 0 && (!sel || sel.has(x.i))).sort((x, y) => y.c - x.c);
      const sc = (v) => Math.round(v * 0.87); // pages add up to the site total, as in the other answers
      const hits = lim(rows, p).map(({ i, c }) => { const stats = statsFor(i, a, b).map((x) => ({ ...x, daily: sc(x.daily), hourly: x.hourly.map(sc) })); return { path_id: 1001 + i, path: PAGES[i].path, title: PAGES[i].title, event: false, count: sc(c), max: Math.max(10, ...stats.map((x) => x.daily)), stats }; });
      return { hits, total, more: rows.length > hits.length };
    }
    if (kind === 'toprefs' && id) { const k = REFERRERS.findIndex((x) => (x.name || 'direct') === decodeURIComponent(id)); const rc = refCounts(a, b, null)[0]; void rc; const tot = k < 0 ? 0 : Math.round(dailyRefs[k].slice(a, b + 1).reduce((x, y) => x + y, 0)); const wt = PAGES.map((pg, i) => pg.w * tilt[i][Math.max(0, k)]); const frac = sel ? [...sel].reduce((x, i) => x + (wt[i] || 0), 0) / wt.reduce((x, y) => x + y, 0) : 1; const rows = PAGES.map((pg, i) => [pg.path, wt[i]]).filter((x, i) => !sel || sel.has(i)); return { stats: listFrom(rows, 0, 0, 1, Math.round(tot * frac)).slice(0, 10).map((x) => ({ ...x, id: x.name })), more: false }; }
    if (kind === 'toprefs') return { stats: lim(refCounts(a, b, null).map((x) => ({ id: x.name || 'direct', name: x.name, count: x.count, ref_scheme: x.scheme })), p), more: false };
    if (kind === 'browsers') return id ? { stats: listFrom((BROWSERS.find((x) => x[0] === decodeURIComponent(id)) || BROWSERS[0])[2].map((v, i) => [v, v, 10 - i * 2]), 0, 1, 2, Math.round(total * 0.4)), more: false } : { stats: listFrom(BROWSERS, 0, 0, 1, total), more: false };
    if (kind === 'systems') return id ? { stats: listFrom((SYSTEMS.find((x) => x[0] === decodeURIComponent(id)) || SYSTEMS[0])[2].map((v, i) => [v, v, 10 - i * 2]), 0, 1, 2, Math.round(total * 0.3)), more: false } : { stats: listFrom(SYSTEMS, 0, 0, 1, total), more: false };
    if (kind === 'sizes') return { stats: listFrom(SIZES, 0, 1, 2, total).map((x) => ({ ...x, name: '' })), more: false };
    if (kind === 'languages') return { stats: lim(listFrom(LANGS, 0, 1, 2, total), p), more: false };
    if (kind === 'locations' && id) { const reg = REGIONS[id] || []; const tot = (listFrom(COUNTRIES, 0, 1, 2, total).find((x) => x.id === id) || { count: 0 }).count; return { stats: reg.length ? listFrom(reg, 0, 0, 1, tot).map((x) => ({ ...x, id: x.name })) : [], more: false }; }
    if (kind === 'locations') return { stats: lim(listFrom(COUNTRIES, 0, 1, 2, total), p), more: false };
    if (kind === 'campaigns' && id) return { stats: listFrom(REFERRERS.filter((x) => x.scheme === 'h' && x.name).slice(0, 4).map((x) => [x.name, x.share * 100]), 0, 0, 1, Math.round(total * 0.05)).map((x) => ({ ...x, id: x.name })), more: false };
    if (kind === 'campaigns') return { stats: listFrom(CAMPAIGNS, 0, 1, 2, Math.round(total * 0.12)), more: false };
    return { stats: [], more: false };
  }

  return {
    demo: true, tz, baseURL: host, today, firstDay: dayOf(0),
    async get(endpoint, opts = {}) { await new Promise((res) => setTimeout(res, 40 + Math.random() * 90)); return respond(endpoint); },
    clearCache() { return Promise.resolve(); },
    _respond: respond,
  };
}

// ---- three imaginary sites, so the site switcher has something to switch between ----
const PAGES_TRAIL = [
  { path: '/', title: 'Home', w: 14, kind: 'evergreen' },
  { path: '/trails/ridge-loop', title: 'Ridge Loop in a Day', w: 12, kind: 'evergreen' },
  { path: '/trails/lakeside-day-hike', title: 'The Lakeside Day Hike', w: 10, kind: 'rising' },
  { path: '/gear/boots-after-500km', title: 'Boots After 500 km', w: 8, kind: 'evergreen' },
  { path: '/trails/winter-bivouac', title: 'A Winter Bivouac', w: 6, kind: 'declining' },
  { path: '/trails/glacier-traverse', title: 'The Glacier Traverse', w: 6, kind: 'launch' },
  { path: '/guides/leave-no-trace', title: 'Leave No Trace, Plainly', w: 5, kind: 'evergreen' },
  { path: '/maps', title: 'Maps', w: 5, kind: 'evergreen' },
  { path: '/gear/stove-tests', title: 'Stove Tests', w: 4, kind: 'rising' },
  { path: '/about', title: 'About', w: 3, kind: 'evergreen' },
];
const PAGES_PIXEL = [
  { path: '/', title: 'Home', w: 16, kind: 'evergreen' },
  { path: '/gallery', title: 'Gallery', w: 12, kind: 'evergreen' },
  { path: '/tutorials/palette-basics', title: 'Palette Basics', w: 10, kind: 'rising' },
  { path: '/tutorials/dithering', title: 'Dithering by Hand', w: 8, kind: 'evergreen' },
  { path: '/gallery/spring-sprites', title: 'Spring Sprites', w: 7, kind: 'declining' },
  { path: '/shop', title: 'Shop', w: 5, kind: 'evergreen' },
  { path: '/blog/pixel-notes', title: 'Pixel Notes', w: 4, kind: 'rising' },
  { path: '/about', title: 'About', w: 3, kind: 'evergreen' },
];
const DEMO_SITES = [
  { code: 'ridge-notes', name: 'ridge-notes.example', opts: {} },
  { code: 'trailhead', name: 'trailhead.example', opts: { seed: 77, rate: 220, pages: PAGES_TRAIL } },
  { code: 'pixel-garden', name: 'pixel-garden.example', opts: { seed: 4242, rate: 95, pages: PAGES_PIXEL } },
];
// Each site is built on first use (about 100 ms), then kept.
export function createDemoSites() {
  const pool = new Map();
  const sites = DEMO_SITES.map((x, i) => ({ id: i + 1, name: x.name, url: '_demo_/' + x.code }));
  const open = (url) => {
    let api = pool.get(url);
    if (!api) { const x = DEMO_SITES[sites.findIndex((s) => s.url === url)] || DEMO_SITES[0]; api = createDemo({ ...x.opts, host: url }); pool.set(url, api); }
    return api;
  };
  return { sites, open };
}
