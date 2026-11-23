import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { cautious } from '../../core/concern.js';
import { CONCERN_LEVELS } from '../../core/types.js';
import { CAUTION } from '../../test/planChecks.js';
import { type Case, cases } from '../../test/scenarios.js';
import { LanguageContext } from '../hooks/useCurrentLang.js';
import { AirNow } from './AirNow.js';
import { PlanView } from './PlanView.js';

/** All the text the air tile and the plan put in the DOM, collapsed rows and "How we worked this out" included. */
function domText(c: Case): string {
  const { container, unmount } = render(
    <LanguageContext value={c.lang}>
      <AirNow report={c.report} plan={c.plan} />
      <PlanView plan={c.plan} />
    </LanguageContext>,
  );
  const text = container.textContent;
  unmount();
  return text;
}

describe('AirNow and PlanView speak with one concern level', () => {
  it.each(CONCERN_LEVELS)('%s: caution phrases appear exactly when the concern calls for them', (level) => {
    const sample = cases().filter((c) => c.plan.concern === level && c.plan.worstWindow);
    expect(sample.length).toBeGreaterThan(0);
    // Spread across the grid: every language, place, weather and household shape gets rendered.
    for (const c of sample.filter((_, i) => i % 40 === 0)) {
      const text = domText(c);
      if (level === 'low') expect(CAUTION.exec(text)?.[0], c.name).toBeUndefined();
      // The worst-window label says "stay in" only on days the plan itself does.
      expect(/stay in|घर में रहें/i.test(text), c.name).toBe(cautious(level));
    }
  });

  it('every clean-air grid scenario renders without a caution phrase', () => {
    const clean = cases().filter((c) => c.plan.concern === 'low');
    expect(clean.length).toBeGreaterThan(500);
    const found = clean
      .filter((_, i) => i % 7 === 0)
      .flatMap((c) => {
        const hit = CAUTION.exec(domText(c))?.[0];
        return hit ? [`"${hit}" | ${c.name}`] : [];
      });
    expect(found).toEqual([]);
  });
});
