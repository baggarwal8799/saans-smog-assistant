import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { INDIA, airReport } from '../test/scenarios';
import { axeViolations } from '../test/network';
import type { Lang, TimeWindow } from '../lib/types';
import { AirRibbon } from './AirRibbon';

const hours = airReport({ aqi: 120, weather: 'none', startHour: 6, place: INDIA }).hourly.slice(1);
const show = (lang: Lang, best: TimeWindow | null) => render(<AirRibbon lang={lang} hours={hours} best={best} worst={null} stayIn={false} />);

describe('AirRibbon', () => {
  it('gives every hour as text in a keyboard-reachable "Hourly numbers" table, axe-clean', async () => {
    const { container } = show('en', { start: hours[8]?.time ?? '', end: hours[10]?.time ?? '', avgPm25: 20 });
    const details = container.querySelector('details');
    expect(details?.closest('[aria-hidden="true"]')).toBeNull();
    expect(within(details as HTMLElement).getByText('Hourly numbers').tagName).toBe('SUMMARY');
    // Closed, the table is not built at all; opening it builds every row.
    expect(details?.querySelector('table')).toBeNull();
    (details as HTMLDetailsElement).open = true;
    fireEvent(details as HTMLElement, new Event('toggle'));
    const rows = within(details as HTMLElement).getAllByRole('row');
    expect(rows).toHaveLength(25);
    expect(rows[1]?.textContent).toContain(String(Math.round(hours[0]?.pm25 ?? 0)));
    expect(screen.getByText('Best time out')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('in Hindi, and with neutral or no "best" key when the window is not clean', async () => {
    const { container } = show('hi', { start: hours[8]?.time ?? '', end: hours[10]?.time ?? '', avgPm25: 67 });
    expect(screen.getByText('हर घंटे के आँकड़े')).toBeInTheDocument();
    expect(screen.getByText('सबसे कम प्रदूषित')).toBeInTheDocument();
    expect(screen.queryByText('बाहर जाने का सबसे अच्छा समय')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows no "best" key when there is no window to mark', () => {
    const { container } = show('en', null);
    expect(container.querySelector('.key.best')).toBeNull();
  });
});
