import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollIntoViewRespectingMotion } from './scrollIntoView';

function element() {
  const scroll = vi.fn();
  return { el: { scrollIntoView: scroll } as unknown as Element, scroll };
}
const prefersReduced = (matches: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches }) as MediaQueryList),
  );

afterEach(() => vi.unstubAllGlobals());

describe('scrollIntoViewRespectingMotion', () => {
  it('jumps without animation when the person asked for reduced motion', () => {
    prefersReduced(true);
    const { el, scroll } = element();
    scrollIntoViewRespectingMotion(el, 'start');
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('scrolls smoothly otherwise', () => {
    prefersReduced(false);
    const { el, scroll } = element();
    scrollIntoViewRespectingMotion(el, 'nearest');
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });

  it('does nothing, without throwing, for a missing element or one that cannot scroll', () => {
    prefersReduced(false);
    expect(() => scrollIntoViewRespectingMotion(null, 'start')).not.toThrow();
    expect(() => scrollIntoViewRespectingMotion({} as Element, 'start')).not.toThrow();
  });
});
