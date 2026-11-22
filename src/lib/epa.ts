/**
 * The one table of US EPA AQI bands and their activity guidance for particle pollution. The assistant's verdicts,
 * its prompt rule and every plan rule about going out read from it, so the plan and the assistant cannot disagree.
 */
import { aqiLevel, type AqiLevel } from './aqi.js';

/** The assistant's yes/no reading of the guide: "avoid" covers both prolonged exertion and all activity. */
export type Verdict = 'fine' | 'reduce' | 'avoid';

/**
 * The plan's finer reading of the same guide, mildest first. "avoid" is EPA's "avoid prolonged or heavy exertion";
 * "avoidAll" is "avoid all physical activity outdoors", which leaves no time of day to suggest going out.
 */
export const ACTIVITY_LEVELS = ['fine', 'reduce', 'avoid', 'avoidAll'] as const;
export type Activity = (typeof ACTIVITY_LEVELS)[number];

interface Band {
  name: string;
  range: string;
  /** The US EPA cautionary statement for particle pollution; empty when there is none. */
  caution: string;
  sensitive: Verdict;
  everyone: Verdict;
  /** Who should avoid ALL physical activity outdoors, not only prolonged or heavy exertion. */
  avoidAll: 'nobody' | 'sensitive' | 'everyone';
}

export const EPA_BANDS: Readonly<Record<AqiLevel, Band>> = {
  good: { name: 'Good', range: '0–50', caution: '', sensitive: 'fine', everyone: 'fine', avoidAll: 'nobody' },
  moderate: {
    name: 'Moderate',
    range: '51–100',
    sensitive: 'fine',
    everyone: 'fine',
    avoidAll: 'nobody',
    caution: 'unusually sensitive people should consider reducing prolonged or heavy exertion outdoors',
  },
  sensitive: {
    name: 'Unhealthy for sensitive groups',
    range: '101–150',
    sensitive: 'reduce',
    everyone: 'fine',
    avoidAll: 'nobody',
    caution: 'sensitive groups should reduce prolonged or heavy exertion outdoors',
  },
  unhealthy: {
    name: 'Unhealthy',
    range: '151–200',
    sensitive: 'avoid',
    everyone: 'reduce',
    avoidAll: 'nobody',
    caution: 'sensitive groups should avoid prolonged or heavy exertion outdoors; everyone else should reduce it',
  },
  veryUnhealthy: {
    name: 'Very unhealthy',
    range: '201–300',
    sensitive: 'avoid',
    everyone: 'avoid',
    avoidAll: 'sensitive',
    caution:
      'sensitive groups should avoid all physical activity outdoors; everyone else should avoid prolonged or heavy exertion',
  },
  hazardous: {
    name: 'Hazardous',
    range: '301+',
    sensitive: 'avoid',
    everyone: 'avoid',
    avoidAll: 'everyone',
    caution: 'everyone should avoid all physical activity outdoors',
  },
};

/** The bands from cleanest to worst. */
export const BAND_ORDER = Object.keys(EPA_BANDS) as AqiLevel[];
export const worseBand = (a: AqiLevel, b: AqiLevel): AqiLevel =>
  BAND_ORDER.indexOf(a) >= BAND_ORDER.indexOf(b) ? a : b;

/** EPA "Activity Guide" for particle pollution: what a person should do outdoors at this AQI. */
export const epaVerdict = (aqi: number, sensitive: boolean): Verdict =>
  EPA_BANDS[aqiLevel(aqi)][sensitive ? 'sensitive' : 'everyone'];

/** The same guide for a band, keeping apart "avoid hard exertion" and "avoid all outdoor activity". */
export function epaActivity(band: AqiLevel, sensitive: boolean): Activity {
  const b = EPA_BANDS[band];
  const all = b.avoidAll === 'everyone' || (sensitive && b.avoidAll === 'sensitive');
  if (all) return 'avoidAll';
  return sensitive ? b.sensitive : b.everyone;
}

export const activityRank = (a: Activity): number => ACTIVITY_LEVELS.indexOf(a);
