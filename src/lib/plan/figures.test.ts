import { describe, expect, it } from 'vitest';
import { MIXING_FLOOR_M, WIND_FLOOR_KMH, weatherFigure } from './figures';

describe('weatherFigure', () => {
  it('writes a value at or below the forecast floor as a bound, never as a precise figure', () => {
    expect(weatherFigure('mixing', 10)).toEqual({ en: 'under 50 m', hi: '50 मीटर से कम' });
    expect(weatherFigure('mixing', MIXING_FLOOR_M).en).toBe('under 50 m');
    expect(weatherFigure('wind', 0).en).toBe(`under ${WIND_FLOOR_KMH} km/h`);
  });

  it('writes a value above the floor as a rounded figure', () => {
    expect(weatherFigure('mixing', 123.4)).toEqual({ en: '≈ 123 m', hi: '≈ 123 मीटर' });
    expect(weatherFigure('wind', 3.2)).toEqual({ en: '≈ 3 km/h', hi: '≈ 3 किमी/घंटा' });
  });
});
