/**
 * One concern level for the whole app, from the US EPA bands. Every priority, every caution phrase (masks, staying
 * in, shutting windows) and every UI label reads from it, so a clean-air day cannot get smog-day urgency anywhere.
 */
import { aqiLevel, pm25Level, type AqiLevel } from './aqi.js';
import { epaActivity, worseBand } from './epa.js';
import type { MessageKey } from './i18n-en.js';
import { CONCERN_LEVELS, type Concern, type Recommendation, type TimeWindow } from './types.js';

const BY_BAND: Readonly<Record<AqiLevel, Concern>> = {
  good: 'low',
  moderate: 'moderate',
  sensitive: 'high',
  unhealthy: 'severe',
  veryUnhealthy: 'severe',
  hazardous: 'severe',
};

const rank = (c: Concern): number => CONCERN_LEVELS.indexOf(c);
export const atLeast = (c: Concern, min: Concern): boolean => rank(c) >= rank(min);

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
export const cautious = (c: Concern): boolean => atLeast(c, 'high');

/** Walking and cycling mean heavy breathing: suggested only where the EPA guide puts no limit on that person. */
export const activeTravelOk = (band: AqiLevel, sensitive: boolean): boolean => epaActivity(band, sensitive) === 'fine';

/** A priority that rises with concern: 1 from `from` up, 2 one level below it, 3 below that. */
export function scaled(c: Concern, from: Concern): Recommendation['priority'] {
  const gap = rank(from) - rank(c);
  if (gap <= 0) return 1;
  return gap === 1 ? 2 : 3;
}

/** A time may be called good or best for going out only when its own PM2.5 is at most "Moderate" (≤ 35.4 µg/m³). */
export const fineToGoOut = (pm25: number): boolean => !cautious(BY_BAND[pm25Level(pm25)]);

/**
 * The UI labels for the cleanest window: "best" wording only when that window's own air allows it, and no "if you
 * must go out" when the EPA guide says the household should avoid all physical activity outdoors.
 */
export function bestLabels(w: TimeWindow | null, avoidAllOutdoors = false): { window: MessageKey; key: MessageKey } {
  if (avoidAllOutdoors) return { window: 'bestWindowStayIn', key: 'keyBestNeutral' };
  if (w && fineToGoOut(w.avgPm25)) return { window: 'bestWindow', key: 'keyBest' };
  return { window: 'bestWindowNeutral', key: 'keyBestNeutral' };
}
