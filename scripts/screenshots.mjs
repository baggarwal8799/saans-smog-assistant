// @ts-check
// Visual check: drives the running app through its main states and saves screenshots.
// Usage: npm run build && npm run preview   (in another terminal)
//        BASE_URL=http://127.0.0.1:4173 npm run shots     → ./screenshots/*.png
// Uses REAL network data (Open-Meteo), so results change with the weather.
import { mkdirSync } from 'node:fs';

import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = process.env.OUT_DIR ?? 'screenshots';
const CITY = process.env.CITY ?? 'Delhi';
mkdirSync(OUT, { recursive: true });

/** @typedef {import('@playwright/test').Page} Page */

/**
 * @param {Page} page
 * @param {string} name
 * @param {boolean} [fullPage]
 */
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
/** @type {string[]} */
const errors = [];

/**
 * Resolves once the page has stopped scrolling: on load the app smooth-scrolls to the air reading, and that scroll has
 * to finish before the page is scrolled back to the top for the screenshot.
 * @param {Page} page
 */
const scrollSettled = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = Number.NaN;
        let still = 0;
        const tick = () => {
          still = window.scrollY === last ? still + 1 : 0;
          last = window.scrollY;
          if (still >= 5) resolve(undefined);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );

/**
 * @param {Page} page
 * @param {string} searchLabel
 */
async function pickCity(page, searchLabel) {
  await page.getByRole('searchbox').fill(CITY);
  await page.getByRole('button', { name: searchLabel, exact: true }).click();
  await page.locator('.results button').first().click();
  await page.locator('#air-heading').waitFor({ timeout: 20_000 });
  await scrollSettled(page);
  await page.mouse.wheel(0, -100_000);
}

const browser = await chromium.launch();
/** @type {{ name: string; options: import('@playwright/test').BrowserContextOptions; search: string }[]} */
const runs = [
  { name: 'desktop-light', options: { viewport: { width: 1366, height: 900 } }, search: 'Search' },
  { name: 'desktop-dark', options: { viewport: { width: 1366, height: 900 }, colorScheme: 'dark' }, search: 'Search' },
  {
    name: 'mobile-light',
    options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    search: 'Search',
  },
  {
    name: 'mobile-hindi',
    options: { viewport: { width: 390, height: 844 }, isMobile: true, locale: 'hi-IN' },
    search: 'खोजें',
  },
];

for (const run of runs) {
  const context = await browser.newContext(run.options);
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${run.name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${run.name}: ${e.message}`));
  await page.goto(BASE);
  await shot(page, `${run.name}-1-start`);
  await pickCity(page, run.search);
  await shot(page, `${run.name}-2-full`, true);
  await page.locator('.household-head button').click();
  await page.locator('.step .why summary').first().click();
  await shot(page, `${run.name}-3-expanded`, true);
  await context.close();
}

await browser.close();
console.log(`Saved screenshots to ./${OUT}`);
if (errors.length) {
  console.error(`Console errors:\n${errors.join('\n')}`);
  process.exit(1);
}
