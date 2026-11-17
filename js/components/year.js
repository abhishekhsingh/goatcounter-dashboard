import { html, useState, useEffect, useMemo, useRef, useInView } from '../ui.js';
import { useApi, Skeleton, ErrorBox } from './common.js';
import { q } from '../api.js';
import { makeRange, addDays, diffDays, weekdayOf, labelDay, fmtFull, fmtNum } from '../util.js';
import { dayList } from '../model.js';

const goalKey = (api) => 'gc-dashboard-goal-v1:' + api.baseURL;
const readGoal = (api) => { try { return +localStorage.getItem(goalKey(api)) || 0; } catch { return 0; } };
const writeGoal = (api, v) => { try { v > 0 ? localStorage.setItem(goalKey(api), String(v)) : localStorage.removeItem(goalKey(api)); } catch { /* storage blocked */ } };

// Percentile of the non-zero days, so one viral day does not wash out every other cell.
function levels(vals) {
  const nz = vals.filter((v) => v > 0).sort((a, b) => a - b);
  if (!nz.length) return () => 0;
  const at = (p) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))];
  const t = [at(0.25), at(0.5), at(0.75)];
  return (v) => (v <= 0 ? 0 : v <= t[0] ? 1 : v <= t[1] ? 2 : v <= t[2] ? 3 : 4);
}

function Ring({ r, value, color, delay }) {
  const C = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return html`<g transform="rotate(-90 70 70)"><circle cx="70" cy="70" r=${r} fill="none" stroke="var(--hair)" stroke-width="9"/>
    <circle class="ring" cx="70" cy="70" r=${r} fill="none" stroke=${color} stroke-width="9" stroke-linecap="round" stroke-dasharray=${`${v * C} ${C}`} style=${{ '--C': C, '--v': v * C, animation: `ring-in 1s var(--ease) ${delay}ms backwards` }}/></g>`;
}

