/**
 * A deterministic grid of air reports × households × languages × places for the plan invariant tests.
 * The full product is millions of cases, so the dimensions that shape the plan most (commute, distance, AQI,
 * weather, language) are crossed in full and the rest are drawn from a seeded generator, which still covers
 * every value of every dimension hundreds of times.
 */
import { buildPlan } from '../lib/recommend';
import {
  COMMUTE_MODES,
  COOKING_FUELS,
  HEATING_TYPES,
  type AirReport,
  type HourPoint,
  type Lang,
  type Place,
  type Plan,
  type Profile,
} from '../lib/types';
import { PM_BY_HOUR, aqiForPm25, o3ForAqi, pm25ForAqi } from './fixtures';

export const DISTANCES = [0, 2, 6, 15, 40] as const;
/** 31 is the live Reykjavik case: "Good" air on an ozone-dominant day. */
export const AQIS = [20, 31, 75, 120, 155, 210, 320] as const;
export const WEATHERS = ['none', 'nightTrap', 'dayTrap', 'longTrap', 'ozone'] as const;
export type Weather = (typeof WEATHERS)[number];
export const LANGS: readonly Lang[] = ['en', 'hi'];
export const INDIA: Place = { name: 'New Delhi', lat: 28.61, lon: 77.21, region: 'Delhi', country: 'India' };
export const BHARAT: Place = { name: 'लखनऊ', lat: 26.85, lon: 80.95, region: 'उत्तर प्रदेश', country: 'भारत' };
export const ABROAD: Place = {
  name: 'Salt Lake City',
  lat: 40.76,
  lon: -111.89,
  region: 'Utah',
  country: 'United States',
};
export const PLACES: readonly Place[] = [INDIA, BHARAT, ABROAD];
export const START_HOURS = [0, 5, 6, 9, 13, 17, 18, 21, 23] as const;
export const HOUSEHOLD_FLAGS = ['hasChildren', 'hasElderly', 'hasRespiratory', 'hasPurifier', 'burnsWaste'] as const;

const T0 = Date.UTC(2026, 10, 17);
/** Local ISO time `h` hours after midnight on 17 Nov 2026, rolling over days and months correctly. */
export const at = (h: number): string => new Date(T0 + h * 3_600_000).toISOString().slice(0, 16);

const MEAN_SHAPE = PM_BY_HOUR.reduce((s, v) => s + v, 0) / PM_BY_HOUR.length;
const r1 = (v: number): number => Math.round(v * 10) / 10;

function trapped(weather: Weather, hour: number, offset: number): boolean {
  if (weather === 'nightTrap') return hour >= 18 || hour < 8;
  if (weather === 'dayTrap') return hour >= 10 && hour < 16;
  // 22 hours of still air starting at the next full hour.
  if (weather === 'longTrap') return offset >= 1 && offset <= 22;
  return false;
}

export interface AirCase {
  aqi: number;
  weather: Weather;
  startHour: number;
  place: Place;
}

/** 48 hours of forecast with the usual winter shape, scaled so the PM2.5 is consistent with the AQI. */
export function airReport({ aqi, weather, startHour, place }: AirCase): AirReport {
  const ozoneDay = weather === 'ozone';
  // On an ozone day ozone drives the AQI, so PM2.5 sits lower than the headline number.
  const pm = pm25ForAqi(ozoneDay ? aqi / 2 : aqi);
  const o3Peak = ozoneDay ? o3ForAqi(aqi) : 30;
  const hourly: HourPoint[] = [];
  for (let i = 0; i < 48; i++) {
    const h = (startHour + i) % 24;
    const pm25 = r1((pm * (PM_BY_HOUR[h] ?? MEAN_SHAPE)) / MEAN_SHAPE);
    const sun = Math.max(0, Math.sin((Math.PI * (h - 8)) / 12));
    const o3 = r1(ozoneDay ? o3Peak * (0.3 + 0.7 * sun) : o3Peak);
    const point: HourPoint = { time: at(startHour + i), pm25, usAqi: aqiForPm25(pm25), o3 };
    if (weather !== 'none' && weather !== 'ozone') {
      const still = trapped(weather, h, i);
      point.windKmh = still ? 3 : 12;
      point.mixingM = still ? 40 : 900;
    }
    hourly.push(point);
  }
  return {
    place,
    timezone: 'UTC',
    current: {
      time: at(startHour),
      usAqi: aqi,
      pm25: r1(pm),
      pm10: r1(pm * 1.6),
      no2: 40,
      o3: r1(o3Peak * 0.8),
      dominant: ozoneDay ? 'o3' : 'pm25',
    },
    hourly,
  };
}

/** mulberry32: a tiny seeded generator, so the sampled grid is the same on every run. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface Scenario extends AirCase {
  name: string;
  lang: Lang;
  profile: Profile;
  report: AirReport;
}

export interface Case extends Scenario {
  plan: Plan;
}

let cache: Case[] | null = null;

type Dims = Pick<Profile, 'commuteMode' | 'commuteKm'> & { aqi: number; weather: Weather; lang: Lang };

/** One scenario; the random draws happen in a fixed order, so the grid is the same on every run. */
function makeCase({ commuteMode, commuteKm, aqi, weather, lang }: Dims, rand: () => number): Case {
  const pick = <T>(values: readonly T[]): T => values[Math.floor(rand() * values.length)] as T;
  const air: AirCase = { aqi, weather, startHour: pick(START_HOURS), place: pick(PLACES) };
  const flags = Object.fromEntries(HOUSEHOLD_FLAGS.map((f) => [f, rand() < 0.5])) as Record<
    (typeof HOUSEHOLD_FLAGS)[number],
    boolean
  >;
  const profile: Profile = {
    householdSize: 1 + Math.floor(rand() * 6),
    commuteMode,
    commuteKm,
    exerciseMinutes: pick([0, 30, 60]),
    cooking: pick(COOKING_FUELS),
    heating: pick(HEATING_TYPES),
    ...flags,
  };
  const report = airReport(air);
  const where = `${air.place.country ?? ''} @${air.startHour}h`;
  const name = `${commuteMode} ${commuteKm} km, AQI ${aqi}, ${weather}, ${lang}, ${where} ${JSON.stringify(profile)}`;
  return { ...air, name, lang, profile, report, plan: buildPlan(report, profile, lang) };
}

function buildCases(): Case[] {
  const rand = seeded(20261118);
  const out: Case[] = [];
  for (const commuteMode of COMMUTE_MODES)
    for (const commuteKm of DISTANCES)
      for (const aqi of AQIS)
        for (const weather of WEATHERS)
          for (const lang of LANGS) out.push(makeCase({ commuteMode, commuteKm, aqi, weather, lang }, rand));
  return out;
}

/** Every scenario with its plan, built once per test file. */
export const cases = (): Case[] => (cache ??= buildCases());
