/** Time windows over the hourly forecast: cleanest and dirtiest hours, and how to name them. */
import type { HourPoint, Lang, TimeWindow } from './types.js';

/** Where each pollutant becomes unhealthy for sensitive groups (US EPA): PM2.5 35 µg/m³; ozone ≈ 137 µg/m³ = 70 ppb. */
export const PM25_SENSITIVE_UG = 35;
export const OZONE_SENSITIVE_UG = 137;
/** A "go out" hour must sit clearly under the ozone limit, not just under it: 90% of it (≈ 123 µg/m³). */
export const GO_OUT_OZONE_MAX_UG = OZONE_SENSITIVE_UG * 0.9;

/**
 * Health-weighted score for choosing time windows: each pollutant relative to its sensitive-group limit.
 * Afternoons often have the lowest PM2.5 but the highest ozone, so PM2.5 alone would send people out at the ozone peak.
 */
export function airScore(p: HourPoint): number {
  return p.pm25 / PM25_SENSITIVE_UG + (p.o3 ?? 0) / OZONE_SENSITIVE_UG;
}

/** An hour that may be part of a "best" window: its ozone, when known, clears the go-out limit. */
const goOutOk = (p: HourPoint): boolean => p.o3 === undefined || p.o3 < GO_OUT_OZONE_MAX_UG;

export function averagePm25(points: readonly HourPoint[], fallback: number): number {
  const day = points.slice(0, 24);
  if (day.length === 0) return fallback;
  return day.reduce((sum, p) => sum + p.pm25, 0) / day.length;
}

function hourOf(time: string): number {
  return Number(time.slice(11, 13));
}

/**
 * Cleanest (or dirtiest) `hours`-long daytime window in the next 24 h, 06:00–21:00 local time,
 * when people realistically go out. A "best" window never includes an hour over the ozone go-out limit.
 */
export function findWindow(
  points: readonly HourPoint[],
  hours = 2,
  pick: 'best' | 'worst' = 'best',
  scoreOf: (p: HourPoint) => number = airScore,
): TimeWindow | null {
  const day = points.slice(0, 24);
  let chosen: { score: number; window: TimeWindow } | null = null;
  for (let i = 0; i + hours <= day.length; i++) {
    const slice = day.slice(i, i + hours);
    const candidate = daytimeWindow(slice, pick, scoreOf);
    if (candidate && beats(candidate.score, chosen, pick)) chosen = candidate;
  }
  return chosen?.window ?? null;
}

/** The slice as a window with its mean score; null for an empty slice or one that is not daytime. */
function daytimeWindow(
  slice: readonly HourPoint[],
  pick: 'best' | 'worst',
  scoreOf: (p: HourPoint) => number,
): { score: number; window: TimeWindow } | null {
  const first = slice[0];
  const last = slice.at(-1);
  if (!first || !last || !isDaytimeSlice(slice, first, pick)) return null;
  const score = slice.reduce((s, p) => s + scoreOf(p), 0) / slice.length;
  return { score, window: toWindow(slice, first.time, endTime(last.time)) };
}

/** True when `score` is a better pick than the window chosen so far (lower for "best", higher for "worst"). */
function beats(score: number, chosen: { score: number } | null, pick: 'best' | 'worst'): boolean {
  if (chosen === null) return true;
  return pick === 'best' ? score < chosen.score : score > chosen.score;
}

/** Consecutive hours inside 06:00–21:00; for a "best" window, every hour also clears the ozone go-out limit. */
function isDaytimeSlice(slice: readonly HourPoint[], first: HourPoint, pick: 'best' | 'worst'): boolean {
  const startH = hourOf(first.time);
  // Measured from the start so a window that wraps past midnight can never count as daytime.
  const endH = startH + slice.length;
  const contiguous = slice.every((p, k) => k === 0 || hourOf(p.time) === (startH + k) % 24);
  return contiguous && startH >= 6 && endH <= 21 && (pick === 'worst' || slice.every(goOutOk));
}

function toWindow(slice: readonly HourPoint[], start: string, end: string): TimeWindow {
  const window: TimeWindow = { start, end, avgPm25: slice.reduce((s, p) => s + p.pm25, 0) / slice.length };
  const o3 = slice.map((p) => p.o3);
  if (o3.every((v): v is number => v !== undefined)) window.avgO3 = o3.reduce((s, v) => s + v, 0) / slice.length;
  return window;
}

/** True when the window falls on a later calendar day than `now` (both local ISO times). */
export function isLaterDay(window: Pick<TimeWindow, 'start'>, now: string): boolean {
  return window.start.slice(0, 10) > now.slice(0, 10);
}

/**
 * `time` plus `hours`, as a local ISO date-time to the minute. Local wall-clock times are treated as UTC, so the
 * maths is exact and a day, month or year rolls over correctly.
 */
export function addHours(time: string, hours: number): string {
  const next = new Date(`${time.slice(0, 16)}:00Z`);
  next.setUTCHours(next.getUTCHours() + hours);
  return next.toISOString().slice(0, 16);
}

/** The hour after `lastHour`, rolling over to the next day at midnight. */
export const endTime = (lastHour: string): string => addHours(`${lastHour.slice(0, 13)}:00`, 1);

export type Span = Pick<TimeWindow, 'start' | 'end'>;

/**
 * True when `time` lies in [start, end). Full ISO date-times are compared, never hours of the day: 10:30 is not
 * inside a span that starts at 16:00, and 07:00 tomorrow is inside one that runs 18:00 today to 08:00 tomorrow.
 */
export const within = (time: string, w: Span): boolean =>
  time.slice(0, 16) >= w.start.slice(0, 16) && time.slice(0, 16) < w.end.slice(0, 16);

/** "15:00–17:00 today", or "16:00 today to 10:00 tomorrow" for a span past midnight: every day is named. */
export function spanText(w: Span, now: string): string {
  const startDay = isLaterDay(w, now) ? 'tomorrow' : 'today';
  if (w.end.slice(0, 10) <= w.start.slice(0, 10)) return `${formatHour(w.start)}–${formatHour(w.end)} ${startDay}`;
  return `${formatHour(w.start)} ${startDay} to ${formatHour(w.end)} ${startDay === 'today' ? 'tomorrow' : 'the day after'}`;
}

/** Where each part of the day starts, latest first, so an evening window is never called "daytime". */
const NIGHT = { en: 'night', hi: 'रात' } as const;
const PARTS: readonly (readonly [number, Readonly<Record<Lang, string>>])[] = [
  [21, NIGHT],
  [17, { en: 'evening', hi: 'शाम' }],
  [12, { en: 'afternoon', hi: 'दोपहर' }],
  [5, { en: 'morning', hi: 'सुबह' }],
];

/** The part of day a window starting at `start` falls in: morning, afternoon, evening or night. */
export function partOfDay(start: string): Readonly<Record<Lang, string>> {
  const h = hourOf(start);
  return PARTS.find(([from]) => h >= from)?.[1] ?? NIGHT;
}

export function formatHour(time: string): string {
  return time.slice(11, 16);
}
