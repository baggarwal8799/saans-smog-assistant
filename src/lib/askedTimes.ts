/**
 * Times the user mentions, each turned into a computed fact line: the model is handed the answer because looking
 * an hour up in a list is where it goes wrong. "Inside" uses full date-times, so midnight-crossing spans work.
 */
import { addHours, endTime, formatHour, isLaterDay, spanText, within, type Span } from './windows.js';
import type { AirReport, HourPoint, Plan } from './types.js';

export interface ClockTime {
  h: number;
  m: number;
}

/** At most this many asked times get a fact line; more would crowd CONTEXT. */
const MAX_ASKED_TIMES = 4;

const PART = 'सुबह|दोपहर|शाम|रात';
/** A time as said: "7:30", "7 am", "6 p.m.", "शाम 6 बजे", "सुबह को 7:30"; groups: part, hour, minute, a/p, बजे. */
const TIME = new RegExp(
  String.raw`(?:(${PART})\s+(?:को\s+)?)?(?<![\d:.])(\d{1,2})(?::([0-5]\d))?` +
    String.raw`(?:\s*([ap])\.?\s?m\b\.?|\s*(बजे))?(?![\d:])`,
  'giu',
);

function fromAmPm(h: number, ampm: string): number | null {
  if (h < 1 || h > 12) return null;
  return (h % 12) + (ampm.toLowerCase() === 'p' ? 12 : 0);
}

/** A 1–12 hour after a Hindi day part: शाम 6 = 18, रात 2 = 02, रात 12 = 00. */
function fromDayPart(h: number, part: string): number {
  if (part === 'सुबह') return h % 12;
  if (part === 'रात') {
    if (h === 12) return 0;
    return h >= 6 ? h + 12 : h;
  }
  return h === 12 ? 12 : h + 12; // दोपहर, शाम
}

/** 24-hour hour for an hour as said: with am/pm, a Hindi day part, or as written on the 24-hour clock. */
function toHour(h: number, ampm: string | undefined, part: string | undefined): number | null {
  if (ampm) return fromAmPm(h, ampm);
  if (part && h >= 1 && h <= 12) return fromDayPart(h, part);
  return h <= 23 ? h : null;
}

/** NFC text with Devanagari digits as ASCII, so "७:३०" and "70 साल" read like "7:30" and "70 साल". */
export const asciiDigits = (text: string): string =>
  text.normalize('NFC').replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));

