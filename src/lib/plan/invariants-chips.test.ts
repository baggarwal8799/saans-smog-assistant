/** Invariants about the impact chips: their numbers and pollutant names match the working behind them. */
import { describe, expect, it } from 'vitest';
import { impactChips } from '../chips';
import { POLLUTANT_NAMES, effectPercents, violations } from '../../test/planChecks';

describe('chips match the working', () => {
  it('every effect percentage in the working equals the chip, and chip numbers appear verbatim in it', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) => {
          const { exposureCutPct: pct, co2KgPerMonth: kg, explanation } = r.impact;
          return [
            ...effectPercents(explanation).map((p) => p !== pct && `${r.id}: working says ${p}%, chip ${String(pct)}%`),
            pct !== undefined && !explanation.includes(`${pct}%`) && `${r.id}: ${pct}% not in working`,
            kg !== undefined && !explanation.includes(String(kg)) && `${r.id}: ${kg} kg not in "${explanation}"`,
          ];
        }),
      ),
    ).toEqual([]);
  });

  it('no chip names two pollutants, and ozone cuts are labelled as ozone', () => {
    expect(
      violations((c) =>
        c.plan.recommendations.flatMap((r) =>
          impactChips(r.impact, c.lang).map((chip) => {
            const names = Array.from(chip.text.matchAll(POLLUTANT_NAMES));
            return names.length > 1 || (r.id === 'ozone-effort' && !/ozone|ओज़ोन/i.test(chip.text))
              ? `${r.id}: "${chip.text}"`
              : '';
          }),
        ),
      ),
    ).toEqual([]);
  });
});
