import { useState } from 'react';
import { pm25Level } from '../lib/aqi';
import { bestLabels } from '../lib/concern';
import { formatHour } from '../lib/windows';
import { formatNumber, t } from '../lib/i18n';
import type { HourPoint, Lang, TimeWindow } from '../lib/types';

interface Props {
  lang: Lang;
  hours: readonly HourPoint[];
  best: TimeWindow | null;
  worst: TimeWindow | null;
  /** The plan tells people to stay in, so the worst hours may say so too. */
  stayIn: boolean;
}

const inWindow = (time: string, w: TimeWindow | null): boolean => w !== null && time >= w.start && time < w.end;

/**
 * The next 24 hours as a row of bars, one per hour: height is PM2.5, colour is its health band.
 * The bars are hidden from screen readers; the "Hourly numbers" table below gives every value as text.
 */
export function AirRibbon({ lang, hours, best, worst, stayIn }: Props) {
  // The table is built only once someone opens it: most visits never do, and it is 24 rows of DOM. It is too small
  // to be worth its own chunk (a request would cost more than its bytes), so only the rendering is deferred.
  const [tableOpen, setTableOpen] = useState(false);
  const day = hours.slice(0, 24);
  if (day.length === 0) return null;
  const max = Math.max(...day.map((h) => h.pm25), 1);

  return (
    <figure className="ribbon" aria-labelledby="ribbon-caption">
      <figcaption id="ribbon-caption" className="ribbon-caption">
        {t(lang, 'ribbonCaption')}
      </figcaption>
      <div className="ribbon-bars" aria-hidden="true">
        {day.map((h) => {
          const mark = inWindow(h.time, best) ? 'best' : inWindow(h.time, worst) ? 'worst' : '';
          return (
            <div key={h.time} className={`bar ${mark}`} title={`${formatHour(h.time)} · PM2.5 ${Math.round(h.pm25)}`}>
              <span className={`fill lvl-${pm25Level(h.pm25)}`} style={{ height: `${Math.max(8, (h.pm25 / max) * 100)}%` }} />
              <span className="tick">{Number(h.time.slice(11, 13)) % 3 === 0 ? h.time.slice(11, 13) : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="ribbon-key" aria-hidden="true">
        {best && <span className="key best">{t(lang, bestLabels(best).key)}</span>}
        <span className="key worst">{t(lang, stayIn ? 'keyWorst' : 'keyWorstCalm')}</span>
      </div>
      <details className="ribbon-table" onToggle={(e) => setTableOpen(e.currentTarget.open)}>
        <summary>{t(lang, 'hourlyNumbers')}</summary>
        {tableOpen && (
          <table>
            <thead>
              <tr>
                <th scope="col">{t(lang, 'hourCol')}</th>
                <th scope="col">PM2.5 (µg/m³)</th>
                <th scope="col">{t(lang, 'usAqi')}</th>
              </tr>
            </thead>
            <tbody>
              {day.map((h) => (
                <tr key={h.time}>
                  <th scope="row">{formatHour(h.time)}</th>
                  <td>{formatNumber(lang, h.pm25)}</td>
                  <td>{formatNumber(lang, h.usAqi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </figure>
  );
}
