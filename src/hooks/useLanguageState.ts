import { useCallback, useEffect, useState } from 'react';

import { isLangReady, loadDictionary, t } from '../../core/i18n.js';
import type { Lang } from '../../core/types.js';
import { loadLang, saveLang } from '../lib/storage.js';

/**
 * A language switches only once its dictionary is in memory, so the page never mixes languages or carries a lang
 * attribute that does not match the text. Meanwhile the toggle reports aria-busy. Owned once, by App, which provides
 * the language through LanguageContext; components read it with useCurrentLang.
 */
export function useLanguageState(): { lang: Lang; switching: boolean; toggle: () => void } {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = loadLang();
    return isLangReady(saved) ? saved : 'en';
  });
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t(lang, 'appName')} · ${t(lang, 'tagline')}`;
  }, [lang]);

  const toggle = useCallback(() => {
    const next: Lang = lang === 'en' ? 'hi' : 'en';
    const apply = () => {
      saveLang(next);
      setLang(next);
    };
    if (isLangReady(next)) {
      apply();
      return;
    }
    // One fetch at a time; a failed one (offline) leaves English in place and the next click tries again.
    if (switching) return;
    setSwitching(true);
    loadDictionary(next)
      .then(apply, () => undefined)
      .finally(() => setSwitching(false));
  }, [lang, switching]);

  return { lang, switching, toggle };
}