export function YearCard({ api, tz, now, look }) {
  const [ref, seen] = useInView();
  const range = useMemo(() => makeRange('12m', tz, null, now), [tz, now]);
  const { data, error, retry } = useApi(api, `/api/v0/stats/total?${q({ start: range.start, end: range.end })}`, { ttl: 6 * 3600_000, enabled: seen });
  const [note, setNote] = useState('');
  const [goal, setGoal] = useState(() => readGoal(api));
  const scroller = useRef(null);

  const calc = useMemo(() => {
    if (!data) return null;
    const by = new Map((data.stats || []).map((s) => [s.day, s.daily || 0]));
    const list = dayList(range.from, range.to).map((d) => ({ d, v: by.get(d) || 0 }));
    const lvl = levels(list.map((x) => x.v));
    // weeks start on Sunday
    const pad = weekdayOf(range.from);
    const weeks = []; let col = Array(pad).fill(null);
    for (const x of list) { col.push({ ...x, l: lvl(x.v) }); if (col.length === 7) { weeks.push(col); col = []; } }
    if (col.length) weeks.push([...col, ...Array(7 - col.length).fill(null)]);
    let best = list[0], active = 0, longest = 0, run = 0;
    for (const x of list) { if (x.v > best.v) best = x; if (x.v > 0) { active++; run++; longest = Math.max(longest, run); } else run = 0; }
    let cur = 0, i = list.length - 1;
    if (list[i] && list[i].v === 0) i--; // today may simply not have started yet
    for (; i >= 0 && list[i].v > 0; i--) cur++;
    const month = range.today.slice(0, 7), thisMonth = list.filter((x) => x.d.startsWith(month)), monthTotal = thisMonth.reduce((a, x) => a + x.v, 0);
    const prevMonthKey = addDays(month + '-01', -1).slice(0, 7), lastMonth = list.filter((x) => x.d.startsWith(prevMonthKey)).reduce((a, x) => a + x.v, 0);
    const monthDays = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate(), elapsed = thisMonth.length;
    const activeThisMonth = thisMonth.filter((x) => x.v > 0).length;
    return { weeks, best, active, longest, cur, monthTotal, lastMonth, monthDays, elapsed, activeThisMonth, total: list.reduce((a, x) => a + x.v, 0), days: list.length };
  }, [data]);

  useEffect(() => { if (calc && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth; }, [calc]);
  const suggested = calc ? Math.max(100, Math.round((calc.lastMonth * 1.1) / 100) * 100) : 0;
  const g = goal || suggested;
  const pctGoal = calc && g ? calc.monthTotal / g : 0;
  const CELL = 13, GAP = 3, LEFT = 30, TOP = 18;

  return html`<section class="card span-12" ref=${ref} aria-label="Your year">
    <div class="card-h"><div><h2>Your year</h2><p class="sub">Visitors per day for the last 12 months</p></div></div>
    ${error ? html`<${ErrorBox} error=${error} retry=${retry} />` : !calc ? html`<${Skeleton} h=${200} r="12px" />` : html`
    <div class="year">
      <div class="year-main">
        <div class="cal-scroll" ref=${scroller} tabindex="0" role="region" aria-label="Calendar of daily visitors. Scroll sideways with the arrow keys.">
          <svg class="cal" width=${LEFT + calc.weeks.length * (CELL + GAP)} height=${TOP + 7 * (CELL + GAP)} role="img" aria-label=${`Calendar of daily visitors. ${calc.active} active days, longest streak ${calc.longest} days.`}>
            ${['Mon', 'Wed', 'Fri'].map((n, i) => html`<text key=${n} x="0" y=${TOP + (i * 2 + 1) * (CELL + GAP) + CELL - 2} class="cal-t">${n}</text>`)}
            ${calc.weeks.map((w, wi) => { const first = w.find(Boolean); const showM = first && (wi === 0 || first.d.slice(8) <= '07') && (wi === 0 || calc.weeks[wi - 1].find(Boolean).d.slice(5, 7) !== first.d.slice(5, 7)); return showM ? html`<text key=${'m' + wi} x=${LEFT + wi * (CELL + GAP)} y="10" class="cal-t">${labelDay(first.d).split(' ')[0]}</text>` : null; })}
            ${calc.weeks.map((w, wi) => w.map((c, di) => c ? html`<rect key=${c.d} class=${'cell l' + c.l} x=${LEFT + wi * (CELL + GAP)} y=${TOP + di * (CELL + GAP)} width=${CELL} height=${CELL} rx=${look === 'nova' ? 4 : 2} style=${{ '--hc': `var(--heat-${c.l})`, animationDelay: Math.min(900, wi * 12) + 'ms' }} onPointerEnter=${() => setNote(`${labelDay(c.d, true)}: ${fmtFull(c.v)} visitors`)} onPointerLeave=${() => setNote('')}/>` : null))}
          </svg>
        </div>
        <div class="cal-foot"><span class="sky-note" aria-live="polite">${note || ' '}</span><span class="cal-legend" aria-hidden="true">Less ${[0, 1, 2, 3, 4].map((l) => html`<i key=${l} style=${{ background: `var(--heat-${l})` }}></i>`)} More</span></div>
        <div class="streaks">
          <div><b class="num">${calc.cur}</b><span>day streak now</span></div>
          <div><b class="num">${calc.longest}</b><span>longest streak</span></div>
          <div><b class="num">${calc.active}</b><span>active days of ${calc.days}</span></div>
          <div><b class="num">${fmtNum(calc.best.v)}</b><span>best day, ${labelDay(calc.best.d, calc.best.d.slice(0, 4) !== now.toISOString().slice(0, 4))}</span></div>
        </div>
      </div>
      <div class="goal">
        <svg viewBox="0 0 140 140" class="rings" role="img" aria-label=${`This month: ${Math.round(pctGoal * 100)} percent of the goal, ${calc.activeThisMonth} of ${calc.elapsed} days active, streak ${calc.cur} of ${calc.longest} days`}>
          <${Ring} r=${60} value=${pctGoal} color="var(--c1)" delay=${0} />
          <${Ring} r=${47} value=${calc.elapsed ? calc.activeThisMonth / calc.elapsed : 0} color="var(--c2)" delay=${120} />
          <${Ring} r=${34} value=${calc.longest ? calc.cur / calc.longest : 0} color="var(--c3)" delay=${240} />
        </svg>
        <div class="goal-ctr"><b class="num">${Math.round(pctGoal * 100)}%</b><span>of goal</span></div>
        <ul class="goal-key">
          <li><i style=${{ background: 'var(--c1)' }}></i>Month so far <b class="num">${fmtFull(calc.monthTotal)}</b> of</li>
          <li class="goal-edit"><label><span class="sr">Monthly goal</span><input type="number" min="1" step="100" value=${g} onChange=${(e) => { const v = Math.round(+e.target.value) || 0; setGoal(v); writeGoal(api, v); }} /></label>${goal ? html`<button type="button" class="linkbtn" onClick=${() => { setGoal(0); writeGoal(api, 0); }}>reset</button>` : html`<span class="hint">suggested</span>`}</li>
          <li><i style=${{ background: 'var(--c2)' }}></i>Active days <b class="num">${calc.activeThisMonth}/${calc.elapsed}</b></li>
          <li><i style=${{ background: 'var(--c3)' }}></i>Streak <b class="num">${calc.cur}/${calc.longest}</b></li>
        </ul>
      </div>
    </div>`}
  </section>`;
}
