import { describe, expect, it } from 'vitest';

import { DELHI, openMeteoPayload } from '../test/fixtures.js';
import { dominantPollutant, parseAirResponse } from './aqi.js';

describe('dominantPollutant', () => {
  it('names the pollutant with the highest US AQI sub-index, skipping missing ones', () => {
    expect(
      dominantPollutant({ us_aqi_pm2_5: 180, us_aqi_pm10: 120, us_aqi_ozone: 'n/a', us_aqi_nitrogen_dioxide: 40 }),
    ).toBe('pm25');
    expect(dominantPollutant({ us_aqi_pm2_5: 60, us_aqi_ozone: 155 })).toBe('o3');
    expect(dominantPollutant({})).toBeNull();
  });

  it('is carried into the parsed report', () => {
    const raw = openMeteoPayload(10);
    const r = parseAirResponse({ ...raw, current: { ...raw.current, us_aqi_pm10: 90, us_aqi_ozone: 30 } }, DELHI);
    expect(r.current.dominant).toBe('pm10');
  });
});

describe('parseAirResponse hourly edge cases', () => {
  const current = openMeteoPayload(0).current;

  it('reads a non-object hourly block as no forecast hours, and defaults the timezone', () => {
    const r = parseAirResponse({ current, hourly: 'oops' }, DELHI);
    expect(r.hourly).toEqual([]);
    expect(r.timezone).toBe('auto');
  });

  it('drops hours past the end of a shorter PM2.5 series, and keeps ozone only where it is known', () => {
    const time = ['2026-11-17T00:00', '2026-11-17T01:00', '2026-11-17T02:00'];
    const r = parseAirResponse(
      { current, hourly: { time, pm2_5: [80, 90], us_aqi: [160, 170, 180], ozone: [null, 40] } },
      DELHI,
    );
    expect(r.hourly).toEqual([
      { time: time[0], pm25: 80, usAqi: 160 },
      { time: time[1], pm25: 90, usAqi: 170, o3: 40 },
    ]);
  });
});
