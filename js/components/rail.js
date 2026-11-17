import { html, useState, useEffect } from '../ui.js';

// The sections of the page. Each one starts at an invisible marker (see Anchor) placed in the layout.
export const SECTIONS = [
  ['overview', 'Overview'], ['traffic', 'Traffic'],
  ['audience', 'Audience'], ['rhythm', 'Rhythm'], ['tech', 'Tech'],
];

export const Anchor = ({ id }) => html`<span class="anchor" id=${'sec-' + id} aria-hidden="true"></span>`;

const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

// A numbered rail on the left: the current section is underlined and shows its name.
export function SectionRail() {
  const [active, setActive] = useState(SECTIONS[0][0]);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      let cur = SECTIONS[0][0];
      const bottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      if (bottom) cur = SECTIONS[SECTIONS.length - 1][0];
      else for (const [id] of SECTIONS) { const el = document.getElementById('sec-' + id); if (el && el.getBoundingClientRect().top <= innerHeight * 0.4) cur = id; }
      setActive(cur);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    addEventListener('scroll', on, { passive: true }); addEventListener('resize', on);
    const t = setTimeout(read, 1200); // cards above can change the height once their data arrives
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); clearTimeout(t); cancelAnimationFrame(raf); };
  }, []);
  const go = (id) => (e) => { e.preventDefault(); const el = document.getElementById('sec-' + id); if (el) el.scrollIntoView({ behavior: smooth(), block: 'start' }); };
  return html`<nav class="rail" aria-label="Sections"><ol>${SECTIONS.map(([id, label], i) => html`<li key=${id}><a href=${'#sec-' + id} class=${active === id ? 'on' : ''} aria-current=${active === id ? 'true' : null} onClick=${go(id)} aria-label=${label}><span class="n">0${i + 1}</span><span class="t" aria-hidden="true">${label}</span></a></li>`)}</ol></nav>`;
}
