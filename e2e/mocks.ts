import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Shared Playwright fixtures: every external API is mocked so the e2e suites never touch the network. */
const PM = [180, 185, 190, 195, 200, 205, 210, 215, 200, 170, 140, 120, 100, 90, 80, 85, 110, 150, 190, 220, 240, 245, 230, 210];

function airPayload() {
  const time: string[] = [];
  const pm2_5: number[] = [];
  const us_aqi: number[] = [];
  for (let i = 0; i < 72; i++) {
    const day = 17 + Math.floor(i / 24);
    const h = i % 24;
    time.push(`2026-11-${day}T${String(h).padStart(2, '0')}:00`);
    pm2_5.push(PM[h] ?? 100);
    us_aqi.push(Math.round((PM[h] ?? 100) * 1.3));
  }
  return {
    timezone: 'Asia/Kolkata',
    current: { time: '2026-11-17T08:00', us_aqi: 262, pm2_5: 212, pm10: 318, nitrogen_dioxide: 58, ozone: 21 },
    hourly: { time, pm2_5, us_aqi },
  };
}

/** Still, shallow night air (a winter smog trap) from 18:00 to 08:00; breezy and well mixed by day. */
function weatherPayload() {
  const time = airPayload().hourly.time;
  const night = (t: string) => Number(t.slice(11, 13)) >= 18 || Number(t.slice(11, 13)) < 8;
  return {
    hourly: {
      time,
      wind_speed_10m: time.map((t) => (night(t) ? 3 : 12)),
      boundary_layer_height: time.map((t) => (night(t) ? 40 : 900)),
    },
  };
}

export async function mockApis(page: Page) {
  await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({ json: { results: [{ name: 'New Delhi', latitude: 28.61, longitude: 77.21, admin1: 'Delhi', country: 'India' }] } }),
  );
  await page.route('https://air-quality-api.open-meteo.com/**', (route) => route.fulfill({ json: airPayload() }));
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: weatherPayload() }));
}

export async function pickDelhi(page: Page) {
  await page.getByRole('searchbox', { name: /Search your city/ }).fill('Delhi');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'New Delhi, Delhi, India' }).click();
  await expect(page.getByRole('heading', { name: /Air right now/ })).toBeVisible();
}

/** Opens "Edit household" and waits for the editor, which is its own chunk and arrives a moment after the click. */
export async function openHousehold(page: Page) {
  await page.getByRole('button', { name: 'Edit household' }).click();
  await expect(page.getByLabel('People at home')).toBeVisible();
}

export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}
