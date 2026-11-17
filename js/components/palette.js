import { html, useState, useEffect, useRef, useMemo } from '../ui.js';

// Command palette: type to filter, arrow keys to move, Enter to run. Opens with / or Ctrl/Cmd+K.
const score = (q, text) => {
  if (!q) return 1;
  const t = text.toLowerCase(); let i = 0, s = 0, last = -2;
  for (const ch of q) { const k = t.indexOf(ch, i); if (k < 0) return 0; s += k === last + 1 ? 3 : 1; last = k; i = k + 1; }
  return s + (t.startsWith(q) ? 10 : 0) + (t.includes(q) ? 6 : 0);
};

export function Palette({ open, onClose, commands }) {
  const dlg = useRef(null), inp = useRef(null), list = useRef(null);
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.map((c) => ({ c, s: score(q, c.label + ' ' + c.group) })).filter((x) => x.s > 0).sort((a, b) => (q ? b.s - a.s : 0)).map((x) => x.c);
  }, [query, commands]);
  useEffect(() => {
    const d = dlg.current; if (!d) return;
    if (open && !d.open) { setQuery(''); setIdx(0); d.showModal(); setTimeout(() => inp.current && inp.current.focus(), 0); }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => { setIdx(0); }, [query]);
  useEffect(() => { const el = list.current && list.current.children[idx]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }, [idx]);
  const run = (c) => { onClose(); setTimeout(() => c.run(), 30); };
  const key = (e) => {
    if (e.key === 'ArrowDown') { setIdx((i) => Math.min(results.length - 1, i + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setIdx((i) => Math.max(0, i - 1)); e.preventDefault(); }
    else if (e.key === 'Enter' && results[idx]) { run(results[idx]); e.preventDefault(); }
  };
  let lastGroup = '';
  return html`<dialog ref=${dlg} class="palette" aria-label="Command palette" onClose=${onClose} onCancel=${onClose} onClick=${(e) => { if (e.target === dlg.current) onClose(); }}>
    <div class="pal-in">
      <input ref=${inp} type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant=${results[idx] ? 'pal-' + results[idx].id : undefined} placeholder="Type a command or a section" value=${query} onInput=${(e) => setQuery(e.target.value)} onKeyDown=${key} autocomplete="off" spellcheck="false" />
      <ul id="pal-list" ref=${list} role="listbox">${results.length ? results.map((c, i) => { const head = c.group !== lastGroup ? ((lastGroup = c.group), html`<li class="pal-g" role="presentation">${c.group}</li>`) : null; return html`${head}<li key=${c.id} id=${'pal-' + c.id} role="option" aria-selected=${String(i === idx)} class=${i === idx ? 'on' : ''} onPointerMove=${() => setIdx(i)} onClick=${() => run(c)}><span>${c.label}</span>${c.keys ? html`<kbd>${c.keys}</kbd>` : null}</li>`; }) : html`<li class="pal-none" role="presentation">Nothing matches "${query}"</li>`}</ul>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></div>
    </div></dialog>`;
}

export function useShortcuts(map) {
  useEffect(() => {
    const f = (e) => {
      if (e.defaultPrevented) return;
      const t = e.target, typing = t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); map['mod+k'] && map['mod+k'](); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const fn = map[e.shiftKey && /^[a-z]$/.test(k) ? 'shift+' + k : k];
      if (fn) { e.preventDefault(); fn(); }
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  });
}
