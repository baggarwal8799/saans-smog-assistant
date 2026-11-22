/** The short impact lines shown on each tip and the plan's CO₂ summary, shared by the UI and the AI context. */
import { formatNumber, t } from './i18n.js';
import type { Impact, Lang, Plan } from './types.js';

export interface Chip {
  kind: 'co2' | 'lungs';
  text: string;
}

export function impactChips(impact: Impact, lang: Lang): Chip[] {
  const { co2KgPerMonth, exposureCutPct, scope, removesSource, community } = impact;
  const chips: Chip[] = [];
  if (co2KgPerMonth !== undefined && co2KgPerMonth > 0) {
    const kg = t(lang, 'co2Saved', { kg: formatNumber(lang, co2KgPerMonth, 1) });
    chips.push({ kind: 'co2', text: community ? `${kg}, ${t(lang, 'communityFigure').toLowerCase()}` : kg });
  }
  if (exposureCutPct !== undefined && exposureCutPct > 0) {
    // The pollutant is named once, by the chip template; the scope says only where the cut applies.
    const pollutant = impact.pollutant === 'ozone' ? t(lang, 'ozone') : 'PM2.5';
    // A cut with no scope leaves an empty slot in the template; collapse it so no double space shows.
    const text = t(lang, 'exposureCut', { pct: exposureCutPct, scope: scope ?? '', pollutant });
    chips.push({ kind: 'lungs', text: text.replace(/ {2,}/g, ' ').trim() });
  }
  if (removesSource) chips.push({ kind: 'lungs', text: t(lang, 'sourceRemoved') });
  return chips;
}

/**
 * The line under the dose bars; the "with plan" dose counts every tip, so the cut says so. On a clean-air day a big
 * percentage of a tiny dose would oversell the plan, so it gives the absolute dose instead.
 */
export function doseHeadline(plan: Plan, lang: Lang): string {
  if (plan.concern !== 'low')
    return t(lang, plan.dose.cutPct >= 1 ? 'doseCut' : 'doseNoCut', { pct: plan.dose.cutPct });
  const clean = t(lang, 'doseClean', { ug: formatNumber(lang, plan.dose.baselineUg) });
  return `${clean} ${t(lang, plan.hasSourceFixes ? 'doseCleanSources' : 'doseCleanNone')}`;
}

/** "Already low-emission" is reassurance, so it is only said when the plan has no smoke source to fix either. */
export function co2Summary(plan: Plan, lang: Lang): { strong: boolean; text: string } {
  if (plan.co2KgPerMonthTotal > 0)
    return { strong: true, text: t(lang, 'co2Value', { kg: formatNumber(lang, plan.co2KgPerMonthTotal, 1) }) };
  return { strong: false, text: t(lang, plan.hasSourceFixes ? 'co2SourceFixes' : 'co2None') };
}
