// Main run: one browser page, every step in order, then the report.
import { chromium } from '@playwright/test';
import { EXPECT_AI, report } from './harness.mjs';
import { aiSteps } from './steps-ai.mjs';
import { coreSteps, finalSteps } from './steps-core.mjs';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  geolocation: { latitude: 28.6139, longitude: 77.209 },
  permissions: ['geolocation'],
});
const page = await context.newPage();
const consoleErrors = [];
// Without a key the API answers 503 on purpose; the browser logs that as a failed resource, which is expected.
const expected = (text) => !EXPECT_AI && /status of 503/.test(text);
page.on('console', (m) => m.type() === 'error' && !expected(m.text()) && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));

await coreSteps(page);
if (EXPECT_AI) await aiSteps(page);
await finalSteps(page);

await browser.close();
report(consoleErrors);
