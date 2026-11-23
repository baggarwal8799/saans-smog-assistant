import { useCallback, useEffect, useRef } from 'react';

export function scrollIntoViewRespectingMotion(el: Element | null | undefined, block: ScrollLogicalPosition): void {
  // jsdom and older browsers lack matchMedia and scrollIntoView, though the DOM types say they always exist.
  const win: Partial<Pick<typeof globalThis, 'matchMedia'>> = globalThis;
  const reduce = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const target: Partial<Pick<Element, 'scrollIntoView'>> | null | undefined = el;
  target?.scrollIntoView?.({ block, behavior: reduce ? 'auto' : 'smooth' });
}

/** Acts only once armed, so a value that was already there on load never scrolls the page or moves focus. */
export function useRevealOnLoad(value: unknown, id: string): () => void {
  const armed = useRef(false);
  useEffect(() => {
    if (!value || !armed.current) return;
    armed.current = false;
    const el = document.getElementById(id);
    scrollIntoViewRespectingMotion(el, 'start');
    el?.focus({ preventScroll: true });
  }, [value, id]);
  return useCallback(() => {
    armed.current = true;
  }, []);
}
