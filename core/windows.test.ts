import { describe, expect, it } from 'vitest';

import type { HourPoint } from './types.js';
import { findWindow, spanText } from './windows.js';

const hour = (h: number, o3?: number): HourPoint => ({
  time: `2026-11-17T${String(h).padStart(2, '0')}:00`,
  pm25: 20 + h,
  usAqi: 70,
  ...(o3 === undefined ? {} : { o3 }),
});

describe('findWindow', () => {
  it('finds no window of zero hours', () => {
    expect(findWindow([hour(8), hour(9)], 0)).toBeNull();
  });

  it('averages ozone only when every hour in the window has it', () => {
    expect(findWindow([hour(8, 30), hour(9, 50)], 2)).toMatchObject({ avgPm25: 28.5, avgO3: 40 });
    const partial = findWindow([hour(8, 30), hour(9)], 2);
    expect(partial).toMatchObject({ start: '2026-11-17T08:00', end: '2026-11-17T10:00' });
    expect(partial).not.toHaveProperty('avgO3');
  });
});

describe('spanText', () => {
  it('names "the day after" for a span that starts tomorrow and runs past the next midnight', () => {
    expect(spanText({ start: '2026-11-18T22:00', end: '2026-11-19T06:00' }, '2026-11-17T10:00')).toBe(
      '22:00 tomorrow to 06:00 the day after',
    );
  });
});
