/**
 * The English CONTEXT lines for the facts core computes about times, people and US EPA guidance. The wording lives
 * here, beside the rest of the prompt, so core stays free of what the model is told.
 */
import { askedPeople } from '../core/askedPeople.js';
import {
  type AskedForecast,
  type AskedTime,
  type AskedTimeFact,
  askedTimeFacts,
  nowFact,
  type SpanCheck,
  type SpanPosition,
} from '../core/askedTimes.js';
import type { EpaReply } from '../core/contract.js';
import { CHILD_MASK_NOTE } from '../core/copy/masks.js';
import { VERDICT_REPLY } from '../core/copy/replies.js';
import { EPA_BANDS } from '../core/epa.js';
import { outdoorHours } from '../core/outdoorHours.js';
import type { AirReport, Lang, Plan, Profile } from '../core/types.js';
import {
  type AdviceKind,
  bandFact,
  outdoorFacts,
  type OutdoorMoment,
  type PersonAdvice,
  type SensitiveMember,
} from '../core/verdict.js';
import { formatHour, spanText } from '../core/windows.js';

const pad = (value: number): string => String(value).padStart(2, '0');
const hhmm = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`;

/** "07:30", or "morning (06:00–10:00)". */
export function askedLabel({ hours, minute, dayPart }: AskedTime): string {
  const first = hours[0] ?? 0;
  if (!dayPart) return hhmm(first, minute);
  const end = (hours.at(-1) ?? first) + 1;
  return `${dayPart} (${hhmm(first, 0)}–${hhmm(end % 24, 0)})`;
}

function windowParts(forecast: AskedForecast, now: string): string[] {
  const trap = (check: SpanCheck): string =>
    `${check.inside ? 'INSIDE' : 'outside'} the smog trap (${spanText(check.span, now)})`;
  const yesNo = (check: SpanCheck): string => `(${spanText(check.span, now)}): ${check.inside ? 'yes' : 'no'}`;
  const parts = [forecast.smogTrap ? trap(forecast.smogTrap) : 'no smog trap forecast'];
  if (forecast.worstWindow) parts.push(`inside the most polluted window ${yesNo(forecast.worstWindow)}`);
  if (forecast.bestWindow) parts.push(`inside the cleanest window ${yesNo(forecast.bestWindow)}`);
  return parts;
}

/** "Asked time 07:30 tomorrow: US AQI ≈ 98, …, INSIDE the smog trap (17:00 today to 10:00 tomorrow), …". */
function askedTimeLine({ time, now, forecast }: AskedTimeFact): string {
  const label = askedLabel(time);
  if (!forecast) return `Asked time ${label}: outside the 24 h forecast, so no figures for it.`;
  const { worst } = forecast;
  const worstHour = forecast.severalHours ? `worst hour ${formatHour(worst.time)}, ` : '';
  const air = `${worstHour}US AQI ≈ ${Math.round(worst.usAqi)}, PM2.5 ≈ ${Math.round(worst.pm25)} µg/m³`;
  const parts = [air, ...windowParts(forecast, now)];
  const passed = forecast.passedToday ? ` ${label} today has already passed; the figures are for tomorrow.` : '';
  return `Asked time ${label} ${forecast.day}: ${parts.join(', ')}.${passed}`;
}

export const askedTimeLines = (texts: readonly string[], report: AirReport, plan: Plan): string[] =>
  askedTimeFacts(texts, report, plan).map(askedTimeLine);

export function nowLine(report: AirReport, plan: Pick<Plan, 'smogTrap' | 'worstWindow'>): string {
  const { now, smogTrap, worstWindow } = nowFact(report, plan);
  const where = (name: string, position: SpanPosition | null): string => {
    if (!position) return '';
    const relation = position.relation === 'inside' ? 'INSIDE' : position.relation;
    return `${relation} ${name} (${spanText(position.span, now)})`;
  };
  const said = [where('the smog trap', smogTrap), where('the most polluted window', worstWindow)].filter(Boolean);
  const state = said.length > 0 ? said.join(' and ') : 'in no smog trap or polluted window';
  return `Now (${formatHour(now)} today) is ${state}.`;
}

const MEMBER_WORDS: Readonly<Record<SensitiveMember, string>> = {
  children: 'children',
  olderAdults: 'older adults',
  heartOrLung: 'someone with a heart or lung condition',
};

/** Empty for Good air. */
export function bandLine(aqi: number, profile: Profile): string {
  const fact = bandFact(aqi, profile);
  if (!fact) return '';
  const { name, range, caution } = EPA_BANDS[fact.level];
  const who = fact.members.map((member) => MEMBER_WORDS[member]);
  const note =
    who.length > 0
      ? ` This household has ${who.join(', ')} (US EPA sensitive groups): say what this means for them.`
      : '';
  return `US EPA guidance for ${name} air (US AQI ${range}): ${caution}.${note}`;
}

/** US EPA's own activity words, so the model is handed the exact strength of the advice. */
const EPA_ACTION = {
  reduce: 'reduce prolonged or heavy exertion outdoors',
  avoidHeavy: 'avoid prolonged or heavy exertion outdoors',
  avoidAll: 'avoid all physical activity outdoors',
} as const;
/** The plan's own N95 note, so the plan and the assistant never disagree about children and masks. */
const AVOID_NOTE =
  '; move it indoors or to an hour listed as fit for outdoor activity ' +
  `(a mask does not make it safe; ${CHILD_MASK_NOTE.en})`;

const ADVICE: Readonly<Record<AdviceKind, string>> = {
  fine: 'outdoor activity is fine',
  reduce: `${EPA_ACTION.reduce}, with more breaks`,
  avoidGentle: `${EPA_ACTION.avoidHeavy}; if a short trip out cannot wait, keep it gentle${AVOID_NOTE}`,
  avoidHeavy: `${EPA_ACTION.avoidHeavy}${AVOID_NOTE}`,
  avoidAll: `${EPA_ACTION.avoidAll}${AVOID_NOTE}`,
};

const whoText = ({ who }: PersonAdvice): string => who ?? 'the person asking';

const momentLabel = (time: AskedTime): string => `${time.hours.length > 1 ? 'in the' : 'at'} ${askedLabel(time)}`;

function momentLine({ time, aqi, people }: OutdoorMoment, lang: Lang): string {
  const label = time ? momentLabel(time) : 'now';
  const each = people.map((person) => `${whoText(person)}: ${ADVICE[person.advice]}`);
  const reply = people.map((person) => `${whoText(person)}: ${VERDICT_REPLY[person.verdict][lang]}`).join('; ');
  const guidance = `US EPA activity guidance ${label} (US AQI ≈ ${Math.round(aqi)}): ${each.join('; ')}.`;
  return `${guidance} The yes/no answer for each: ${reply}.`;
}

interface OutdoorLines {
  lines: string[];
  /** "no" when anyone asked about should avoid it at any asked time, "yes" when it is fine for everyone. */
  reply?: EpaReply;
}

export function outdoorLines(question: string, report: AirReport, profile: Profile, lang: Lang): OutdoorLines {
  const { moments, reply } = outdoorFacts(question, report, profile);
  const lines = moments.map((moment) => momentLine(moment, lang));
  return reply ? { lines, reply } : { lines };
}

/** "Hours fit for outdoor activity for this household (…): 13:00–16:00 today", or "none in the next 24 hours". */
export function outdoorHoursLine(report: AirReport, profile: Profile, question: string): string {
  const { sensitive, spans } = outdoorHours(report, profile, question);
  const who = sensitive ? 'judged for its US EPA sensitive groups' : 'US EPA guidance for everyone';
  const hours =
    spans.length > 0
      ? spans.map((span) => spanText(span, report.current.time)).join(', ')
      : 'none in the next 24 hours';
  return `Hours fit for outdoor activity for this household (${who}): ${hours}`;
}

/** A CONTEXT line naming everyone asked about; one person only in a follow-up, where the subject can change. */
export function askedPeopleFact(
  question: string,
  lang: Lang,
  { followUp = false }: { followUp?: boolean } = {},
): string[] {
  const people = askedPeople(question);
  if (people.length === 0 || (people.length === 1 && !followUp)) return [];
  const names = people.map((p) => p.label[lang]).join(', ');
  return people.length === 1
    ? [`Person asked about: ${names}. Name them in the answer.`]
    : [`People asked about: ${names}. Answer for each of them by name.`];
}
