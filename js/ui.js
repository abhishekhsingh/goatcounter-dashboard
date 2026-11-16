// One import for everything UI related: Preact, hooks and the htm tagged template.
import { h, render, Fragment, createContext } from 'preact';
import { useState, useEffect, useRef, useMemo, useCallback, useContext, useLayoutEffect } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, Fragment, createContext, useState, useEffect, useRef, useMemo, useCallback, useContext, useLayoutEffect };

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Fires once when the element nears the viewport (used to load lower cards late).
export function useInView(rootMargin = '300px') {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return [ref, seen];
}
