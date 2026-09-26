import { useCallback, useEffect, useRef, useState } from 'react';
import { COPY } from './copy.js';
import { MODEL_DISCLAIMER } from '../engine/index.js';

const C = COPY.science;

/**
 * "For scientists": the technical part of the page, collapsed by default. It opens by itself when the address
 * (on load or on hashchange) or an in-page link points at anything inside it, so old deep links (#real, #fails,
 * #body, #video, #credits, #exp-h) keep working. `refresh` changes when late content arrives (the lab in detail
 * needs the circuit), so a deep link to it is honoured once it exists.
 */
export default function ForScientists({ children, reducedMotion, refresh }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const bodyRef = useRef(null);

  const inside = useCallback((id) => {
    if (!id || !bodyRef.current) return false;
    const el = document.getElementById(id);
    return !!el && bodyRef.current.contains(el);
  }, []);

  const fromHash = useCallback(() => {
    let id = '';
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { id = window.location.hash.slice(1); }
    if (inside(id)) {
      setOpen(true);
      setTarget({ id, t: Date.now() });
    }
  }, [inside]);

  // the address on load (and again once late content has rendered), and every later change of it
  useEffect(() => { fromHash(); }, [fromHash, refresh]);
  useEffect(() => {
    window.addEventListener('hashchange', fromHash);
    // a link to the id already in the address fires no hashchange: catch the click as well
    const onClick = (e) => {
      const a = e.target.closest?.('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const id = a.getAttribute('href').slice(1);
      if (inside(id)) {
        setOpen(true);
        setTarget({ id, t: Date.now() });
      }
    };
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', fromHash);
      document.removeEventListener('click', onClick);
    };
  }, [fromHash, inside]);

  // once open, bring the linked block into view and move keyboard focus there
  useEffect(() => {
    if (!open || !target) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(target.id);
      if (!el) return;
      // a long way off (the body was hidden a moment ago): jump rather than glide through the whole page
      const far = Math.abs(el.getBoundingClientRect().top) > 2 * window.innerHeight;
      el.scrollIntoView({ block: 'start', behavior: reducedMotion || far ? 'auto' : 'smooth' });
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, target, reducedMotion]);

  return (
    <section id="science" className="section science" aria-labelledby="science-h">
      <div className="section__inner">
        <h2 id="science-h" className="section__h">{C.h}</h2>
        <p className="section__lede">{C.lede}</p>
        <button
          type="button"
          className="btn science__toggle"
          aria-expanded={open}
          aria-controls="science-body"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? C.hide : C.show}
        </button>
      </div>
      <div id="science-body" className="science__body" ref={bodyRef} hidden={!open}>
        <div className="section__inner">
          <p className="intro__note science__note">{MODEL_DISCLAIMER}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
