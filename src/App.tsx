import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AirNow } from './components/AirNow';
import { lazyPart } from './components/lazyPart';
import { LocationPicker } from './components/LocationPicker';
import { PlanView } from './components/PlanView';
import { AirSkeleton, AnswerSkeleton, PlanSkeleton } from './components/Skeleton';
import { ProfileForm } from './components/ProfileForm';
import { useLanguage } from './components/useLanguage';
import { aqiLevel, fetchAirReport } from './lib/aqi';
import { t } from './lib/i18n';
import { hasSavedProfile, loadPlace, loadProfile, sampleProfile, savePlace, saveProfile } from './lib/profile';
import { buildPlan } from './lib/recommend';
import type { AirReport, Place, Profile } from './lib/types';

// Ask Saans (with its answer renderer and API client) is its own chunk. It is fetched as soon as a place is set, in
// parallel with the air data, so it is ready by the time the plan renders: no waterfall, and nothing on first paint.
const loadAssistant = () => import('./components/Assistant');
const Assistant = lazyPart(() => loadAssistant().then((m) => m.Assistant));

type AirState = { kind: 'none' } | { kind: 'loading' } | { kind: 'ready'; report: AirReport } | { kind: 'error' };
type AirResult = { key: string; report: AirReport } | { key: string; error: true };

export function App() {
  const { lang, switching, toggle: toggleLang } = useLanguage();
  const [profile, setProfile] = useState<Profile>(loadProfile);
  // Until the person edits the household, the plan says it is built on a sample one, and nothing is stored.
  const [sample, setSample] = useState(() => !hasSavedProfile());
  const editProfile = (p: Profile): void => {
    setSample(false);
    setProfile(p);
  };
  const [place, setPlace] = useState<Place | null>(loadPlace);
  // The sample household fits the country: an LPG cylinder in Delhi, piped gas in Los Angeles.
  const country = place?.country;
  const household = useMemo(() => (sample ? sampleProfile(country) : profile), [sample, country, profile]);
  const [result, setResult] = useState<AirResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = place ? `${place.lat},${place.lon}#${attempt}` : null;
  // Set when the user picks a place, so the result is brought into view once it loads (on phones it
  // renders below the household form, and nothing would visibly happen otherwise).
  const revealOnLoad = useRef(false);
  const choosePlace = useCallback((p: Place) => {
    revealOnLoad.current = true;
    setPlace(p);
  }, []);

  useEffect(() => {
    if (!sample) saveProfile(profile);
  }, [profile, sample]);

  useEffect(() => {
    if (!place || !requestKey) return;
    savePlace(place);
    void loadAssistant().catch(() => undefined);
    let cancelled = false;
    fetchAirReport(place)
      .then((report) => {
        if (!cancelled) setResult({ key: requestKey, report });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [place, requestKey]);

  // Loading is derived, not stored: any result for an older request means the new one is in flight.
  const air: AirState = !requestKey
    ? { kind: 'none' }
    : result?.key !== requestKey
      ? { kind: 'loading' }
      : 'report' in result
        ? { kind: 'ready', report: result.report }
        : { kind: 'error' };
  const report = air.kind === 'ready' ? air.report : null;

  useEffect(() => {
    if (!report || !revealOnLoad.current) return;
    revealOnLoad.current = false;
    const heading = document.getElementById('air-heading');
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    heading?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    heading?.focus({ preventScroll: true });
  }, [report]);
  const plan = useMemo(() => (report ? buildPlan(report, household, lang) : null), [report, household, lang]);
  // Remount the assistant whenever its inputs change, so an old answer never describes a different situation.
  const assistantKey = useMemo(
    () => (report && place ? JSON.stringify({ lang, place, profile: household, at: report.current.time }) : ''),
    [lang, place, household, report],
  );
  // Gemini explains the first plan at each place on its own. Household edits and the language toggle keep the
  // "Explain my plan" button instead, so clicking through the form never spends the free AI quota.
  const [summarized, setSummarized] = useState<ReadonlySet<string>>(() => new Set());
  const placeKey = place ? `${place.lat.toFixed(3)},${place.lon.toFixed(3)}` : '';

  return (
    <>
      <a className="skip-link" href="#main">
        {t(lang, 'skip')}
      </a>
      <header className="topbar">
        <p className="brand">
          <svg className="logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M8 24c8-8 16 8 24 0s16 8 24 0M8 40c8-8 16 8 24 0s16 8 24 0" />
          </svg>
          <span className="brand-name">{t(lang, 'appName')}</span>
          <span className="brand-tagline">{t(lang, 'tagline')}</span>
        </p>
        <button type="button" className="ghost lang" onClick={toggleLang} aria-busy={switching}>
          <span className="visually-hidden">{t(lang, 'language')}: </span>
          <span lang={lang === 'en' ? 'hi' : 'en'}>{t(lang, 'langName')}</span>
        </button>
      </header>

      <main id="main" tabIndex={-1}>
        <h1 className="visually-hidden">
          {t(lang, 'appName')}: {t(lang, 'tagline')}
        </h1>
        {/* The band takes the colour of the air, so the page itself shows how bad it is today. */}
        <div className={`sky sky-${report ? aqiLevel(report.current.usAqi) : 'none'}`}>
          <div className="sky-inner">
            <LocationPicker lang={lang} selected={place} onSelect={choosePlace} />
            {air.kind === 'loading' && (
              <div className="air-loading" role="status" aria-busy="true">
                <span className="visually-hidden">{t(lang, 'loadingAir')}</span>
                <AirSkeleton />
              </div>
            )}
            {air.kind === 'error' && (
              <div className="air-error" role="alert">
                <p className="error">{t(lang, 'airError')}</p>
                <button type="button" onClick={() => setAttempt((a) => a + 1)}>
                  {t(lang, 'retry')}
                </button>
              </div>
            )}
            {report && plan && <AirNow lang={lang} report={report} plan={plan} />}
          </div>
        </div>

        {place && (
          <div className="workspace">
            <div className="household-area">
              <ProfileForm lang={lang} profile={household} sample={sample} onChange={editProfile} />
            </div>
            {plan ? (
              <div className="plan-area">
                <PlanView lang={lang} plan={plan} />
              </div>
            ) : (
              air.kind === 'loading' && (
                <div className="plan-area">
                  <PlanSkeleton />
                </div>
              )
            )}
            {report && place && (
              <div className="ask-area">
                <Suspense fallback={<AnswerSkeleton />}>
                  <Assistant
                    key={assistantKey}
                    lang={lang}
                    place={place}
                    profile={household}
                    autoSummary={!summarized.has(placeKey)}
                    onAutoSummary={() => setSummarized((s) => new Set(s).add(placeKey))}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="site-footer">
        <p>{t(lang, 'disclaimer')}</p>
        <p className="note">{t(lang, 'sources')}</p>
      </footer>
    </>
  );
}
