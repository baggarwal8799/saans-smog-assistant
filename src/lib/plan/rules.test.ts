import { describe, expect, it } from 'vitest';
import { buildPlan, hoursOutside } from '../recommend';
import { mergeWeather } from '../weather';
import { profile, report, weatherPayload } from '../../test/fixtures';
import type { AirReport, RecId } from '../types';
import { isIndia } from './place';

const ids = (plan: ReturnType<typeof buildPlan>) => plan.recommendations.map((r) => r.id);
const rec = (plan: ReturnType<typeof buildPlan>, id: RecId) => plan.recommendations.find((r) => r.id === id);

/** A report whose weather traps smog from `from` to `to` (local hours, may wrap past midnight). */
function trappedReport(from: number, to: number, overrides: Parameters<typeof report>[0] = {}): AirReport {
  const r = report(overrides);
  const inTrap = (h: number) => (from <= to ? h >= from && h < to : h >= from || h < to);
  const w = weatherPayload();
  w.hourly.wind_speed_10m = w.hourly.time.map((t) => (inTrap(Number(t.slice(11, 13))) ? 3 : 12));
  w.hourly.boundary_layer_height = w.hourly.time.map((t) => (inTrap(Number(t.slice(11, 13))) ? 40 : 900));
  r.hourly = mergeWeather(r.hourly, w);
  return r;
}

describe('plan rules: factors, smog traps and timing', () => {
  it('calculates every percentage from a named factor (no hard-coded numbers)', () => {
    const plan = buildPlan(
      report({ usAqi: 120 }),
      profile({ cooking: 'lpg', hasPurifier: true, hasElderly: true }),
      'en',
    );
    const pct = (id: RecId) => plan.recommendations.find((r) => r.id === id)?.impact.exposureCutPct;
    expect(pct('diy-purifier')).toBeUndefined(); // the household already runs one: nothing to credit
    expect(pct('kitchen-exhaust')).toBe(30); // RANGE_HOOD_CUT
    expect(pct('wet-clean')).toBe(10); // WET_CLEAN_CUT
    expect(pct('protect-vulnerable')).toBe(70); // outdoors → indoors with the household's own purifier (0.3)
    // Airing at the cleanest hour: cut = day average vs window average, not a fixed number.
    const vent = plan.recommendations.find((r) => r.id === 'ventilate-smart');
    expect(vent?.impact.scope).toBe('in the air you let in');
    expect(vent?.impact.explanation).toMatch(/so the air you let in is \d+% cleaner/);
  });
  it('warns about a winter smog trap when the weather shows still, shallow air', () => {
    const r = report();
    r.hourly = mergeWeather(r.hourly, weatherPayload());
    const plan = buildPlan(r, profile(), 'en');
    expect(plan.smogTrap).toMatchObject({ start: '2026-11-17T18:00', minMixingM: 40 });
    const trap = plan.recommendations.find((x) => x.id === 'smog-trap');
    expect(trap?.priority).toBe(1);
    // The plan looks 24 h ahead from 07:00, so the trap is cut at 07:00 the next morning.
    expect(trap?.title).toMatch(/^Smog trap from 18:00 to 07:00/);
    // 40 m is under the forecast model's floor, so it is written as a bound, not a figure.
    expect(trap?.impact.explanation).toMatch(/mixing layer under 50 m deep/);
    expect(buildPlan(report(), profile(), 'en').smogTrap).toBeNull(); // no weather, no claim
  });
  it('never suggests going out or airing the house during a smog trap, wherever the trap falls', () => {
    for (let from = 7; from <= 20; from++) {
      const plan = buildPlan(trappedReport(from, (from + 6) % 24, { usAqi: 120 }), profile(), 'en');
      const trap = plan.smogTrap;
      const best = plan.bestWindow;
      expect(trap, `trap from ${from}`).not.toBeNull();
      if (trap && best) {
        const overlaps = best.start < trap.end && best.end > trap.start;
        expect(overlaps, `best ${best.start}–${best.end} vs trap ${trap.start}–${trap.end}`).toBe(false);
      }
    }
  });

  it('gives gas heaters a carbon-monoxide safety step that ranks first', () => {
    const plan = buildPlan(report(), profile({ heating: 'gas' }), 'en');
    expect(plan.recommendations[0]?.id).toBe('gas-heater-safety');
    expect(rec(plan, 'gas-heater-safety')?.detail).toMatch(/carbon monoxide alarm/);
    expect(ids(buildPlan(report(), profile({ heating: 'electric' }), 'en'))).not.toContain('gas-heater-safety');
  });

  it('folds carpooling into the commute tip instead of a competing bigger number', () => {
    const car = buildPlan(report(), profile({ commuteMode: 'car', commuteKm: 10 }), 'en');
    expect(ids(car)).not.toContain('carpool-idle');
    expect(rec(car, 'commute-switch')?.detail).toMatch(/Can’t switch\? Share the ride/);
    expect(car.co2KgPerMonthTotal).toBe(rec(car, 'commute-switch')?.impact.co2KgPerMonth);
    const bike = buildPlan(report(), profile({ commuteMode: 'motorbike', commuteKm: 10 }), 'en');
    expect(rec(bike, 'commute-switch')?.detail).not.toMatch(/Share the ride/);
  });

  it('only mentions India-specific schemes and words for places in India', () => {
    const who = profile({ cooking: 'biomass', heating: 'coal' });
    const india = buildPlan(report(), who, 'en');
    const text = (p: ReturnType<typeof buildPlan>) => p.recommendations.map((r) => r.detail).join(' ');
    expect(text(india)).toMatch(/Ujjwala/);
    expect(text(india)).toMatch(/RWA/);
    expect(text(india)).toMatch(/angithi/);
    const abroad = report();
    abroad.place = { ...abroad.place, name: 'Salt Lake City', country: 'United States' };
    const us = buildPlan(abroad, who, 'en');
    expect(text(us)).not.toMatch(/Ujjwala|RWA|angithi/);
    expect(text(us)).toMatch(/residents’ association/);
  });

  it('recognises India by its English and Hindi names only', () => {
    expect(isIndia('India')).toBe(true);
    expect(isIndia('भारत')).toBe(true);
    expect(isIndia('Indiana')).toBe(false);
    expect(isIndia(undefined)).toBe(false);
  });

  it('keeps windows inside the 24-hour horizon even when a long trap removes most hours', () => {
    // Now 06:00; trap 08:00–06:00 next day (22 h). Only 07:00 and 06:00+ remain, none a 2 h daytime window in range.
    const plan = buildPlan(trappedReport(8, 6, { usAqi: 120 }), profile(), 'en');
    expect(plan.smogTrap).not.toBeNull();
    if (plan.bestWindow) expect(plan.bestWindow.start < '2026-11-18T07:00').toBe(true);
    expect(
      hoursOutside(trappedReport(8, 6).hourly.slice(1), [plan.smogTrap]).every((h) => h.time < '2026-11-18T07:00'),
    ).toBe(true);
  });
});
