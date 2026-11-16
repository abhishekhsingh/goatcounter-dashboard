// Formatting, time zone and range helpers. Days and hours from GoatCounter are in the site's time zone,
// so every date here is computed in that zone, not the browser's.

export const fmtNum = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  const v = Number(n), a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(v).toLocaleString('en-US');
};
export const fmtFull = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
export const fmtPct = (n, digits = 1) => (Number.isFinite(n) ? (n > 0 ? '+' : '') + n.toFixed(digits) + '%' : '-');
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- time zones ----
const dtfCache = new Map();
function dtf(tz) {
  if (!dtfCache.has(tz)) dtfCache.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  return dtfCache.get(tz);
}
export function browserTZ() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
export function validTZ(tz) { try { dtf(tz); return tz; } catch { return browserTZ(); } }

export function zoned(date, tz) {
  const o = {};
  for (const p of dtf(tz).formatToParts(date)) if (p.type !== 'literal') o[p.type] = +p.value;
  return o; // {year, month, day, hour, minute, second}
}
export const ymdOf = (date, tz) => { const z = zoned(date, tz); return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')}`; };
export const parseYMD = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (ymd, n) => new Date(parseYMD(ymd) + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((parseYMD(a) - parseYMD(b)) / 864e5);
export const weekdayOf = (ymd) => new Date(parseYMD(ymd)).getUTCDay(); // 0 = Sunday

// The instant at which a calendar day starts in the given zone.
export function startOfDayInstant(ymd, tz) {
  const guess = parseYMD(ymd);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const z = zoned(new Date(t), tz);
    const shown = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
    t += guess - shown;
  }
  return new Date(t);
}

// ---- ranges ----
export const PRESETS = [['today', 'Today'], ['7d', '7d'], ['30d', '30d'], ['90d', '90d'], ['12m', '12m']];
const SPAN = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };

export function makeRange(preset, tz, custom, now = new Date()) {
  const today = ymdOf(now, tz);
  let from, to;
  if (preset === 'today') { from = today; to = today; }
  else if (preset === 'custom' && custom && custom.start && custom.end) { from = custom.start; to = custom.end > today ? today : custom.end; if (from > to) from = to; }
  else { const n = SPAN[preset] || 7; from = addDays(today, -(n - 1)); to = today; }
  const days = diffDays(to, from) + 1;
  const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(days - 1));
  const iso = (ymd, endOfDay) => (endOfDay ? new Date(startOfDayInstant(addDays(ymd, 1), tz).getTime() - 1000) : startOfDayInstant(ymd, tz)).toISOString().replace('.000Z', 'Z');
  const key = (a, b) => `${a}_${b}`;
  return {
    preset, from, to, days, today, hourly: days === 1,
    start: iso(from, false), end: iso(to, true),
    prev: { from: prevFrom, to: prevTo, start: iso(prevFrom, false), end: iso(prevTo, true) },
    key: key(from, to), live: to === today,
  };
}

export function labelDay(ymd, withYear = false) {
  const d = new Date(parseYMD(ymd));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}
export const labelWeekday = (ymd, long = false) => new Date(parseYMD(ymd)).toLocaleDateString('en-US', { weekday: long ? 'long' : 'short', timeZone: 'UTC' });
export const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? ' AM' : ' PM'}`;

export function relativeTime(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ---- motion helpers ----
export const EASE = { out: (t) => 1 - Math.pow(1 - t, 4), inOut: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) };

// Damped spring toward a target. Calls onFrame(value) until it settles; returns a cancel function.
export function springTo(from, to, onFrame, { k = 170, c = 26 } = {}) {
  let x = from, v = 0, last = performance.now(), raf = 0;
  const step = (now) => {
    const dt = Math.min(0.032, (now - last) / 1000); last = now;
    v += (-k * (x - to) - c * v) * dt; x += v * dt;
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 1) { onFrame(to); return; }
    onFrame(x); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

// Fixed-duration ease for number tickers: the last digits settle with the rest, no long tail.
export function tweenTo(from, to, onFrame, ms = 320) {
  const t0 = performance.now(); let raf = 0;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    onFrame(from + (to - from) * EASE.out(t));
    if (t < 1) raf = requestAnimationFrame(step); else onFrame(to);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

// Monotone cubic interpolation (Fritsch-Carlson) as an SVG path. Never overshoots the data.
export function monotonePath(pts) {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); dy.push(pts[i + 1][1] - pts[i][1]); m.push(dy[i] / (dx[i] || 1)); }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i + 1][0], y1 = pts[i + 1][1], h = dx[i] / 3;
    d += `C${(x0 + h).toFixed(1)},${(y0 + t[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - t[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

export function niceMax(v) {
  if (v <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return steps.find((x) => f <= x + 1e-9) * p;
}

// Axis scale with round tick values: four equal steps of 1, 2, 2.5, 5 or 10 times a power of ten.
export function niceScale(max) {
  const m = Math.max(4, max);
  const p = Math.pow(10, Math.floor(Math.log10(m / 4)));
  const step = [1, 2, 2.5, 5, 10].map((c) => c * p).find((c) => c * 4 >= m - 1e-9);
  const st = Math.max(1, step);
  return { step: st, ymax: st * 4 };
}
