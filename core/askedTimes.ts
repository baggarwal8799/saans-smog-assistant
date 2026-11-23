/**
 * Times the user mentions, each judged against the forecast here: the model is handed the answer because looking
 * an hour up in a list is where it goes wrong. "Inside" uses full date-times, so midnight-crossing spans work.
 */
import { isoDateHour, isoHour, isoMinute } from './isoTime.js';
import { TIME } from './timePattern.js';
import type { AirReport, HourPoint, Plan } from './types.js';
import { addHours, endTime, isLaterDay, type Span, within } from './windows.js';

type ClockTime = Readonly<{ hour: number; minute: number }>;

/** More asked times would crowd CONTEXT. */
const MAX_ASKED_TIMES = 4;

function fromAmPm(hour: number, ampm: string): number | null {
  if (hour < 1 || hour > 12) return null;
  return (hour % 12) + (ampm.toLowerCase() === 'p' ? 12 : 0);
}

/** शाम 6 = 18, रात 2 = 02, रात 12 = 00. */
function fromDayPart(hour: number, part: string): number {
  if (part === 'सुबह') return hour % 12;
  if (part === 'रात') {
    if (hour === 12) return 0;
    return hour >= 6 ? hour + 12 : hour;
  }
  return hour === 12 ? 12 : hour + 12; // दोपहर, शाम
}

function toHour(hour: number, ampm: string | undefined, part: string | undefined): number | null {
  if (ampm) return fromAmPm(hour, ampm);
  if (part && hour >= 1 && hour <= 12) return fromDayPart(hour, part);
  return hour <= 23 ? hour : null;
}

/** So "७:३०" and "70 साल" read like "7:30" and "70 साल". */
export const asciiDigits = (text: string): string =>
  text.normalize('NFC').replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966));

/** Null for a bare number, which is not a time, or for an impossible hour. */
function clockTime(match: RegExpExecArray): ClockTime | null {
  const { part, hour, minute, ampm, baje } = match.groups ?? {};
  if (minute === undefined && ampm === undefined && baje === undefined) return null;
  const hour24 = toHour(Number(hour), ampm, part);
  return hour24 === null ? null : { hour: hour24, minute: Number(minute ?? 0) };
}

/** Every distinct time in `texts`, in the order first mentioned. */
export function parseTimes(texts: readonly string[]): ClockTime[] {
  const out: ClockTime[] = [];
  for (const match of texts.flatMap((text) => [...asciiDigits(text).matchAll(TIME)])) {
    const time = clockTime(match);
    if (time && !out.some((t) => t.hour === time.hour && t.minute === time.minute)) out.push(time);
  }
  return out;
}

export type DayPartName = 'morning' | 'afternoon' | 'evening' | 'night';

/** One clock time, or a part of the day as the hours it covers. */
export interface AskedTime {
  hours: readonly number[];
  /** 0 for a part of the day. */
  minute: number;
  /** Null for a clock time. */
  dayPart: DayPartName | null;
}

type DayPart = Readonly<{ name: DayPartName; hours: readonly number[]; said: RegExp }>;

const dayPart = (name: DayPartName, words: string, from: number, to: number): DayPart => ({
  name,
  hours: Array.from({ length: to - from }, (_, i) => from + i),
  said: new RegExp(`(?<![\\p{L}\\p{M}])(?:${words})(?![\\p{L}\\p{M}])`, 'iu'),
});
/** The one table of day parts, so every reader of a time agrees on the hours each covers. */
const DAY_PARTS = [
  dayPart('morning', 'morning|सुबह', 6, 10),
  dayPart('afternoon', 'afternoon|noon|दोपहर', 12, 16),
  dayPart('evening', 'evening|शाम', 17, 20),
  dayPart('night', 'night|tonight|रात', 20, 24),
];

/** Clock times first ("शाम 6 बजे"), then each other part of the day the text names. */
export function askedTimes(text: string): AskedTime[] {
  const clock = parseTimes([text]);
  const rest = asciiDigits(text).replace(TIME, ' ');
  const parts = DAY_PARTS.filter((p) => p.said.test(rest) && !clock.some((t) => p.hours.includes(t.hour)));
  return [
    ...clock.map((t) => ({ hours: [t.hour], minute: t.minute, dayPart: null })),
    ...parts.map(({ name, hours }) => ({ hours, minute: 0, dayPart: name })),
  ];
}

