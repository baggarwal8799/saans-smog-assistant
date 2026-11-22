import { useCallback, useEffect, useRef } from 'react';

/** Scroll an element into view, smoothly unless the person asked the system for reduced motion. */
export function scrollIntoViewRespectingMotion(el: Element | null | undefined, block: ScrollLogicalPosition): void {
  // jsdom and older browsers lack matchMedia and scrollIntoView, though the DOM types say they always exist.
  const win = globalThis as Partial<Pick<typeof globalThis, 'matchMedia'>>;
  const reduce = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const target = el as Partial<Pick<Element, 'scrollIntoView'>> | null | undefined;
  target?.scrollIntoView?.({ block, behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * Once armed, the next time `value` changes to something truthy, scroll the element with `id` into view and move
 * focus to it. Returns the function that arms it.
 */
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
