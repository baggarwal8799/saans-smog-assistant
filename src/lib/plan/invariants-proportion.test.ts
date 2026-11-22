/** Invariants for proportional alarm, true facts, honest summaries, commute exposure and CO safety. */
import { describe, expect, it } from 'vitest';
import { findWindow } from '../windows';
import { co2Summary } from '../chips';
import { t } from '../i18n';
import { buildPlan } from '../recommend';
import { profile } from '../../test/fixtures';
import { ABROAD, INDIA, airReport, type Case } from '../../test/scenarios';
import { HEATING_SAFETY, daytimeWindows, ids, rec, violations } from '../../test/planChecks';
import { activeTravelOk, cautious } from '../concern';
import { CO_CAVEAT, OZONE_CONCERN_UG } from './shared';

const ALARM_IDS = ['ozone-effort', 'smog-trap', 'n95', 'protect-vulnerable', 'exercise-indoors', 'commute-exposure'];
const ALARM_TEXT = /stay indoors|shut windows|keep windows shut|close windows/i;
const upcoming = (c: Case) => c.report.hourly.slice(1);
const ozonePeak = (c: Case) => findWindow(upcoming(c), 2, 'worst', (p) => p.o3 ?? 0);

function goodAir(c: Case): boolean {
  const o3 = Math.max(
    ...upcoming(c)
      .slice(0, 24)
      .map((p) => p.o3 ?? 0),
  );
  return c.plan.concern === 'low' && o3 < OZONE_CONCERN_UG;
}

describe('A. proportional alarm', () => {
  it('Good air with every pollutant under its concern level gets no restrictive advice', () => {
    expect(
      violations((c) =>
        !goodAir(c)
          ? []
          : [
              c.plan.smogTrap && 'smog trap shown',
              ...c.plan.recommendations.map(
                (r) => (ALARM_IDS.includes(r.id) || ALARM_TEXT.test(`${r.title} ${r.detail}`)) && `alarm: ${r.id}`,
              ),
            ],
      ),
    ).toEqual([]);
  });

  it('ozone and smog-trap warnings fire only above their own thresholds', () => {
    expect(
      violations((c) => {
        const o3 = ozonePeak(c)?.avgO3 ?? 0;
        const dominantO3 = c.report.current.dominant === 'o3';
        return [
          ids(c).has('ozone-effort') &&
            !(o3 >= OZONE_CONCERN_UG || (dominantO3 && cautious(c.plan.concern))) &&
            `ozone alarm at ${o3}`,
          (ids(c).has('smog-trap') || c.plan.smogTrap) && c.plan.concern === 'low' && 'trap alarm in clean air',
        ];
      }),
    ).toEqual([]);
  });

  it('Reykjavik: AQI 31, ozone-dominant (~66 µg/m³) gets no ozone or trap alarm; a bad day still does', () => {
    const at = (aqi: number, weather: 'ozone' | 'nightTrap') =>
      buildPlan(airReport({ aqi, weather, startHour: 6, place: ABROAD }), profile(), 'en');
    const good = at(31, 'ozone').recommendations.map((r) => r.id);
    expect(good).not.toContain('ozone-effort');
    expect(at(20, 'nightTrap').smogTrap).toBeNull();
    expect(at(20, 'nightTrap').recommendations.map((r) => r.id)).not.toContain('smog-trap');
    expect(at(155, 'ozone').recommendations.map((r) => r.id)).toContain('ozone-effort');
    expect(at(120, 'nightTrap').recommendations.map((r) => r.id)).toContain('smog-trap');
  });
});

describe('B. a stated peak is the real peak', () => {
  it('the worst window is the daytime 2-hour window with the highest PM2.5', () => {
    expect(
      violations((c) => {
        const max = Math.max(...daytimeWindows(c.report.hourly).map((w) => w.avgPm25));
        const worst = c.plan.worstWindow;
        return [
          Number.isFinite(max) &&
            (!worst || Math.abs(worst.avgPm25 - max) > 1e-9) &&
            `worst ${worst?.avgPm25} ≠ peak ${max}`,
        ];
      }),
    ).toEqual([]);
  });
});

