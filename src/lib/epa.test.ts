import { describe, expect, it } from 'vitest';
import { aqiLevel } from './aqi';
import { BAND_ORDER, EPA_BANDS, activityRank, epaActivity, epaVerdict } from './epa';

describe('the US EPA activity table', () => {
  it('the plan\'s finer level collapses to exactly the assistant\'s verdict at every AQI', () => {
    for (let aqi = 0; aqi <= 500; aqi++) {
      for (const sensitive of [true, false]) {
        const level = epaActivity(aqiLevel(aqi), sensitive);
        expect(level === 'avoidAll' ? 'avoid' : level, `AQI ${aqi}`).toBe(epaVerdict(aqi, sensitive));
      }
    }
  });

  it('"avoid all physical activity" applies exactly where the EPA statement says it', () => {
    for (const band of BAND_ORDER) {
      const { caution } = EPA_BANDS[band];
      expect(epaActivity(band, true) === 'avoidAll', band).toBe(/(sensitive groups|everyone) should avoid all physical activity/.test(caution));
      expect(epaActivity(band, false) === 'avoidAll', band).toBe(/everyone should avoid all physical activity/.test(caution));
    }
  });

  it('never gets milder as the band worsens, and is never milder for sensitive groups', () => {
    BAND_ORDER.forEach((band, i) => {
      const prev = BAND_ORDER[i - 1];
      for (const s of [true, false]) if (prev) expect(activityRank(epaActivity(band, s))).toBeGreaterThanOrEqual(activityRank(epaActivity(prev, s)));
      expect(activityRank(epaActivity(band, true))).toBeGreaterThanOrEqual(activityRank(epaActivity(band, false)));
    });
  });
});
