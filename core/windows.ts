/** Time windows over the hourly forecast: cleanest and dirtiest hours, and how to name them. */
import { bilingual, type Text } from './copy/text.js';
import { isoClock, isoDate, isoDateHour, isoHour, isoMinute } from './isoTime.js';
import type { HourPoint, TimeWindow } from './types.js';

/** Where each pollutant becomes unhealthy for sensitive groups (US EPA): PM2.5 35 µg/m³; ozone ≈ 137 µg/m³ = 70 ppb. */
const PM25_SENSITIVE_UG = 35;
export const OZONE_SENSITIVE_UG = 137;
/** A "go out" hour must sit clearly under the ozone limit, not just under it: 90% of it (≈ 123 µg/m³). */
export const GO_OUT_OZONE_MAX_UG = OZONE_SENSITIVE_UG * 0.9;

/**
 * Health-weighted score for choosing time windows: each pollutant relative to its sensitive-group limit.
 * Afternoons often have the lowest PM2.5 but the highest ozone, so PM2.5 alone would send people out at the ozone peak.
 */
function airScore(point: HourPoint): number {
  return point.pm25 / PM25_SENSITIVE_UG + (point.o3 ?? 0) / OZONE_SENSITIVE_UG;
}

/** An hour that may be part of a "best" window: its ozone, when known, clears the go-out limit. */
const goOutOk = (point: HourPoint): boolean => point.o3 === undefined || point.o3 < GO_OUT_OZONE_MAX_UG;

export function averagePm25(points: readonly HourPoint[], fallback: number): number {
  const day = points.slice(0, 24);
  if (day.length === 0) return fallback;
  return day.reduce((sum, p) => sum + p.pm25, 0) / day.length;
}

function hourOf(time: string): number {
  return Number(isoHour(time));
}

/** Cleanest (or dirtiest) `hours`-long window in the next 24 h, within 06:00–21:00, when people go out. */
export function findWindow(
  points: readonly HourPoint[],
  hours = 2,
  pick: 'best' | 'worst' = 'best',
  scoreOf: (point: HourPoint) => number = airScore,
): TimeWindow | null {
  const day = points.slice(0, 24);
  const starts = Array.from({ length: Math.max(0, day.length - hours + 1) }, (_, i) => i);
  const chosen = starts.reduce<Scored | null>((best, start) => {
    const candidate = daytimeWindow(day.slice(start, start + hours), pick, scoreOf);
    return candidate && beats(candidate.score, best, pick) ? candidate : best;
  }, null);
  return chosen?.window ?? null;
}

interface Scored {
  score: number;
  window: TimeWindow;
}

/** The slice as a window with its mean score; null for an empty slice or one that is not daytime. */
function daytimeWindow(
  slice: readonly HourPoint[],
  pick: 'best' | 'worst',
  scoreOf: (point: HourPoint) => number,
): Scored | null {
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

export function isLaterDay(window: Pick<TimeWindow, 'start'>, now: string): boolean {
  return isoDate(window.start) > isoDate(now);
}

/** `time` plus `hours`. Wall-clock times are treated as UTC, so a day, month or year rolls over exactly. */
export function addHours(time: string, hours: number): string {
  const next = new Date(`${isoMinute(time)}:00Z`);
  next.setUTCHours(next.getUTCHours() + hours);
  return isoMinute(next.toISOString());
}

export const endTime = (lastHour: string): string => addHours(`${isoDateHour(lastHour)}:00`, 1);

export type Span = Pick<TimeWindow, 'start' | 'end'>;

/** True when `time` lies in [start, end), compared as full date-times so a span past midnight works. */
export const within = (time: string, span: Span): boolean =>
  isoMinute(time) >= isoMinute(span.start) && isoMinute(time) < isoMinute(span.end);

/** "15:00–17:00 today", or "16:00 today to 10:00 tomorrow" for a span past midnight: every day is named. */
export function spanText(span: Span, now: string): string {
  const startDay = isLaterDay(span, now) ? 'tomorrow' : 'today';
  if (isoDate(span.end) <= isoDate(span.start)) return `${formatHour(span.start)}–${formatHour(span.end)} ${startDay}`;
  const endDay = startDay === 'today' ? 'tomorrow' : 'the day after';
  return `${formatHour(span.start)} ${startDay} to ${formatHour(span.end)} ${endDay}`;
}

/** Where each part of the day starts, latest first, so an evening window is never called "daytime". */
const NIGHT = bilingual('night', 'रात');
const PARTS: readonly (readonly [number, Text])[] = [
  [21, NIGHT],
  [17, bilingual('evening', 'शाम')],
  [12, bilingual('afternoon', 'दोपहर')],
  [5, bilingual('morning', 'सुबह')],
];

export function partOfDay(start: string): Text {
  const hour = hourOf(start);
  return PARTS.find(([from]) => hour >= from)?.[1] ?? NIGHT;
}

export function formatHour(time: string): string {
  return isoClock(time);
}
