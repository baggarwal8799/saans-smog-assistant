import { type ReactElement, useMemo } from 'react';

import { t } from '../core/i18n.js';
import { buildPlan } from '../core/recommend.js';
import { SiteFooter } from './components/SiteFooter.js';
import { SkyBand } from './components/SkyBand.js';
import { TopBar } from './components/TopBar.js';
import { Workspace } from './components/Workspace.js';
import { useAirForPlace } from './hooks/useAirForPlace.js';
import { LanguageContext } from './hooks/useCurrentLang.js';
import { useHousehold } from './hooks/useHousehold.js';
import { useLanguageState } from './hooks/useLanguageState.js';

export function App(): ReactElement {
  const { lang, switching, toggle: toggleLang } = useLanguageState();
  const { place, choosePlace, air, report, retry } = useAirForPlace();
  const { household, sample, editProfile } = useHousehold(place?.country);
  const plan = useMemo(() => (report ? buildPlan(report, household, lang) : null), [report, household, lang]);

  return (
    <LanguageContext value={lang}>
      <a className="skip-link" href="#main">
        {t(lang, 'skip')}
      </a>
      <TopBar switching={switching} onToggleLang={toggleLang} />
      <main id="main" tabIndex={-1}>
        <h1 className="visually-hidden">
          {t(lang, 'appName')}: {t(lang, 'tagline')}
        </h1>
        <SkyBand place={place} onSelectPlace={choosePlace} air={air} plan={plan} onRetry={retry} />
        {place && (
          <Workspace
            place={place}
            household={{ profile: household, sample, onEdit: editProfile }}
            results={{ report, plan, loading: air.kind === 'loading' }}
          />
        )}
      </main>
      <SiteFooter />
    </LanguageContext>
  );
}
