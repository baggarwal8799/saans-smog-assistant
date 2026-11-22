import { useCallback, useEffect, useMemo, useState } from 'react';
import { SkyBand } from './components/SkyBand';
import { TopBar } from './components/TopBar';
import { useLanguage } from './components/useLanguage';
import { preloadAssistant, Workspace } from './components/Workspace';
import { useRevealOnLoad } from './hooks/scrollIntoView';
import { useAirReport } from './hooks/useAirReport';
import { useHousehold } from './hooks/useHousehold';
import { t } from './lib/i18n';
import { loadPlace, savePlace } from './lib/profile';
import { buildPlan } from './lib/recommend';
import type { Lang, Place } from './lib/types';

/** The chosen place and its air report. Picking a place brings the report into view once it loads. */
function useAirForPlace() {
  const [place, setPlace] = useState<Place | null>(loadPlace);
  const { air, retry } = useAirReport(place);
  const report = air.kind === 'ready' ? air.report : null;
  // Armed when the user picks a place, so the result is brought into view once it loads (on phones it renders below
  // the household form, and nothing would visibly happen otherwise).
  const revealOnLoad = useRevealOnLoad(report, 'air-heading');
  const choosePlace = useCallback(
    (p: Place) => {
      revealOnLoad();
      setPlace(p);
    },
    [revealOnLoad],
  );

  useEffect(() => {
    if (!place) return;
    savePlace(place);
    preloadAssistant();
  }, [place]);

  return { place, choosePlace, air, report, retry };
}

export function App() {
  const { lang, switching, toggle: toggleLang } = useLanguage();
  const { place, choosePlace, air, report, retry } = useAirForPlace();
  const { household, sample, editProfile } = useHousehold(place?.country);
  const plan = useMemo(() => (report ? buildPlan(report, household, lang) : null), [report, household, lang]);

  return (
    <>
      <a className="skip-link" href="#main">
        {t(lang, 'skip')}
      </a>
      <TopBar lang={lang} switching={switching} onToggleLang={toggleLang} />
      <main id="main" tabIndex={-1}>
        <h1 className="visually-hidden">
          {t(lang, 'appName')}: {t(lang, 'tagline')}
        </h1>
        <SkyBand lang={lang} place={place} onSelectPlace={choosePlace} air={air} plan={plan} onRetry={retry} />
        {place && (
          <Workspace
            lang={lang}
            place={place}
            household={household}
            sample={sample}
            onEditProfile={editProfile}
            report={report}
            plan={plan}
            loading={air.kind === 'loading'}
          />
        )}
      </main>
      <SiteFooter lang={lang} />
    </>
  );
}

function SiteFooter({ lang }: Readonly<{ lang: Lang }>) {
  return (
    <footer className="site-footer">
      <p>{t(lang, 'disclaimer')}</p>
      <p className="note">{t(lang, 'sources')}</p>
    </footer>
  );
}
