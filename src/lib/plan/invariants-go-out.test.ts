/** Invariants about "go out" windows: every hour of the best window clears the ozone limit, not just PM2.5. */
import { describe, expect, it } from 'vitest';
import { GO_OUT_OZONE_MAX_UG, findWindow } from '../windows';
import type { HourPoint } from '../types';
import { violations } from '../../test/planChecks';

describe('"go out" windows clear every pollutant limit', () => {
  it('every hour of the best window has ozone under the go-out limit (or no ozone data)', () => {
    expect(
      violations(({ plan, report }) => {
        const b = plan.bestWindow;
        if (!b) return [];
        return report.hourly
          .filter((p) => p.time >= b.start && p.time < b.end)
          .map((p) => p.o3 !== undefined && p.o3 >= GO_OUT_OZONE_MAX_UG && `ozone ${p.o3} at ${p.time}`);
      }),
    ).toEqual([]);
  });

  it('Delhi: a low-PM2.5 afternoon at ozone ≈ 135 µg/m³ is never the best window', () => {
    const hours: HourPoint[] = Array.from({ length: 16 }, (_, i) => {
      const h = 6 + i;
      const afternoon = h >= 12 && h < 16;
      return {
        time: `2026-11-18T${String(h).padStart(2, '0')}:00`,
        pm25: afternoon ? 20 : 60,
        usAqi: afternoon ? 68 : 153,
        o3: afternoon ? 135 : 40,
      };
    });
    const best = findWindow(hours, 2, 'best');
    expect(best && best.start >= '2026-11-18T12:00' && best.start < '2026-11-18T16:00').toBe(false);
    expect(
      findWindow(
        hours.map((p) => ({ time: p.time, pm25: p.pm25, usAqi: p.usAqi })),
        2,
        'best',
      )?.start,
    ).toBe('2026-11-18T12:00');
  });
});
