import type { AirState } from '../hooks/useAirReport';
import { aqiLevel } from '../lib/aqi';
import { t } from '../lib/i18n';
import type { Lang, Place, Plan } from '../lib/types';
import { AirNow } from './AirNow';
import { LocationPicker } from './LocationPicker';
import { AirSkeleton } from './Skeleton';

interface Props {
  lang: Lang;
  place: Place | null;
  onSelectPlace: (place: Place) => void;
  air: AirState;
  plan: Plan | null;
  onRetry: () => void;
}

/** The place picker and today's air. The band takes the colour of the air, so the page shows how bad it is today. */
export function SkyBand({ lang, place, onSelectPlace, air, plan, onRetry }: Readonly<Props>) {
  const report = air.kind === 'ready' ? air.report : null;
  return (
    <div className={`sky sky-${report ? aqiLevel(report.current.usAqi) : 'none'}`}>
      <div className="sky-inner">
        <LocationPicker lang={lang} selected={place} onSelect={onSelectPlace} />
        {air.kind === 'loading' && (
          <div className="air-loading" role="status" aria-busy="true">
            <span className="visually-hidden">{t(lang, 'loadingAir')}</span>
            <AirSkeleton />
          </div>
        )}
        {air.kind === 'error' && (
          <div className="air-error" role="alert">
            <p className="error">{t(lang, 'airError')}</p>
            <button type="button" onClick={onRetry}>
              {t(lang, 'retry')}
            </button>
          </div>
        )}
        {report && plan && <AirNow lang={lang} report={report} plan={plan} />}
      </div>
    </div>
  );
}
