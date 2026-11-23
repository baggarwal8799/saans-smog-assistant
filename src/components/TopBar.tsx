import type { ReactElement } from 'react';

import { t } from '../../core/i18n.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';

interface Props {
  switching: boolean;
  onToggleLang: () => void;
}

export function TopBar({ switching, onToggleLang }: Readonly<Props>): ReactElement {
  const lang = useCurrentLang();
  return (
    <header className="topbar">
      <p className="brand">
        <svg className="logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path d="M8 24c8-8 16 8 24 0s16 8 24 0M8 40c8-8 16 8 24 0s16 8 24 0" />
        </svg>
        <span className="brand-name">{t(lang, 'appName')}</span>
        <span className="brand-tagline">{t(lang, 'tagline')}</span>
      </p>
      <button type="button" className="ghost lang" onClick={onToggleLang} aria-busy={switching}>
        <span className="visually-hidden">{t(lang, 'language')}: </span>
        <span lang={lang === 'en' ? 'hi' : 'en'}>{t(lang, 'langName')}</span>
      </button>
    </header>
  );
}