/** "07:30" on the day of forecast hour `point`. */
const instant = (time: AskedTime, point: HourPoint): string =>
  `${isoDateHour(point.time)}:${String(time.minute).padStart(2, '0')}`;

/**
 * The worst hour is the conservative one to judge. A clock time counts only from now on; a part of the day counts
 * each hour that has not yet ended.
 */
export function forecastAt(time: AskedTime, report: AirReport): { points: HourPoint[]; worst: HourPoint | undefined } {
  const now = isoMinute(report.current.time);
  const horizon = addHours(now, 24);
  const span = time.hours.length > 1;
  const points = report.hourly.filter((point) => {
    const askedAt = instant(time, point);
    const ahead = span ? endTime(point.time) > now : askedAt >= now;
    return time.hours.includes(Number(isoHour(point.time))) && ahead && askedAt < horizon;
  });
  const worst = points.reduce<HourPoint | undefined>((w, p) => (w && w.usAqi >= p.usAqi ? w : p), undefined);
  return { points, worst };
}

export type SpanRelation = 'inside' | 'before' | 'after';

function relation(time: string, span: Span): SpanRelation {
  if (within(time, span)) return 'inside';
  return isoMinute(span.start) > isoMinute(time) ? 'before' : 'after';
}

export type SpanCheck = Readonly<{ span: Span; inside: boolean }>;

export interface AskedForecast {
  worst: HourPoint;
  /** A part of the day covers several forecast hours, so its worst one is named. */
  severalHours: boolean;
  day: 'today' | 'tomorrow';
  /** Asked for "today" at a time already past, so the figures are for tomorrow. */
  passedToday: boolean;
  smogTrap: SpanCheck | null;
  worstWindow: SpanCheck | null;
  bestWindow: SpanCheck | null;
}

export interface AskedTimeFact {
  time: AskedTime;
  now: string;
  /** Null when the time is beyond the 24 h forecast. */
  forecast: AskedForecast | null;
}

/** `saidToday` when the question says "today": a time that has passed is then answered for tomorrow. */
export function askedTimeFact(
  time: AskedTime,
  report: AirReport,
  plan: Plan,
  { saidToday }: { saidToday: boolean } = { saidToday: false },
): AskedTimeFact {
  const now = report.current.time;
  const { points, worst } = forecastAt(time, report);
  if (!worst) return { time, now, forecast: null };
  // A part of the day is inside a span when any of its hours is.
  const check = (span: Span | null): SpanCheck | null =>
    span && { span, inside: points.some((point) => within(instant(time, point), span)) };
  const day = isLaterDay({ start: instant(time, worst) }, now) ? 'tomorrow' : 'today';
  const forecast: AskedForecast = {
    worst,
    severalHours: points.length > 1,
    day,
    passedToday: saidToday && day === 'tomorrow',
    smogTrap: check(plan.smogTrap),
    worstWindow: check(plan.worstWindow),
    bestWindow: check(plan.bestWindow),
  };
  return { time, now, forecast };
}

export type SpanPosition = Readonly<{ span: Span; relation: SpanRelation }>;
type NowFact = Readonly<{ now: string; smogTrap: SpanPosition | null; worstWindow: SpanPosition | null }>;

/** The model may call a span current only from this. */
export function nowFact(report: AirReport, plan: Pick<Plan, 'smogTrap' | 'worstWindow'>): NowFact {
  const now = report.current.time;
  const position = (span: Span | null): SpanPosition | null => span && { span, relation: relation(now, span) };
  return { now, smogTrap: position(plan.smogTrap), worstWindow: position(plan.worstWindow) };
}

const TODAY = /\btoday\b|\btonight\b|\bthis (morning|afternoon|evening)\b|आज/i;

export function askedTimeFacts(texts: readonly string[], report: AirReport, plan: Plan): AskedTimeFact[] {
  const question = texts[0] ?? '';
  const saidToday = TODAY.test(question);
  // Earlier questions' times count only when this one names none: "his evening walk?" is not the 7:30 asked before.
  const own = askedTimes(question);
  const earlier = texts.slice(1).map(askedTimes);
  const times = own.length > 0 ? own : (earlier.find((found) => found.length > 0) ?? []);
  return times.slice(0, MAX_ASKED_TIMES).map((time) => askedTimeFact(time, report, plan, { saidToday }));
}
