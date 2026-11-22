import { lazy, type ComponentType } from 'react';
import { t } from '../lib/i18n';
import type { Lang } from '../lib/types';

/** Shown in place of a part whose chunk could not be fetched (the connection dropped after the first load). */
function PartUnavailable({ lang }: { lang: Lang }) {
  return (
    <p role="alert" className="error">
      {t(lang, 'partFailed')}
    </p>
  );
}

/**
 * React.lazy for a component chunk. A failed fetch renders PartUnavailable instead of throwing: there is no error
 * boundary above these parts, and a thrown chunk error would blank the whole page rather than one section.
 */
export function lazyPart<P extends { lang: Lang }>(load: () => Promise<ComponentType<P>>) {
  return lazy(async () => {
    try {
      return { default: await load() };
    } catch {
      return { default: PartUnavailable as ComponentType<P> };
    }
  });
}
