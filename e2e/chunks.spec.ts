import { expect, test, type Page } from '@playwright/test';
import { mockApis, openHousehold, pickDelhi } from './mocks';

// The first load carries only what first paint needs. Each lazy part must arrive when, and only when, the person
// does the thing that needs it, so the work stays proportional to what they do.

/** Comfortably past AUTO_SUMMARY_DELAY_MS (1.2 s, src/components/Assistant.tsx), when a summary would have gone out. */
const PAST_AUTO_SUMMARY_MS = 2500;

test.beforeEach(async ({ page }) => {
  await mockApis(page);
});

/** Names of the lazy chunks fetched so far (Vite names each after its entry module). */
/** The order of a bare .sort() (UTF-16 code units), as an explicit comparator. */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function lazyChunks(page: Page): () => string[] {
  const seen = new Set<string>();
  page.on('request', (r) => {
    const m = /\/assets\/(i18n-hi|Assistant|ProfileEditor)-[\w-]+\.js$/.exec(r.url());
    if (m?.[1]) seen.add(m[1]);
  });
  return () => [...seen].sort(byCodeUnit);
}

test('each lazy chunk loads only with the action that needs it', async ({ page }) => {
  const chunks = lazyChunks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(chunks(), 'first load').toEqual([]);

  // A place brings the plan and Ask Saans (fetched alongside the air data), not the editor or Hindi.
  await pickDelhi(page);
  await expect(page.getByRole('heading', { name: 'Ask Saans' })).toBeVisible();
  expect(chunks()).toEqual(['Assistant']);

  await openHousehold(page);
  expect(chunks()).toEqual(['Assistant', 'ProfileEditor']);

  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  expect(chunks()).toEqual(['Assistant', 'ProfileEditor', 'i18n-hi']);
});

test('someone who saved Hindi sees Hindi from the first frame, never a flash of English', async ({ page }) => {
  // Records the first text React puts in the page, before any later render can replace it.
  await page.addInitScript(() => {
    localStorage.setItem('saans.lang', 'hi');
    const w = window as unknown as { firstText?: string };
    new MutationObserver((_, observer) => {
      const text = document.getElementById('root')?.textContent ?? '';
      if (!text) return;
      w.firstText = text;
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  const first = await page.evaluate(() => (window as unknown as { firstText?: string }).firstText ?? '');
  expect(first).toContain('आपके यहाँ हवा कैसी है?');
  expect(first).not.toContain('How’s the air where you are?');
});

test('with Save-Data on, no summary is requested on its own; the Explain button still asks', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }));
  const asked: string[] = [];
  await page.route('**/api/assistant', (route) => {
    asked.push(route.request().postDataJSON()?.mode as string);
    return route.fulfill({ json: { text: 'Here is your plan, explained.' } });
  });
  await page.goto('/');
  await pickDelhi(page);
  const explain = page.getByRole('button', { name: 'Explain my plan' });
  await expect(explain).toBeVisible();
  await page.waitForTimeout(PAST_AUTO_SUMMARY_MS);
  expect(asked).toEqual([]);
  await explain.click();
  await expect(page.getByText('Here is your plan, explained.')).toBeVisible();
  expect(asked).toEqual(['summary']);
});
