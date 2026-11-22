/**
 * Turns a computed plan into the grounded context sent to Gemini. Runs on the SERVER: the browser only sends the
 * place and household, so every number the model sees comes from this code, never from the request body.
 * (Relative imports use .js suffixes so the Vercel Node runtime can load these files directly.)
 */
import { LIMITS, type AssistantContext, type AssistantRec } from './contract.js';
import { aqiLevel } from './aqi.js';
import { formatHour, spanText } from './windows.js';
import { askedTimeFacts, nowFact } from './askedTimes.js';
import { outdoorHoursFact } from './outdoorHours.js';
import { bandGuidance, outdoorFacts } from './verdict.js';
import { impactChips } from './chips.js';
import { placeLabel } from './geo.js';
import { aqiKey, commuteKey, cookingKey, heatingKey, t } from './i18n.js';
import type { AirReport, Lang, Plan, Profile, TimeWindow } from './types.js';
import { weatherFigure } from './plan/figures.js';

function windowText(w: TimeWindow | null, now: string): string {
  // Time first, so the model can drop it straight into a sentence.
  return w ? `${spanText(w, now)} (PM2.5 ≈ ${Math.round(w.avgPm25)} µg/m³)` : '';
}

/** "15:00 51, 16:00 55, … 00:00 (tomorrow) 98, …" for the next 24 hours. */
export function hourlyText(report: AirReport, now: string): string {
  let marked = false;
  return report.hourly
    .slice(1, 25)
    .map((h) => {
      const tomorrow = !marked && h.time.slice(0, 10) > now.slice(0, 10);
      if (tomorrow) marked = true;
      return `${formatHour(h.time)}${tomorrow ? ' (tomorrow)' : ''} ${Math.round(h.pm25)}`;
    })
    .join(', ');
}

/**
 * The household in English whatever the reply language: its labels are English like the rest of the prompt's
 * facts, and Hindi values under English labels read as a mixed-script line the model then copied.
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

function recGroup(r: Plan['recommendations'][number]): AssistantRec['group'] {
  if (r.safety) return 'safety';
  return r.priority === 1 ? 'first' : 'more';
}

function impactText(r: Plan['recommendations'][number], lang: Lang): string {
  // The same lines the person sees on the tip's chips, so the model quotes exactly what is on screen.
  const bits = impactChips(r.impact, lang).map((c) => c.text);
  return (bits.join('; ') || r.impact.explanation).slice(0, LIMITS.longText);
}

/** `said` is the user's own questions: only the times in it are used, as computed facts. */
export interface ContextInput {
  report: AirReport;
  profile: Profile;
  plan: Plan;
  lang: Lang;
  said?: readonly string[];
}

export function buildContext({ report, profile, plan, lang, said = [] }: ContextInput): AssistantContext {
  const now = report.current.time;
  const trap = plan.smogTrap;
  const outdoor = outdoorFacts(said[0] ?? '', report, profile, lang);
  const band = bandGuidance(report.current.usAqi, profile);
  return {
    place: placeLabel(report.place).slice(0, LIMITS.shortText),
    localTime: now.replace('T', ' '),
    readingTime: formatHour(now),
    usAqi: Math.round(report.current.usAqi),
    pm25: Math.round(report.current.pm25),
    level: t(lang, aqiKey(aqiLevel(report.current.usAqi))),
    ...(band ? { epaBand: band } : {}),
    bestWindow: windowText(plan.bestWindow, now),
    worstWindow: windowText(plan.worstWindow, now),
    smogTrap: trap ? trapText(trap, now) : 'none expected in the next 24 h',
    now: nowFact(report, plan),
    outdoorHours: outdoorHoursFact(report, profile, said[0] ?? ''),
    hourly: hourlyText(report, now),
    askedTimes: [...askedTimeFacts(said, report, plan), ...outdoor.lines],
    ...(outdoor.reply ? { epaReply: outdoor.reply } : {}),
    household: householdSummary(profile),
    recommendations: plan.recommendations.slice(0, LIMITS.recs).map((r) => ({
      title: r.title.slice(0, LIMITS.longText),
      impact: impactText(r, lang),
      // The same split PlanView shows, so the summary's top actions are exactly the screen's "Do these first".
      group: recGroup(r),
    })),
    // A zero total is left out, not sent, so the model never writes "0 kg CO₂ avoided".
    ...(plan.dose.cutPct ? { doseCutPct: plan.dose.cutPct } : {}),
    ...(plan.co2KgPerMonthTotal ? { co2KgPerMonth: plan.co2KgPerMonthTotal } : {}),
    cigarettesPerDay: plan.cigarettesPerDay,
  };
}
