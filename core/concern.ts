/**
 * One concern level for the whole app, from the US EPA bands. Every priority, every caution phrase (masks, staying
 * in, shutting windows) and every UI label reads from it, so a clean-air day cannot get smog-day urgency anywhere.
 */
import { aqiLevel, pm25Level } from './aqi.js';
import { epaActivity, type Person, worseBand } from './epa.js';
import { type AqiLevel, type Concern, CONCERN_LEVELS, type Recommendation } from './types.js';

const BY_BAND: Readonly<Record<AqiLevel, Concern>> = {
  good: 'low',
  moderate: 'moderate',
  sensitive: 'high',
  unhealthy: 'severe',
  veryUnhealthy: 'severe',
  hazardous: 'severe',
};

const rank = (concern: Concern): number => CONCERN_LEVELS.indexOf(concern);
const atLeast = (concern: Concern, min: Concern): boolean => rank(concern) >= rank(min);

/**
 * The plan's US EPA band: the worse of the AQI band and the band of the current PM2.5 reading, since the AQI is a
 * 24-hour average and lags a spike. Every activity rule and the concern level read this one band.
 */
export function planBand(aqi: number, pm25: number): AqiLevel {
  const byAqi = aqiLevel(aqi);
  return Number.isFinite(pm25) ? worseBand(byAqi, pm25Level(pm25)) : byAqi;
}

export const concernLevel = (aqi: number, pm25: number): Concern => BY_BAND[planBand(aqi, pm25)];

/** From "Unhealthy for sensitive groups" up, the app tells people to protect themselves: N95s, staying in. */
export const cautious = (concern: Concern): boolean => atLeast(concern, 'high');

/** Walking and cycling mean heavy breathing: suggested only where the EPA guide puts no limit on that person. */
export const activeTravelOk = (band: AqiLevel, person: Person): boolean => epaActivity(band, person) === 'fine';

/** A priority that rises with concern: 1 from `from` up, 2 one level below it, 3 below that. */
export function scaled(concern: Concern, from: Concern): Recommendation['priority'] {
  const gap = rank(from) - rank(concern);
  if (gap <= 0) return 1;
  return gap === 1 ? 2 : 3;
}

/** A time may be called good or best for going out only when its own PM2.5 is at most "Moderate" (≤ 35.4 µg/m³). */
export const fineToGoOut = (pm25: number): boolean => !cautious(BY_BAND[pm25Level(pm25)]);
