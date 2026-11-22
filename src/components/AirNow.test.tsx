import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../lib/recommend';
import { profile } from '../test/fixtures';
import { INDIA, airReport } from '../test/scenarios';
import type { Lang } from '../lib/types';
import type { Weather } from '../test/scenarios';
import { AirNow } from './AirNow';

function show(aqi: number, weather: Weather, startHour: number, lang: Lang = 'en', edit = (r: ReturnType<typeof airReport>) => r) {
  const report = edit(airReport({ aqi, weather, startHour, place: INDIA }));
  render(<AirNow lang={lang} report={report} plan={buildPlan(report, profile(), lang)} />);
}

describe('AirNow', () => {
  it('on an ozone day names ozone, shows ozone in the windows and skips the particle note', () => {
    show(155, 'ozone', 6);
    expect(screen.getByText('Ozone')).toBeInTheDocument();
    expect(screen.getAllByText(/ozone ≈ \d+/)).not.toHaveLength(0);
    expect(screen.queryByText(/AQI for particles/)).toBeNull();
    expect(document.querySelector('.trap')).toBeNull();
  });

  it('shows the smog trap and says "tomorrow" for next-day windows', () => {
    show(210, 'nightTrap', 21);
    // Starts tonight and lifts tomorrow morning: the start gets no "tomorrow", the end does.
    expect(document.querySelector('.trap')?.textContent).toMatch(/[^w] 22:00–08:00 tomorrow:/);
    expect(document.querySelector('.window.good')?.textContent).toMatch(/tomorrow \d\d:00–\d\d:00/);
    expect(screen.getByText(/AQI for particles/)).toBeInTheDocument();
  });

  it('falls back to "no window" text and dashes for missing readings, in Hindi too', () => {
    show(120, 'none', 22, 'hi', (r) => ({ ...r, current: { ...r.current, pm10: Number.NaN, dominant: null }, hourly: r.hourly.slice(0, 3) }));
    expect(screen.getByText(/कोई साफ़ समय नहीं/)).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(document.querySelector('.window.bad')).toBeNull();
    expect(document.querySelector('.dominant')).toBeNull();
  });

  it('calls a window "cleanest" only when its own PM2.5 is at most Moderate', () => {
    show(120, 'none', 6, 'en', (r) => ({ ...r, hourly: r.hourly.map((h) => ({ ...h, pm25: h.pm25 + 60 })) }));
    expect(document.querySelector('.window.good')?.textContent).toMatch(/^Least polluted 2 hours, if you must go out:/);
    expect(screen.queryByText(/Cleanest|Best time/)).toBeNull();
    cleanup();
    show(75, 'none', 6);
    expect(document.querySelector('.window.good')?.textContent).toMatch(/^Cleanest 2 hours to go out:/);
  });

  it('writes a mixing height at the forecast floor as a bound, not as a precise figure', () => {
    show(210, 'nightTrap', 21);
    const trap = document.querySelector('.trap')?.textContent ?? '';
    expect(trap).toMatch(/the wind averages ≈ 3 km\/h and, at its lowest, the air mixes in a layer under 50 m deep/);
    expect(trap).not.toMatch(/40 m/);
    cleanup();
    show(210, 'nightTrap', 21, 'hi');
    expect(document.querySelector('.trap')?.textContent).toMatch(/50 मीटर से कम की ऊँचाई तक ही/);
  });

  it('offers no "if you must go out" window where EPA says to avoid all outdoor activity', () => {
    show(320, 'none', 6);
    expect(document.querySelector('.window.good')?.textContent).toMatch(/^Least polluted 2 hours \(US EPA: still avoid outdoor activity today\):/);
    expect(document.body.textContent).not.toMatch(/if you must go out/);
  });

  it('marks a trap that starts tomorrow', () => {
    show(120, 'dayTrap', 18);
    expect(document.querySelector('.trap')?.textContent).toMatch(/tomorrow 10:00–16:00/);
  });

  it('says which average each figure uses: AQI by its pollutant, cigarettes the next 24 h, readings this hour', () => {
    show(210, 'none', 6, 'en', (r) => ({ ...r, current: { ...r.current, dominant: 'pm25' } }));
    expect(screen.getByText('AQI: past 24 h average')).toBeInTheDocument();
    expect(screen.getByText(/^Breathing the next 24 hours’ air \(forecast average PM2\.5\) is like smoking [\d.]+ cigarettes?\.$/)).toBeInTheDocument();
    expect(screen.getByText('This hour’s readings')).toBeInTheDocument();
    expect(document.querySelector('.window.good')?.textContent).toMatch(/\(average: PM2\.5 ≈ \d+/);
    cleanup();
    show(155, 'ozone', 6, 'en', (r) => ({ ...r, current: { ...r.current, dominant: 'o3' } }));
    expect(screen.getByText('AQI: past 8 h ozone average')).toBeInTheDocument();
    cleanup();
    show(155, 'none', 6, 'en', (r) => ({ ...r, current: { ...r.current, dominant: 'no2' } }));
    expect(screen.getByText('AQI: this hour’s NO₂')).toBeInTheDocument();
    cleanup();
    show(210, 'none', 6, 'hi', (r) => ({ ...r, current: { ...r.current, dominant: null } }));
    expect(screen.getByText('AQI: पिछले 24 घंटे का औसत')).toBeInTheDocument();
    expect(screen.getByText(/^अगले 24 घंटे की हवा \(पूर्वानुमान का औसत PM2\.5\)/)).toBeInTheDocument();
    expect(screen.getByText('इस घंटे की रीडिंग')).toBeInTheDocument();
  });
});
