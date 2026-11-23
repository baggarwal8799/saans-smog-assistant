import { type ComponentType, lazy, type LazyExoticComponent } from 'react';

import { t } from '../../core/i18n.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';

function PartUnavailable() {
  const lang = useCurrentLang();
  return (
    <p role="alert" className="error">
      {t(lang, 'partFailed')}
    </p>
  );
}

/** React.lazy, but a failed chunk fetch renders PartUnavailable instead of throwing: one section lost, not the page. */
export function lazyPart<P extends object>(
  load: () => Promise<ComponentType<P>>,
): LazyExoticComponent<ComponentType<P>> {
  const fallback: ComponentType<P> = PartUnavailable;
  return lazy(async () => {
    try {
      return { default: await load() };
    } catch {
      return { default: fallback };
    }
  });
}