describe('E. summaries never contradict the plan', () => {
  it('"biggest wins are smoke sources" exactly when the household reported one, and "already low-emission" never then', () => {
    expect(
      violations(({ plan, lang, profile: p }) => {
        const reported =
          p.cooking === 'biomass' ||
          p.cooking === 'kerosene' ||
          ['gas', 'coal', 'wood'].includes(p.heating) ||
          p.burnsWaste;
        return [
          plan.hasSourceFixes !== reported &&
            `hasSourceFixes=${String(plan.hasSourceFixes)}, reported=${String(reported)}`,
          reported && co2Summary(plan, lang).text === t(lang, 'co2None') && 'co2None shown',
        ];
      }),
    ).toEqual([]);
  });

  it('an all-electric single person working from home is not told their wins are smoke sources', () => {
    const r = airReport({ aqi: 120, weather: 'none', startHour: 6, place: INDIA });
    const plan = buildPlan(
      r,
      profile({
        householdSize: 1,
        hasChildren: false,
        commuteMode: 'wfh',
        cooking: 'electric',
        heating: 'electric',
        burnsWaste: false,
      }),
      'en',
    );
    expect(plan.recommendations.map((x) => x.id)).toContain('no-smoke-indoors');
    expect(plan.hasSourceFixes).toBe(false);
    expect(co2Summary(plan, 'en').text).not.toBe(t('en', 'co2SourceFixes'));
  });

  it('a coal-heating, biomass-cooking, waste-burning household with no CO₂ to save gets the honest line', () => {
    const r = airReport({ aqi: 120, weather: 'none', startHour: 6, place: INDIA });
    const plan = buildPlan(
      r,
      profile({ commuteMode: 'wfh', heating: 'coal', cooking: 'biomass', burnsWaste: true }),
      'en',
    );
    expect(plan.hasSourceFixes).toBe(true);
    expect(co2Summary(plan, 'en')).toEqual({ strong: false, text: t('en', 'co2SourceFixes') });
  });
});

describe('F. exposure-driven commute advice', () => {
  it('a walker or cyclist above the active-travel limit is told to take public transport', () => {
    expect(
      violations((c) => {
        const p = c.profile;
        const active = (p.commuteMode === 'walk' || p.commuteMode === 'bicycle') && p.commuteKm > 0;
        const over = !activeTravelOk(c.plan.band, p.hasRespiratory);
        const tip = rec(c, 'commute-exposure');
        return [
          active && over && !tip && 'no exposure tip',
          tip && !(active && over) && 'exposure tip without cause',
          tip && !(tip.impact.scope && (tip.impact.exposureCutPct ?? 0) > 0) && 'tip has no scoped cut',
        ];
      }),
    ).toEqual([]);
  });

  it('a cyclist with a lung condition at AQI 167 is told to take the metro', () => {
    const r = airReport({ aqi: 167, weather: 'none', startHour: 6, place: INDIA });
    const plan = buildPlan(r, profile({ commuteMode: 'bicycle', commuteKm: 5, hasRespiratory: true }), 'en');
    const tip = plan.recommendations.find((x) => x.id === 'commute-exposure');
    expect(tip?.title).toBe('Today, take the metro instead of cycling');
    expect(tip?.impact).toMatchObject({ scope: 'on your commute', pollutant: 'PM2.5' });
  });
});

describe('G. cross-tip conflicts', () => {
  it('with indoor fuel heating, every "shut the windows" tip carries the carbon-monoxide caveat', () => {
    expect(
      violations((c) => {
        if (!c.plan.recommendations.some((r) => HEATING_SAFETY.has(r.id))) return [];
        return c.plan.recommendations.map((r) => {
          if (HEATING_SAFETY.has(r.id)) return '';
          const shuts =
            c.lang === 'en'
              ? /\b(shut|close|seal)/i.test(r.detail) && /window/i.test(r.detail)
              : /खिड़कि/.test(r.detail) && /बंद/.test(r.detail);
          return shuts && !r.detail.includes(CO_CAVEAT[c.lang].trim()) ? `${r.id}: no CO caveat` : '';
        });
      }),
    ).toEqual([]);
  });
});
