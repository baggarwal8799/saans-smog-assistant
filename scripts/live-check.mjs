// Live smoke test against REAL services (no mocks): search, geolocation naming, plan and assistant.
// Usage: npm run build && npm run preview   (in another terminal)
//        BASE_URL=http://127.0.0.1:4173 npm run check:live
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const failures = [];

const context = await browser.newContext({
  geolocation: { latitude: 26.8468, longitude: 80.9462 },
  permissions: ['geolocation'],
});
const page = await context.newPage();
page.on('console', (m) => m.type() === 'error' && failures.push(`console: ${m.text()}`));
await page.goto(BASE);

await page.getByRole('button', { name: 'Use my location' }).click();
const heading = page.locator('#air-heading');
await heading.waitFor({ timeout: 20_000 });
const title = (await heading.textContent()) ?? '';
if (!/Lucknow/.test(title)) failures.push(`geolocation naming: got "${title}"`);

const steps = await page.locator('.step h4').allTextContents();
// A clean-air day has no urgent steps by design, but every plan still lists its tips.
const tips = await page.locator('.step h4, .row-title').count();
if (tips < 1) failures.push('no recommendations rendered');

await page.getByRole('button', { name: 'Explain my plan' }).click();
const answer = page.locator('.answer-text');
const alert = page.locator('.answer-region [role="alert"]');
await answer.or(alert).first().waitFor({ timeout: 40_000 });
const ai = (await answer.count()) > 0 ? await answer.textContent() : `NO ANSWER: ${await alert.textContent()}`;
if (process.env.EXPECT_AI === 'true' && (await answer.count()) === 0) failures.push(`assistant: ${ai}`);

console.log(JSON.stringify({ title, aqi: await page.locator('.aqi-value').textContent(), steps, assistant: ai }, null, 2));
await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
