import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations, mockApis, openHousehold, pickDelhi } from './mocks';

const cspViolations = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  cspViolations.set(page, errors);
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Refused to/i.test(msg.text())) errors.push(msg.text());
  });
  await mockApis(page);
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect(cspViolations.get(page) ?? []).toEqual([]);
});

test('serves the production security headers', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['content-security-policy']).toContain("script-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['permissions-policy']).toContain('geolocation=(self)');
  expect(h['cross-origin-opener-policy']).toBe('same-origin');
  expect(h['cross-origin-resource-policy']).toBe('same-origin');
  expect(h['x-permitted-cross-domain-policies']).toBe('none');
});

test('end-to-end: city → live air → plan with impacts → assistant', async ({ page }) => {
  await pickDelhi(page);
  await expect(page.getByText('Very unhealthy', { exact: true })).toBeVisible();
  await expect(page.getByText(/like smoking .* cigarettes/)).toBeVisible();
  // The winter smog-trap alert from the (mocked) weather forecast, also step 1-3 of the plan.
  await expect(page.getByText('Winter smog trap ahead.')).toBeVisible();
  await expect(page.getByText(/the air mixes in a layer under 50 m deep/)).toBeVisible();

  const plan = page.getByRole('region', { name: /Your plan for today/ });
  await expect(plan.getByRole('heading', { name: /Low-emission routine/ })).toBeVisible();
  await expect(plan.getByRole('heading', { name: /Indoor air fixes/ })).toBeVisible();
  await expect(plan.getByRole('heading', { name: /Sustainable swaps/ })).toBeVisible();
  await expect(plan.getByText(/kg CO₂ per month/)).toBeVisible();

  const working = plan.locator('details').first();
  await expect(working.locator('p')).toBeHidden();
  await working.locator('summary').click();
  await expect(working.locator('p')).toBeVisible();
  await expect(working.locator('p')).toContainText('%');

  // The e2e server runs without a key: the assistant must say how to add one, not invent an answer. The summary is
  // requested on its own when the plan appears, and the button asks again.
  await expect(page.getByRole('alert')).toContainText(/needs a Gemini API key/);
  await page.getByRole('button', { name: /Explain my plan/ }).click();
  await expect(page.getByRole('alert')).toContainText(/needs a Gemini API key/);
});

test('the plan reacts to the household profile', async ({ page }) => {
  await pickDelhi(page);
  await expect(page.getByLabel('Winter heating')).toBeHidden();
  await openHousehold(page);
  await page.getByLabel('Winter heating').selectOption('coal');
  const warning = page.getByRole('heading', { name: /Never burn coal/ });
  await expect(warning).toBeVisible();
  // The carbon-monoxide warning leads its own "Safety first" group.
  const steps = page.getByRole('region', { name: 'Safety first' }).getByRole('listitem');
  await expect(steps.first()).toContainText(/Never burn coal/);
  await page.reload();
  await expect(warning).toBeVisible();
});

test('"Use my location" shows the real place name, not "My location"', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 26.8468, longitude: 80.9462 });
  await page.route('https://api.bigdatacloud.net/**', (route) =>
    route.fulfill({ json: { city: 'Lucknow', principalSubdivision: 'Uttar Pradesh', countryName: 'India' } }),
  );
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByRole('heading', { name: 'Air right now in Lucknow, Uttar Pradesh, India' })).toBeVisible();
  await expect(page.getByText('My location')).toHaveCount(0);
});

test('changing place reopens the search and loads the new city', async ({ page }) => {
  await pickDelhi(page);
  await expect(page.getByRole('searchbox')).toBeHidden();
  await page.getByRole('button', { name: 'Change place' }).click();
  await pickDelhi(page);
  await expect(page.getByRole('button', { name: 'Change place' })).toBeVisible();
});

test('no WCAG 2.2 AA violations, light and dark, English and Hindi', async ({ page }) => {
  await expectNoA11yViolations(page);
  await pickDelhi(page);
  await page.getByText('How we worked this out').first().click();
  await page.locator('.row-item summary').first().click();
  await openHousehold(page);
  await expectNoA11yViolations(page);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expectNoA11yViolations(page);
});

test('keyboard users can skip to content and operate the search', async ({ page }) => {
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /Skip to main content/ });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  await page.getByRole('searchbox').focus();
  await page.keyboard.type('Delhi');
  await page.keyboard.press('Enter');
  const result = page.getByRole('button', { name: 'New Delhi, Delhi, India' });
  await result.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Air right now/ })).toBeVisible();
});

test('no horizontal scrolling at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await pickDelhi(page);
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

test('API rejects malformed, oversized, cross-site and origin-less requests', async ({ request, baseURL }) => {
  // What a browser on the page sends; a POST with no Origin and no Sec-Fetch-Site (a script) is refused.
  const origin = { origin: new URL(baseURL ?? '').origin };
  expect((await request.get('/api/assistant')).status()).toBe(405);
  expect(
    (await request.post('/api/assistant', { data: {}, headers: { 'sec-fetch-site': 'cross-site' } })).status(),
  ).toBe(403);
  expect((await request.post('/api/assistant', { data: { lang: 'xx' } })).status()).toBe(403);
  expect((await request.post('/api/assistant', { data: { lang: 'xx' }, headers: origin })).status()).toBe(400);
  const big = { data: 'x'.repeat(16_000), headers: { 'content-type': 'application/json', ...origin } };
  expect((await request.post('/api/assistant', big)).status()).toBe(413);
});
