import { type ReactElement, useState } from 'react';

import { pm25Level } from '../../core/aqi.js';
import { formatNumber, t } from '../../core/i18n.js';
import { isoHour } from '../../core/isoTime.js';
import type { HourPoint, TimeWindow } from '../../core/types.js';
import { formatHour } from '../../core/windows.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';
import { bestLabels } from '../lib/windowLabels.js';

interface Props {
  hours: readonly HourPoint[];
  best: TimeWindow | null;
  worst: TimeWindow | null;
  /** The plan tells people to stay in, so the worst hours may say so too. */
  stayIn: boolean;
}

const inWindow = (time: string, w: TimeWindow | null): boolean => w !== null && time >= w.start && time < w.end;

function markFor(time: string, best: TimeWindow | null, worst: TimeWindow | null): string {
  if (inWindow(time, best)) return 'best';
  return inWindow(time, worst) ? 'worst' : '';
}

/** The bars are hidden from screen readers; the "Hourly numbers" table below gives every value as text. */
export function AirRibbon({ hours, best, worst, stayIn }: Readonly<Props>): ReactElement | null {
  const lang = useCurrentLang();
  // The table is built only once someone opens it: most visits never do, and it is 24 rows of DOM. It is too small
  // to be worth its own chunk (a request would cost more than its bytes), so only the rendering is deferred.
  const [tableOpen, setTableOpen] = useState(false);
  const day = hours.slice(0, 24);
  if (day.length === 0) return null;

  return (
    <figure className="ribbon" aria-labelledby="ribbon-caption">
      <figcaption id="ribbon-caption" className="ribbon-caption">
        {t(lang, 'ribbonCaption')}
      </figcaption>
      <RibbonBars day={day} best={best} worst={worst} />
      <div className="ribbon-key" aria-hidden="true">
        {best && <span className="key best">{t(lang, bestLabels(best).key)}</span>}
        <span className="key worst">{t(lang, stayIn ? 'keyWorst' : 'keyWorstCalm')}</span>
      </div>
      <details className="ribbon-table" onToggle={(e) => setTableOpen(e.currentTarget.open)}>
        <summary>{t(lang, 'hourlyNumbers')}</summary>
        {tableOpen && <HourlyTable day={day} />}
      </details>
    </figure>
  );
}

type BarsProps = Pick<Props, 'best' | 'worst'> & { day: readonly HourPoint[] };

function RibbonBars({ day, best, worst }: BarsProps) {
  const max = Math.max(...day.map((h) => h.pm25), 1);
  return (
    <div className="ribbon-bars" aria-hidden="true">
      {day.map((h) => {
        const mark = markFor(h.time, best, worst);
        return (
          <div key={h.time} className={`bar ${mark}`} title={`${formatHour(h.time)} · PM2.5 ${Math.round(h.pm25)}`}>
            <span
              className={`fill lvl-${pm25Level(h.pm25)}`}
              style={{ height: `${Math.max(8, (h.pm25 / max) * 100)}%` }}
            />
            <span className="tick">{Number(isoHour(h.time)) % 3 === 0 ? isoHour(h.time) : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function HourlyTable({ day }: Readonly<{ day: readonly HourPoint[] }>) {
  const lang = useCurrentLang();
  return (
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
  );
}
