import type { ReactElement } from 'react';

import { aqiLevel } from '../../core/aqi.js';
import { cautious } from '../../core/concern.js';
import { weatherFigure } from '../../core/figures.js';
import { aqiKey, formatNumber, type MessageKey, pollutantKey, t, tn } from '../../core/i18n.js';
import { placeLabel } from '../../core/place.js';
import { spanLabel } from '../../core/spans.js';
import type { AirReport, Lang, Plan, Pollutant, TimeWindow } from '../../core/types.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';
import { bestLabels } from '../lib/windowLabels.js';
import { AirRibbon } from './AirRibbon.js';

interface Props {
  report: AirReport;
  plan: Plan;
}

/** A window's levels are its own averages, and the text says so. */
function windowText(lang: Lang, w: TimeWindow, now: string): string {
  const levels = [`PM2.5 ≈ ${formatNumber(lang, w.avgPm25)}`];
  if (w.avgO3 !== undefined) levels.push(`${t(lang, 'ozone')} ≈ ${formatNumber(lang, w.avgO3)}`);
  return `${spanLabel(w, now)[lang]} (${t(lang, 'windowAvg')}: ${levels.join(', ')} µg/m³)`;
}

/**
 * The averaging period behind the US AQI number, which follows its main pollutant (US EPA): particles use the past
 * 24 h, ozone the past 8 h, NO₂ the current hour. The cigarette figure uses a different one, the next 24 h forecast.
 */
const AQI_BASIS: Record<Pollutant, MessageKey> = {
  pm25: 'aqiBasis',
  pm10: 'aqiBasis',
  o3: 'aqiBasisO3',
  no2: 'aqiBasisNo2',
};

export function AirNow({ report, plan }: Readonly<Props>): ReactElement {
  const lang = useCurrentLang();
  const { current } = report;
  return (
    <section aria-labelledby="air-heading" className="air-now">
      <h2 id="air-heading" tabIndex={-1} className="air-place">
        {t(lang, 'airHeadingFor', { place: placeLabel(report.place) })}
      </h2>
      <AirReading report={report} plan={plan} />
      <AirForecast report={report} plan={plan} />
      {plan.smogTrap && <SmogTrap trap={plan.smogTrap} now={current.time} />}
      <p className="note air-updated">
        {t(lang, 'windowBasis')} {t(lang, 'updated')}:{' '}
        <time dateTime={current.time}>{current.time.replace('T', ' ')}</time>
      </p>
    </section>
  );
}

function AirReading({ report, plan }: Readonly<Props>) {
  const lang = useCurrentLang();
  const { current } = report;
  const level = aqiLevel(current.usAqi);
  return (
    <div className="air-reading">
      <div className="reading">
        <p className={`aqi-badge aqi-${level}`}>
          <span className="aqi-value">{Math.round(current.usAqi)}</span>
          <span className="aqi-scale">{t(lang, 'usAqi')}</span>
        </p>
        <div className="reading-words">
          <p className="aqi-label">{t(lang, aqiKey(level))}</p>
          <p className="aqi-basis">{t(lang, current.dominant ? AQI_BASIS[current.dominant] : 'aqiBasis')}</p>
          <p className="cigarettes">{tn(lang, 'cigarettes', plan.cigarettesPerDay)}</p>
          {current.dominant && (
            <p className="dominant">
              {t(lang, 'mainPollutant')}: <strong>{t(lang, pollutantKey(current.dominant))}</strong>
            </p>
          )}
        </div>
      </div>
      <p className="note metrics-basis">{t(lang, 'metricsBasis')}</p>
      <Metrics current={current} />
      {(current.dominant === 'pm25' || current.dominant === 'pm10') && <p className="note">{t(lang, 'aqiNote')}</p>}
    </div>
  );
}

function Metrics({ current }: Readonly<{ current: AirReport['current'] }>) {
  const lang = useCurrentLang();
  const metrics = [
    { key: 'pm25', value: current.pm25 },
    { key: 'pm10', value: current.pm10 },
    { key: 'no2', value: current.no2 },
    { key: 'o3', value: current.o3 },
  ] as const;
  return (
    <dl className="metrics">
      {metrics.map((m) => (
        <div key={m.key}>
          <dt>{t(lang, m.key)}</dt>
          <dd>
            {Number.isNaN(m.value) ? '—' : formatNumber(lang, m.value)} <span className="unit">µg/m³</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AirForecast({ report, plan }: Readonly<Props>) {
  const lang = useCurrentLang();
  const now = report.current.time;
  // "Stay in" only when the plan says so; otherwise the dirtiest hours are just the least clean.
  const stayIn = cautious(plan.concern);
  const bestKey = bestLabels(plan.bestWindow, { avoidAllOutdoors: plan.avoidAllOutdoors }).window;
  return (
    <div className="air-forecast">
      <AirRibbon hours={report.hourly.slice(1)} best={plan.bestWindow} worst={plan.worstWindow} stayIn={stayIn} />
      <ul className="windows">
        <li className="window good">
          <strong>{t(lang, bestKey)}:</strong>{' '}
          {plan.bestWindow ? windowText(lang, plan.bestWindow, now) : t(lang, 'noWindow')}
        </li>
        {plan.worstWindow && (
          <li className="window bad">
            <strong>{t(lang, stayIn ? 'worstWindow' : 'worstWindowCalm')}:</strong>{' '}
            {windowText(lang, plan.worstWindow, now)}
          </li>
        )}
      </ul>
    </div>
  );
}

function SmogTrap({ trap, now }: Readonly<{ trap: NonNullable<Plan['smogTrap']>; now: string }>) {
  const lang = useCurrentLang();
  return (
    <p className="trap">
      <strong>{t(lang, 'trapTitle')}</strong>{' '}
      {t(lang, 'trapBody', {
        when: spanLabel(trap, now)[lang],
        wind: weatherFigure('wind', trap.avgWindKmh)[lang],
        mixing: weatherFigure('mixing', trap.minMixingM)[lang],
      })}
    </p>
  );
}
