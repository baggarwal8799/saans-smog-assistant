import type { AqiLevel } from './aqi.js';
export type Lang = 'en' | 'hi';

export interface Place {
  name: string;
  lat: number;
  lon: number;
  region?: string;
  country?: string;
}

export interface AirSnapshot {
  /** Local time at the place, ISO without offset, e.g. 2026-11-17T12:00 */
  time: string;
  usAqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  o3: number;
  /** Pollutant with the highest US AQI sub-index, i.e. the one driving the headline AQI. */
  dominant: Pollutant | null;
}

export type Pollutant = 'pm25' | 'pm10' | 'o3' | 'no2';

export interface HourPoint {
  time: string;
  pm25: number;
  usAqi: number;
  /** Ozone, µg/m³, when the forecast has it. */
  o3?: number;
  /** Wind at 10 m, km/h (weather forecast; optional). */
  windKmh?: number;
  /** Height of the mixed layer the smoke can spread into, metres (weather forecast; optional). */
  mixingM?: number;
}

/** Hours when cold, still air holds smoke near the ground (a winter inversion). */
export interface SmogTrap {
  start: string;
  end: string;
  /** Lowest mixing height in the span, metres. */
  minMixingM: number;
  avgWindKmh: number;
}

export interface AirReport {
  place: Place;
  timezone: string;
  current: AirSnapshot;
  /** Hourly forecast starting at the current local hour (up to 48 h). */
  hourly: HourPoint[];
}

export const COMMUTE_MODES = ['car', 'motorbike', 'auto', 'bus', 'metro', 'bicycle', 'walk', 'wfh'] as const;
export type Commute = (typeof COMMUTE_MODES)[number];

export const COOKING_FUELS = ['lpg', 'png', 'electric', 'biomass', 'kerosene'] as const;
export type Cooking = (typeof COOKING_FUELS)[number];

export const HEATING_TYPES = ['none', 'electric', 'gas', 'coal', 'wood'] as const;
export type Heating = (typeof HEATING_TYPES)[number];

export interface Profile {
  householdSize: number;
  hasChildren: boolean;
  hasElderly: boolean;
  hasRespiratory: boolean;
  commuteMode: Commute;
  /** One-way distance in km. */
  commuteKm: number;
  /** Outdoor exercise per day, minutes. */
  exerciseMinutes: number;
  cooking: Cooking;
  heating: Heating;
  hasPurifier: boolean;
  burnsWaste: boolean;
}

export type RecCategory = 'routine' | 'indoor' | 'swap' | 'community';

/** How worried the app is about today's air, lowest first (US EPA bands; see src/lib/concern.ts). */
export const CONCERN_LEVELS = ['low', 'moderate', 'high', 'severe'] as const;
export type Concern = (typeof CONCERN_LEVELS)[number];

export interface Impact {
  /** kg CO2e avoided per month, when the action changes emissions. */
  co2KgPerMonth?: number;
  /** Percent cut in PM2.5 inhaled, for the activity named in `scope` only. */
  exposureCutPct?: number;
  /** The pollutant the percentage cuts. */
  pollutant?: 'PM2.5' | 'ozone';
  /** Where the percentage applies, e.g. "outdoors", "in the kitchen". */
  scope?: string;
  /** The action removes a whole pollution source rather than reducing exposure by a share. */
  removesSource?: boolean;
  /** A figure for the wider community; excluded from the household's own totals. */
  community?: boolean;
  /** Plain-language explanation of where the number comes from. */
  explanation: string;
}

export interface Recommendation {
  id: string;
  category: RecCategory;
  /** 1 = do first. */
  priority: 1 | 2 | 3;
  title: string;
  detail: string;
  impact: Impact;
  /** Life safety (carbon monoxide, heavy indoor smoke): shown in its own "Safety first" group, outside MAX_URGENT. */
  safety?: boolean;
}

export interface TimeWindow {
  start: string;
  end: string;
  avgPm25: number;
  /** Average ozone, µg/m³, when every hour in the window has it. */
  avgO3?: number;
}

export interface DoseEstimate {
  /** µg of PM2.5 inhaled per person per day. */
  baselineUg: number;
  withPlanUg: number;
  cutPct: number;
  /** People at home, so the per-person figure can be shown for the household. */
  people: number;
}

export interface Plan {
  /** The one concern level every priority, caution phrase and UI label reads from. */
  concern: Concern;
  /** The US EPA band every rule about going out reads its strictness from (concern.ts `planBand`). */
  band: AqiLevel;
  /** The EPA guide says someone in this household should avoid all physical activity outdoors today. */
  avoidAllOutdoors: boolean;
  recommendations: Recommendation[];
  bestWindow: TimeWindow | null;
  worstWindow: TimeWindow | null;
  dose: DoseEstimate;
  co2KgPerMonthTotal: number;
  smogTrap: SmogTrap | null;
  /** The plan removes or swaps an indoor smoke source, so "already low-emission" would be untrue. */
  hasSourceFixes: boolean;
  /** Cigarettes-per-day equivalent of breathing today's average outdoor air. */
  cigarettesPerDay: number;
}
