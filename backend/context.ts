/** The grounded context sent to Gemini, built on the server so no number in it comes from the request body. */
import { aqiLevel } from '../core/aqi.js';
import { impactChips } from '../core/chips.js';
import { type AssistantContext, type AssistantRec, LIMITS } from '../core/contract.js';
import { weatherFigure } from '../core/figures.js';
import { aqiKey, commuteKey, cookingKey, heatingKey, t } from '../core/i18n.js';
import { isoDate } from '../core/isoTime.js';
import { placeLabel } from '../core/place.js';
import type { AirReport, Lang, Plan, Profile, Recommendation, TimeWindow } from '../core/types.js';
import { formatHour, spanText } from '../core/windows.js';
import { askedTimeLines, bandLine, nowLine, outdoorHoursLine, outdoorLines } from './promptFacts.js';

function windowText(w: TimeWindow | null, now: string): string {
  // Time first, so the model can drop it straight into a sentence.
  return w ? `${spanText(w, now)} (PM2.5 ≈ ${Math.round(w.avgPm25)} µg/m³)` : '';
}

/** "15:00 51, 16:00 55, … 00:00 (tomorrow) 98, …" for the next 24 hours. */
export function hourlyText(report: AirReport, now: string): string {
  const hours = report.hourly.slice(1, 25);
  const firstTomorrow = hours.findIndex((h) => isoDate(h.time) > isoDate(now));
  return hours
    .map((h, i) => `${formatHour(h.time)}${i === firstTomorrow ? ' (tomorrow)' : ''} ${Math.round(h.pm25)}`)
    .join(', ');
}

/**
 * The household in English whatever the reply language, like the rest of the prompt's facts: Hindi values under
 * English labels make a mixed-script line, which the model would copy.
 */
export function householdSummary(p: Profile): string {
  const commute = t('en', commuteKey(p.commuteMode));
  const parts = [
    `${p.householdSize} people`,
    p.hasChildren ? 'children' : '',
    p.hasElderly ? 'elderly' : '',
    p.hasRespiratory ? 'someone with a heart/lung condition' : '',
    p.commuteMode === 'wfh' ? 'works from home' : `commute ${commute} ${p.commuteKm} km one-way`,
    `outdoor exercise ${p.exerciseMinutes} min/day`,
    `cooking ${t('en', cookingKey(p.cooking))}`,
    `heating ${t('en', heatingKey(p.heating))}`,
    p.hasPurifier ? 'has purifier' : 'no purifier',
    p.burnsWaste ? 'waste or leaves burned nearby' : '',
  ];
  return parts.filter(Boolean).join(', ').slice(0, LIMITS.longText);
}

function trapText(trap: NonNullable<Plan['smogTrap']>, now: string): string {
  const wind = weatherFigure('wind', trap.avgWindKmh).en;
  const mixing = weatherFigure('mixing', trap.minMixingM).en;
  return `${spanText(trap, now)}: wind ${wind}, mixing layer ${mixing}, so smoke stays near the ground`;
}

function recGroup(r: Recommendation): AssistantRec['group'] {
  if (r.safety) return 'safety';
  return r.priority === 1 ? 'first' : 'more';
}

function impactText(r: Recommendation, lang: Lang): string {
  // The chips' own lines, so the model quotes exactly what is on screen.
  const bits = impactChips(r.impact, lang).map((c) => c.text);
  return (bits.join('; ') || r.impact.explanation).slice(0, LIMITS.longText);
}

/** `said` is the user's own questions: only the times in it are used, as computed facts. */
interface ContextInput {
  report: AirReport;
  profile: Profile;
  plan: Plan;
  lang: Lang;
  said?: readonly string[];
}

type AirFacts = Pick<AssistantContext, 'place' | 'localTime' | 'readingTime' | 'usAqi' | 'pm25' | 'level' | 'epaBand'>;
type PlanTotals = Pick<AssistantContext, 'doseCutPct' | 'co2KgPerMonth' | 'cigarettesPerDay'>;

function airFacts(report: AirReport, profile: Profile, lang: Lang): AirFacts {
  const now = report.current.time;
  const band = bandLine(report.current.usAqi, profile);
  return {
    place: placeLabel(report.place).slice(0, LIMITS.shortText),
    localTime: now.replace('T', ' '),
    readingTime: formatHour(now),
    usAqi: Math.round(report.current.usAqi),
    pm25: Math.round(report.current.pm25),
    level: t(lang, aqiKey(aqiLevel(report.current.usAqi))),
    ...(band ? { epaBand: band } : {}),
  };
}

/** The plan's totals. A zero total is left out, not sent, so the model never writes "0 kg CO₂ avoided". */
function planTotals(plan: Plan): PlanTotals {
  return {
    ...(plan.dose.cutPct ? { doseCutPct: plan.dose.cutPct } : {}),
    ...(plan.co2KgPerMonthTotal ? { co2KgPerMonth: plan.co2KgPerMonthTotal } : {}),
    cigarettesPerDay: plan.cigarettesPerDay,
  };
}

export function buildContext({ report, profile, plan, lang, said = [] }: ContextInput): AssistantContext {
  const now = report.current.time;
  const trap = plan.smogTrap;
  const question = said[0] ?? '';
  const outdoor = outdoorLines(question, report, profile, lang);
  return {
    ...airFacts(report, profile, lang),
    bestWindow: windowText(plan.bestWindow, now),
    worstWindow: windowText(plan.worstWindow, now),
    smogTrap: trap ? trapText(trap, now) : 'none expected in the next 24 h',
    now: nowLine(report, plan),
    outdoorHours: outdoorHoursLine(report, profile, question),
    hourly: hourlyText(report, now),
    askedTimes: [...askedTimeLines(said, report, plan), ...outdoor.lines],
    ...(outdoor.reply ? { epaReply: outdoor.reply } : {}),
    household: householdSummary(profile),
    recommendations: plan.recommendations.slice(0, LIMITS.recs).map((r) => ({
      title: r.title.slice(0, LIMITS.longText),
      impact: impactText(r, lang),
      // The screen's split, so the summary's top actions are exactly its "Do these first".
      group: recGroup(r),
    })),
    ...planTotals(plan),
  };
}
