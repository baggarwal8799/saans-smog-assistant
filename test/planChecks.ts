import { impactChips } from '../core/chips.js';
import type { HourPoint, Recommendation, TimeWindow } from '../core/types.js';
import { type Case, cases } from './scenarios.js';

/** Runs a check over every scenario and returns the first few violations, each with the scenario that broke it. */
export function violations(check: (c: Case) => readonly (string | false | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const c of cases()) for (const v of check(c)) if (v) out.push(`${v} | ${c.name}`);
  return out.slice(0, 6);
}

export const texts = (r: Recommendation): string[] => [r.title, r.detail, r.impact.explanation, r.impact.scope ?? ''];
export const rec = (c: Case, id: string): Recommendation | undefined => c.plan.recommendations.find((r) => r.id === id);
export const ids = (c: Case): Set<string> => new Set(c.plan.recommendations.map((r) => r.id));
export const shown = (c: Case, r: Recommendation): string[] => [
  ...texts(r),
  ...impactChips(r.impact, c.lang).map((chip) => chip.text),
];

export const DEVANAGARI = /[\u0900-\u097F]/;

/** Words that tell people to protect themselves (masks, staying in, shutting windows), in both languages. */
export const CAUTION = new RegExp(
  [
    /N95|FFP2|\bstay (in|indoors)\b|\bkeep\b[^.]{0,40}\bindoors\b/,
    /\b(shut|close|seal)\b[^.]{0,15}\bwindows?\b|\bwindows?\b[^.]{0,8}\b(shut|closed)\b/,
    /घर में रहें|घर में रखें|खिड़कियाँ बंद|बंद खिड़कि/,
  ]
    .map((part) => part.source)
    .join('|'),
  'i',
);
/** A mask recommendation, as opposed to "no mask filters ozone". */
export const MASK = /N95|FFP2/;
export const SAFETY_IDS: ReadonlySet<string> = new Set(['safe-heating', 'gas-heater-safety', 'clean-cooking']);
export const HEATING_SAFETY: ReadonlySet<string> = new Set(['safe-heating', 'gas-heater-safety']);

/** Latin tokens that are fine inside Hindi text: units, standards, mask grades and cited authors. */
const LATIN_ALLOWED = [
  'US EPA',
  'Liu et al.',
  'Cummings & Waring',
  'MERV-13',
  'PM2.5',
  'PM10',
  'µg/m³',
  'm³',
  'CO₂',
  'N95',
  'FFP2',
  'LPG',
  'HEPA',
  'AQI',
  'RWA',
  'EPA',
] as const;

/** Runs of three or more consecutive Latin words left after removing the allowed tokens. */
export function latinRuns(text: string): string[] {
  const stripped = LATIN_ALLOWED.reduce((s, token) => s.split(token).join(' । '), text);
  // eslint-disable-next-line sonarjs/slow-regex -- test helper over short, fixed plan text
  return stripped.match(/[A-Za-z][\w'’.-]*(?:[\s,&]+[A-Za-z][\w'’.-]*){2,}/g) ?? [];
}

export const hasTomorrow = (text: string): boolean => /\btomorrow\b/i.test(text) || /(^|[\s(])कल(\s|$)/.test(text);

const nextDay = (date: string): string =>
  new Date(Date.parse(`${date}T00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** The time span a title names ("between 14:00 and 16:00", "tomorrow around 13:00–15:00"), as absolute times. */
export function titleSpan(title: string, now: string): { start: string; end: string } | null {
  const [from, to] = title.match(/\d\d:\d\d/g) ?? [];
  if (!from || !to) return null;
  // Only a "tomorrow" before the start time moves the start; one after it names the end's day.
  const day = hasTomorrow(title.slice(0, title.indexOf(from))) ? nextDay(now.slice(0, 10)) : now.slice(0, 10);
  return { start: `${day}T${from}`, end: `${to <= from ? nextDay(day) : day}T${to}` };
}

type Span = Pick<TimeWindow, 'start' | 'end'>;
export const overlaps = (a: Span | null, b: Span | null): boolean =>
  a !== null && b !== null && a.start < b.end && b.start < a.end;

/** Every 2-hour daytime window (06:00–21:00) in the next 24 h, found by brute force, independent of the engine. */
export function daytimeWindows(hourly: readonly HourPoint[]): TimeWindow[] {
  const day = hourly.slice(1, 25);
  const out: TimeWindow[] = [];
  for (let i = 0; i + 1 < day.length; i++) {
    const a = day[i];
    const b = day[i + 1];
    if (!a || !b) continue;
    const h = Number(a.time.slice(11, 13));
    if (Number(b.time.slice(11, 13)) !== (h + 1) % 24 || h < 6 || h + 2 > 21) continue;
    const w: TimeWindow = { start: a.time, end: '', avgPm25: (a.pm25 + b.pm25) / 2 };
    if (a.o3 !== undefined && b.o3 !== undefined) w.avgO3 = (a.o3 + b.o3) / 2;
    out.push(w);
  }
  return out;
}

/** Percentages that describe the tip's own effect: "40% less", "45% cleaner", "a 50% cut", "50% कम". */
export function effectPercents(text: string): number[] {
  // eslint-disable-next-line sonarjs/slow-regex -- test helper over short, fixed plan text
  const re = /(\d+)%\s*(?:less|cleaner|cut|lower|कम|साफ़)/g;
  return [...text.matchAll(re)].map((m) => Number(m[1]));
}

export const percents = (text: string): number[] =>
  // eslint-disable-next-line sonarjs/slow-regex -- test helper over short, fixed plan text
  [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));

export const POLLUTANT_NAMES = /PM2\.5|PM10|ozone|ओज़ोन|NO₂/gi;
