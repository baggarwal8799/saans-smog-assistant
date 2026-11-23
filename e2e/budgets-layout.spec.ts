import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { NARROW_WIDTH_PX } from './limits.js';
import { expandRows, mockApis, openHousehold, pickDelhi } from './mocks.js';

// Generic layout guards: overflow, contrast and squeezed titles, checked across many page states.

async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, button, li'))
      .filter((e) => e.offsetParent !== null && !e.closest('.visually-hidden') && e.scrollWidth > e.clientWidth + 1)
      .map((e) => {
        const size = `${e.scrollWidth} > ${e.clientWidth}`;
        return `${e.tagName.toLowerCase()}.${e.className} (${size}): ${e.textContent.slice(0, 60)}`;
      }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockApis(page);
});

test(`no text overflows its box at ${NARROW_WIDTH_PX} px, English and Hindi`, async ({ page }) => {
  await page.setViewportSize({ width: NARROW_WIDTH_PX, height: 720 });
  await page.goto('/');
  expect(await overflowing(page), 'empty page').toEqual([]);
  await pickDelhi(page);
  await openHousehold(page);
  await expandRows(page, 3);
  expect(await overflowing(page), 'English').toEqual([]);
  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await page.evaluate(() => document.fonts.ready);
  expect(await overflowing(page), 'Hindi').toEqual([]);
});

test(`no WCAG 2.2 AA violations at ${NARROW_WIDTH_PX} px in Hindi, dark mode, rows expanded`, async ({ page }) => {
  await page.setViewportSize({ width: NARROW_WIDTH_PX, height: 720 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await pickDelhi(page);
  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expandRows(page, 3);
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});

/** A row title must keep at least this share of its row: badges beside it wrap under it instead of squeezing it. */
const MIN_TITLE_SHARE = 0.4;
const squeezedTitles = (page: Page) =>
  page.locator('.row-item summary').evaluateAll(
    (rows, share) =>
      rows.flatMap((row) => {
        const title = row.querySelector('.row-title');
        const w = title?.getBoundingClientRect().width ?? 0;
        return w < row.getBoundingClientRect().width * share
          ? [`${title?.textContent ?? ''}: ${Math.round(w)} px`]
          : [];
      }),
    MIN_TITLE_SHARE,
  );

test('every "More ways" title keeps a readable width at 1280 px and phone width, English and Hindi', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await pickDelhi(page);
  await expect(page.locator('.row-title').first()).toBeVisible();
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await squeezedTitles(page), `English ${width}`).toEqual([]);
  }
  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  expect(await squeezedTitles(page), 'Hindi').toEqual([]);
});
