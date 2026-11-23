// @ts-check
// Full click-through of every control on a running build (ideally the Docker image), with REAL services.
// Usage:  docker compose up --build -d
//         BASE_URL=http://127.0.0.1:8080 npm run check:clickthrough
// Set EXPECT_AI=true when GEMINI_API_KEY is configured: it then also checks the real Gemini answers.
// Prints a step-by-step report and saves screenshots of every step to ./screenshots/clickthrough.
import { chromium } from '@playwright/test';

import { createHarness, EXPECT_AI } from './harness.mjs';
import { aiSteps } from './steps-ai.mjs';
import { coreSteps } from './steps-core.mjs';
import { finalSteps } from './steps-final.mjs';

const harness = createHarness();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  geolocation: { latitude: 28.6139, longitude: 77.209 },
  permissions: ['geolocation'],
});
const page = await context.newPage();
/** @type {string[]} */
const consoleErrors = [];
// Without a key the API answers 503 on purpose; the browser logs that as a failed resource, which is expected.
const expected = (/** @type {string} */ text) => !EXPECT_AI && /status of 503/.test(text);
page.on('console', (m) => m.type() === 'error' && !expected(m.text()) && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));

await coreSteps(page, harness);
if (EXPECT_AI) await aiSteps(page, harness);
await finalSteps(page, harness);

await browser.close();
harness.report(consoleErrors);
