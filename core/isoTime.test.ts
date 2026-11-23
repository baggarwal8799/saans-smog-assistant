import { describe, expect, it } from 'vitest';

import { isoClock, isoDate, isoDateHour, isoHour, isoMinute } from './isoTime.js';

describe('isoTime', () => {
  const local = '2026-11-18T07:30';
  const utc = '2026-11-18T07:30:15.000Z';

  it('takes each named part of a local forecast time', () => {
    expect([isoDate(local), isoDateHour(local), isoMinute(local), isoHour(local), isoClock(local)]).toEqual([
      '2026-11-18',
      '2026-11-18T07',
      '2026-11-18T07:30',
      '07',
      '07:30',
    ]);
  });

  it('cuts a full toISOString() the same way, without moving it to another zone', () => {
    expect([isoDate(utc), isoDateHour(utc), isoMinute(utc), isoHour(utc), isoClock(utc)]).toEqual([
      '2026-11-18',
      '2026-11-18T07',
      '2026-11-18T07:30',
      '07',
      '07:30',
    ]);
  });

  it('matches the fixed slices it names', () => {
    for (const t of [local, utc, '2027-01-01T00:00']) {
      expect(isoDate(t)).toBe(t.slice(0, 10));
      expect(isoDateHour(t)).toBe(t.slice(0, 13));
      expect(isoMinute(t)).toBe(t.slice(0, 16));
      expect(isoHour(t)).toBe(t.slice(11, 13));
      expect(isoClock(t)).toBe(t.slice(11, 16));
    }
  });
});
