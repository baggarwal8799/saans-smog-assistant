import { useCallback, useEffect, useState } from 'react';
import { isLangReady, loadDictionary, t } from '../lib/i18n';
import { loadLang, saveLang } from '../lib/profile';
import type { Lang } from '../lib/types';

/**
 * The interface language. A language switches only once its dictionary is in memory, so the page never shows a mix
 * of languages or a lang attribute that does not match the text; while the Hindi chunk loads, the toggle reports
 * aria-busy and the page stays as it is. main.tsx preloads Hindi for people who saved it, so they start in Hindi.
 */
export function useLanguage(): { lang: Lang; switching: boolean; toggle: () => void } {
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
    if (isLangReady(next)) return apply();
    // One fetch at a time; a failed one (offline) leaves English in place and the next click tries again.
    if (switching) return;
    setSwitching(true);
    loadDictionary(next)
      .then(apply, () => undefined)
      .finally(() => setSwitching(false));
  }, [lang, switching]);

  return { lang, switching, toggle };
}
