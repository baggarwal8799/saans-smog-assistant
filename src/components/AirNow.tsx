import { aqiLevel } from '../lib/aqi';
import { bestLabels, cautious } from '../lib/concern';
import { placeLabel } from '../lib/geo';
import { aqiKey, formatNumber, pollutantKey, t, tn, type MessageKey } from '../lib/i18n';
import { weatherFigure } from '../lib/plan/figures';
import { spanLabel } from '../lib/plan/spans';
import type { AirReport, Lang, Plan, TimeWindow } from '../lib/types';
import { AirRibbon } from './AirRibbon';

interface Props {
  lang: Lang;
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
const AQI_BASIS: Record<string, MessageKey> = { o3: 'aqiBasisO3', no2: 'aqiBasisNo2' };

export function AirNow({ lang, report, plan }: Props) {
  const { current } = report;
  const level = aqiLevel(current.usAqi);
  // "Stay in" only on days the plan itself tells people to stay in; otherwise the dirtiest hours are just the least clean.
  const stayIn = cautious(plan.concern);
  const metrics = [
    { key: 'pm25', value: current.pm25 },
    { key: 'pm10', value: current.pm10 },
    { key: 'no2', value: current.no2 },
    { key: 'o3', value: current.o3 },
  ] as const;

  return (
    <section aria-labelledby="air-heading" className="air-now">
      <h2 id="air-heading" tabIndex={-1} className="air-place">
        {t(lang, 'airHeadingFor', { place: placeLabel(report.place) })}
      </h2>

      <div className="air-reading">
      <div className="reading">
        <p className={`aqi-badge aqi-${level}`}>
          <span className="aqi-value">{Math.round(current.usAqi)}</span>
          <span className="aqi-scale">{t(lang, 'usAqi')}</span>
        </p>
        <div className="reading-words">
          <p className="aqi-label">{t(lang, aqiKey(level))}</p>
          <p className="aqi-basis">{t(lang, AQI_BASIS[current.dominant ?? ''] ?? 'aqiBasis')}</p>
          <p className="cigarettes">{tn(lang, 'cigarettes', plan.cigarettesPerDay)}</p>
          {current.dominant && (
            <p className="dominant">
              {t(lang, 'mainPollutant')}: <strong>{t(lang, pollutantKey(current.dominant))}</strong>
            </p>
          )}
        </div>
      </div>

      <p className="note metrics-basis">{t(lang, 'metricsBasis')}</p>
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
      {(current.dominant === 'pm25' || current.dominant === 'pm10') && <p className="note">{t(lang, 'aqiNote')}</p>}
      </div>

      <div className="air-forecast">
      <AirRibbon lang={lang} hours={report.hourly.slice(1)} best={plan.bestWindow} worst={plan.worstWindow} stayIn={stayIn} />

      <ul className="windows">
        <li className="window good">
          <strong>{t(lang, bestLabels(plan.bestWindow, plan.avoidAllOutdoors).window)}:</strong> {plan.bestWindow ? windowText(lang, plan.bestWindow, current.time) : t(lang, 'noWindow')}
        </li>
        {plan.worstWindow && (
          <li className="window bad">
            <strong>{t(lang, stayIn ? 'worstWindow' : 'worstWindowCalm')}:</strong> {windowText(lang, plan.worstWindow, current.time)}
          </li>
        )}
      </ul>
      </div>
      {plan.smogTrap && (
        <p className="trap">
          <strong>{t(lang, 'trapTitle')}</strong>{' '}
          {t(lang, 'trapBody', {
            when: spanLabel(plan.smogTrap, current.time)[lang],
            wind: weatherFigure('wind', plan.smogTrap.avgWindKmh)[lang],
            mixing: weatherFigure('mixing', plan.smogTrap.minMixingM)[lang],
          })}
        </p>
      )}
      <p className="note air-updated">
        {t(lang, 'windowBasis')} {t(lang, 'updated')}: <time dateTime={current.time}>{current.time.replace('T', ' ')}</time>
      </p>
    </section>
  );
}
