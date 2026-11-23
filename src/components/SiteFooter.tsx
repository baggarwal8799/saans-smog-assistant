import type { ReactElement } from 'react';

import { t } from '../../core/i18n.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';

export function SiteFooter(): ReactElement {
  const lang = useCurrentLang();
  return (
    <footer className="site-footer">
      <p>{t(lang, 'disclaimer')}</p>
      <p className="note">{t(lang, 'sources')}</p>
    </footer>
  );
}
