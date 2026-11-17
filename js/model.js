// Turns raw API answers into the shapes the charts and insight sentences need.
import { addDays, diffDays, labelDay, labelWeekday, hourLabel, weekdayOf, fmtNum, fmtFull, zoned } from './util.js';

export function dayList(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }

// Visitors per bucket for the main chart. A single day shows 24 hours, anything longer shows days.
export function buildSeries(total, range, now, tz) {
  const byDay = new Map(((total && total.stats) || []).map((s) => [s.day, s]));
  const pts = [];
  if (range.hourly) {
    const s = byDay.get(range.from);
    const nowH = zoned(now, tz).hour;
    for (let h = 0; h < 24; h++) {
      const future = range.live && h > nowH;
      pts.push({ i: h, key: `${range.from}T${String(h).padStart(2, '0')}`, day: range.from, hour: h, label: hourLabel(h), long: `${labelDay(range.from)}, ${hourLabel(h)}`, v: future ? null : ((s && s.hourly && s.hourly[h]) || 0), partial: range.live && h === nowH });
    }
  } else {
    dayList(range.from, range.to).forEach((day, i) => {
      const s = byDay.get(day);
      const isToday = range.live && day === range.to;
      pts.push({ i, key: day, day, label: labelDay(day), long: `${labelWeekday(day)}, ${labelDay(day, true)}`, v: (s && s.daily) || 0, partial: isToday });
    });
  }
  return pts;
}

export const sum = (pts) => pts.reduce((a, p) => a + (p.v || 0), 0);
export const completed = (pts) => pts.filter((p) => p.v !== null && !p.partial);

export function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

// A bucket is a spike when it is far above the median of the days before it, and big enough to matter.
export function findSpikes(pts, { min = 40 } = {}) {
  const out = [];
  for (let i = 3; i < pts.length; i++) {
    const p = pts[i];
    if (p.v === null || p.partial) continue;
    const win = pts.slice(Math.max(0, i - 14), i).map((q) => q.v || 0);
    const med = median(win);
    const mad = median(win.map((v) => Math.abs(v - med))) || 1;
    if (p.v >= min && p.v >= med * 2.2 && p.v >= med + 5 * mad) out.push({ i, ratio: p.v / Math.max(1, med), v: p.v, med });
  }
  // the day after a spike is just its tail, not another event
  const keep = out.filter((s) => !out.some((o) => o.i === s.i - 1 && o.v > s.v));
  return keep.sort((a, b) => b.v - a.v).slice(0, 3).sort((a, b) => a.i - b.i);
}

// Typical visitors by weekday and hour (site time zone). Medians, so one viral day cannot rewrite the pattern.
export function hourWeekday(total) {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));
  for (const s of (total && total.stats) || []) {
    if (!s.hourly) continue;
    const wd = weekdayOf(s.day);
    s.hourly.forEach((v, h) => cells[wd][h].push(v));
  }
  const typical = cells.map((row) => row.map((a) => median(a)));
  // A light site has a median of 0 almost everywhere, which says nothing. Below that, show the average per cell instead.
  if (typical.flat().reduce((a, b) => a + b, 0) >= 60) return { m: typical, n: new Array(7).fill(1), samples: cells[0][0].length, sparse: false, enough: true };
  const visits = cells.flat(2).reduce((a, b) => a + b, 0);
  const avg = cells.map((row) => row.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)));
  return { m: avg, n: new Array(7).fill(1), samples: cells[0][0].length, sparse: true, enough: visits >= 30 };
}

export function buildInsights({ total, series, prevSeries, prevTotal, range, hits, now, tz }) {
  const out = [];
  const done = completed(series);
  const cur = sum(series), prev = prevTotal;
  if (prev >= 20 && cur > 0) {
    const pct = ((cur - prev) / prev) * 100;
    out.push({ k: 'delta', tone: pct >= 0 ? 'up' : 'down', text: `${pct >= 0 ? 'Up' : 'Down'} ${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}% on the previous ${range.days === 1 ? 'day' : range.days + ' days'}`, detail: `${fmtFull(cur)} visitors now, ${fmtFull(prev)} before` });
  }
  if (range.days >= 14) {
    const byWd = Array.from({ length: 7 }, () => []);
    done.forEach((p) => byWd[weekdayOf(p.day)].push(p.v));
    const typical = byWd.map((a) => (a.length ? median(a) : 0));
    const best = typical.indexOf(Math.max(...typical));
    if (byWd[best].length >= 2) out.push({ k: 'weekday', text: `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][best]} is your strongest day`, detail: `${fmtNum(typical[best])} visitors on a typical one` });
  }
  const hw = hourWeekday(total);
  const byHour = new Array(24).fill(0);
  hw.m.forEach((row) => row.forEach((v, h) => { byHour[h] += v; }));
  if (byHour.reduce((a, b) => a + b, 0) >= 30) {
    const h = byHour.indexOf(Math.max(...byHour));
    out.push({ k: 'hour', text: `Readers show up most around ${hourLabel(h)}`, detail: 'Site time zone' });
  }
  const spikes = findSpikes(series);
  if (spikes.length) {
    const s = [...spikes].sort((a, b) => b.v - a.v)[0];
    out.push({ k: 'spike', text: `${series[s.i].label} was ${s.ratio.toFixed(1)}x a normal day`, detail: `${fmtFull(s.v)} visitors against a usual ${fmtNum(s.med)}` });
  }
  if (hits && hits.length) {
    const mv = pageMovers(hits)[0];
    if (mv && mv.change > 0.25) out.push({ k: 'rising', text: `${mv.title || mv.path} is rising`, detail: `${fmtNum(mv.late)} visitors lately, ${Math.round(mv.change * 100)}% more than the first half` });
  }
  return out.slice(0, 4);
}

// Compare the second half of the window with the first half for each page. Small counts are ignored.
export function pageMovers(hits) {
  return hits.map((h) => {
    const d = (h.stats || []).map((s) => s.daily || 0);
    if (d.length < 4) return null;
    const mid = d.length >> 1;
    const early = d.slice(0, mid).reduce((a, b) => a + b, 0), late = d.slice(mid).reduce((a, b) => a + b, 0);
    if (early + late < 30) return null;
    return { path: h.path, title: h.title, early, late, change: (late - early) / Math.max(early, 1) };
  }).filter(Boolean).sort((a, b) => b.change - a.change);
}

export function pageSeries(hit, range) {
  return dayList(range.from, range.to).map((day) => { const s = (hit.stats || []).find((x) => x.day === day); return s ? s.daily || 0 : 0; });
}

export function shareOf(n, total) { return total > 0 ? (n / total) * 100 : 0; }

export function schemeLabel(s) { return { h: 'Link', g: 'Search', c: 'Campaign', o: 'Other' }[s] || 'Link'; }
