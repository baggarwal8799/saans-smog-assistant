import type { ReactElement } from 'react';

import { aqiLevel } from '../../core/aqi.js';
import { t } from '../../core/i18n.js';
import type { Place, Plan } from '../../core/types.js';
import type { AirState } from '../hooks/useAirReport.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';
import { AirNow } from './AirNow.js';
import { LocationPicker } from './LocationPicker.js';
import { AirSkeleton } from './Skeleton.js';

interface Props {
  place: Place | null;
  onSelectPlace: (place: Place) => void;
  air: AirState;
  plan: Plan | null;
  onRetry: () => void;
}

/** The band takes the colour of the air, so the page shows how bad it is today. */
export function SkyBand({ place, onSelectPlace, air, plan, onRetry }: Readonly<Props>): ReactElement {
  const lang = useCurrentLang();
  const report = air.kind === 'ready' ? air.report : null;
  return (
    <div className={`sky sky-${report ? aqiLevel(report.current.usAqi) : 'none'}`}>
      <div className="sky-inner">
        <LocationPicker selected={place} onSelect={onSelectPlace} />
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
        {report && plan && <AirNow report={report} plan={plan} />}
      </div>
    </div>
  );
}
