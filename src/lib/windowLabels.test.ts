import { describe, expect, it } from 'vitest';

import { t } from '../../core/i18n.js';
import { texts, violations } from '../../test/planChecks.js';
import { bestLabels } from './windowLabels.js';

/** The Moderate upper bound of the US EPA PM2.5 bands. */
const MODERATE_MAX = 35.4;
const GOOD = /\bbest\b|cleanest|good time|सबसे अच्छ|सबसे साफ़/i;

describe('"best" only for air that is at most Moderate', () => {
  it('every rendered best, cleanest or good-time label implies the window PM2.5 ≤ 35.4 µg/m³', () => {
    expect(
      violations(({ plan, lang }) => {
        const labels = bestLabels(plan.bestWindow);
        const ui = [t(lang, labels.window), t(lang, 'windowBasis'), ...(plan.bestWindow ? [t(lang, labels.key)] : [])];
        const clean = plan.bestWindow !== null && plan.bestWindow.avgPm25 <= MODERATE_MAX;
        const shown = [
          ...ui.map((s) => ['ui', s]),
          ...plan.recommendations.flatMap((r) => texts(r).map((s) => [r.id, s])),
        ];
        return shown.map(
          ([where, s]) =>
            !clean && GOOD.test(s ?? '') && `${where}: "${GOOD.exec(s ?? '')?.[0]}" at ${plan.bestWindow?.avgPm25}`,
        );
      }),
    ).toEqual([]);
  });

  it('labels a window above Moderate neutrally', () => {
    expect(bestLabels({ start: '', end: '', avgPm25: 67 })).toEqual({
      window: 'bestWindowNeutral',
      key: 'keyBestNeutral',
    });
    expect(t('en', 'bestWindowNeutral')).toBe('Least polluted 2 hours, if you must go out');
  });
});