/** Every distinct time in `texts`, in the order first mentioned. */
export function parseTimes(texts: readonly string[]): ClockTime[] {
  const out: ClockTime[] = [];
  for (const text of texts) {
    for (const m of asciiDigits(text).matchAll(TIME)) {
      const [, part, hour, minute, ampm, baje] = m;
      if (minute === undefined && ampm === undefined && baje === undefined) continue; // a bare number is not a time
      const h = toHour(Number(hour), ampm, part);
      if (h === null) continue;
      const time = { h, m: Number(minute ?? 0) };
      if (!out.some((t) => t.h === time.h && t.m === time.m)) out.push(time);
    }
  }
  return out;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const hhmm = (h: number, m: number): string => `${pad(h)}:${pad(m)}`;

/** A time a question asks about: one clock time, or a part of the day as the hours it covers. */
export interface AskedTime {
  /** "07:30", or "morning (06:00–10:00)". */
  label: string;
  hours: readonly number[];
  /** Minutes past the hour (0 for a part of the day). */
  m: number;
}

const dayPart = (name: string, words: string, from: number, to: number) => ({
  label: `${name} (${hhmm(from, 0)}–${hhmm(to % 24, 0)})`,
  hours: Array.from({ length: to - from }, (_, i) => from + i),
  said: new RegExp(`(?<![\\p{L}\\p{M}])(?:${words})(?![\\p{L}\\p{M}])`, 'iu'),
});
/** The one table of day parts a question can name, and the hours each covers. Every reader of a time uses it. */
const DAY_PARTS = [
  dayPart('morning', 'morning|सुबह', 6, 10),
  dayPart('afternoon', 'afternoon|noon|दोपहर', 12, 16),
  dayPart('evening', 'evening|शाम', 17, 20),
  dayPart('night', 'night|tonight|रात', 20, 24),
];

/**
 * The times `text` asks about: its clock times, then each part of the day it names that is not already one of
 * them ("शाम 6 बजे" and "7:30 in the morning" are clock times). "Morning walk" alone becomes 06:00–10:00.
 */
export function askedTimes(text: string): AskedTime[] {
  const clock = parseTimes([text]);
  const rest = asciiDigits(text).replace(TIME, ' ');
  const parts = DAY_PARTS.filter((p) => p.said.test(rest) && !clock.some((t) => p.hours.includes(t.h)));
  return [
    ...clock.map((t) => ({ label: hhmm(t.h, t.m), hours: [t.h], m: t.m })),
    ...parts.map(({ label, hours }) => ({ label, hours, m: 0 })),
  ];
}

/** The date-time an asked time means on the forecast hour `p`: "07:30" on that hour's day. */
const instant = (time: AskedTime, p: HourPoint): string => `${p.time.slice(0, 14)}${pad(time.m)}`;

/**
 * The forecast hours in the next 24 h a time covers, and the worst of them by US AQI: the conservative one to
 * judge. A clock time counts only from now on; a part of the day counts each hour that has not yet ended.
 */
export function forecastAt(time: AskedTime, report: AirReport): { points: HourPoint[]; worst: HourPoint | undefined } {
  const now = report.current.time.slice(0, 16);
  const horizon = addHours(now, 24);
  const span = time.hours.length > 1;
  const points = report.hourly.filter((p) => {
    const at = instant(time, p);
    const ahead = span ? endTime(p.time) > now : at >= now;
    return time.hours.includes(Number(p.time.slice(11, 13))) && ahead && at < horizon;
  });
  const worst = points.reduce<HourPoint | undefined>((w, p) => (w && w.usAqi >= p.usAqi ? w : p), undefined);
  return { points, worst };
}

function trapFact(inside: boolean, trap: Span, now: string): string {
  return `${inside ? 'INSIDE' : 'outside'} the smog trap (${spanText(trap, now)})`;
}

/** Where `at` stands against span `w`, compared on full date-times. */
function relation(at: string, w: Span): 'INSIDE' | 'before' | 'after' {
  if (within(at, w)) return 'INSIDE';
  return w.start.slice(0, 16) > at.slice(0, 16) ? 'before' : 'after';
}

/** "Asked time 07:30 tomorrow: US AQI ≈ 98, …, INSIDE the smog trap (17:00 today to 10:00 tomorrow), …". */
export function askedTimeFact(time: AskedTime, report: AirReport, plan: Plan, saidToday = false): string {
  const { points, worst } = forecastAt(time, report);
  if (!worst) return `Asked time ${time.label}: outside the 24 h forecast, so no figures for it.`;
  const now = report.current.time;
  // A part of the day is INSIDE a window when any of its hours is.
  const inside = (w: Span | null): boolean => w !== null && points.some((p) => within(instant(time, p), w));
  const day = isLaterDay({ start: instant(time, worst) }, now) ? 'tomorrow' : 'today';
  const trap = plan.smogTrap;
  const worstHour = points.length > 1 ? `worst hour ${formatHour(worst.time)}, ` : '';
  const parts = [
    `${worstHour}US AQI ≈ ${Math.round(worst.usAqi)}, PM2.5 ≈ ${Math.round(worst.pm25)} µg/m³`,
    trap ? trapFact(inside(trap), trap, now) : 'no smog trap forecast',
  ];
  const yesNo = (w: Span): string => `(${spanText(w, now)}): ${inside(w) ? 'yes' : 'no'}`;
  if (plan.worstWindow) parts.push(`inside the most polluted window ${yesNo(plan.worstWindow)}`);
  if (plan.bestWindow) parts.push(`inside the cleanest window ${yesNo(plan.bestWindow)}`);
  // A time asked for "today" that has passed is answered for tomorrow, and the fact says so.
  const passed =
    saidToday && day === 'tomorrow' ? ` ${time.label} today has already passed; the figures are for tomorrow.` : '';
  return `Asked time ${time.label} ${day}: ${parts.join(', ')}.${passed}`;
}

/**
 * Where the current time stands against the smog trap and the most polluted window: "Now (10:30 today) is before
 * the smog trap (16:00 today to 10:00 tomorrow)". The model may call a span current only from this line.
 */
export function nowFact(report: AirReport, plan: Pick<Plan, 'smogTrap' | 'worstWindow'>): string {
  const now = report.current.time;
  const where = (name: string, w: Span | null): string => {
    if (!w) return '';
    return `${relation(now, w)} ${name} (${spanText(w, now)})`;
  };
  const parts = [where('the smog trap', plan.smogTrap), where('the most polluted window', plan.worstWindow)];
  const said = parts.filter(Boolean);
  const state = said.length > 0 ? said.join(' and ') : 'in no smog trap or polluted window';
  return `Now (${formatHour(now)} today) is ${state}.`;
}

/** The question says the time is today: "today", "tonight", "this evening", "आज". */
const TODAY = /\btoday\b|\btonight\b|\bthis (morning|afternoon|evening)\b|आज/i;

/** One fact line per time the user mentioned, for CONTEXT. */
export function askedTimeFacts(texts: readonly string[], report: AirReport, plan: Plan): string[] {
  const question = texts[0] ?? '';
  const saidToday = TODAY.test(question);
  // Earlier questions' times count only when this one names none: "his evening walk?" is not the 7:30 asked before.
  const own = askedTimes(question);
  const times =
    own.length > 0
      ? own
      : (texts
          .slice(1)
          .map(askedTimes)
          .find((t) => t.length > 0) ?? []);
  return times.slice(0, MAX_ASKED_TIMES).map((t) => askedTimeFact(t, report, plan, saidToday));
}
