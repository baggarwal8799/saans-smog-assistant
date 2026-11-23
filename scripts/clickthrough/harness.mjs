// @ts-check
import { mkdirSync } from 'node:fs';

export const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
export const EXPECT_AI = process.env.EXPECT_AI === 'true';
const OUT = 'screenshots/clickthrough';
const ANSWER_TIMEOUT_MS = 40_000;

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */
/** @typedef {ReturnType<typeof createHarness>} Harness */

export function createHarness() {
  mkdirSync(OUT, { recursive: true });
  /** @type {{ step: string; ok: boolean; note: string }[]} */
  const results = [];
  let n = 0;
  /**
   * @param {Page} page
   * @param {string} name
   * @param {() => Promise<string | undefined | void>} fn returns an optional note for the report
   */
  async function step(page, name, fn) {
    n += 1;
    const id = String(n).padStart(2, '0');
    try {
      const note = await fn();
      results.push({ step: `${id} ${name}`, ok: true, note: note ?? '' });
    } catch (err) {
      results.push({
        step: `${id} ${name}`,
        ok: false,
        note: err instanceof Error ? (err.message.split('\n')[0] ?? '') : String(err),
      });
    }
    await page
      .screenshot({ path: `${OUT}/${id}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`, fullPage: true })
      .catch(() => undefined);
  }
  /**
   * Prints the report and exits non-zero on any failed step or console error.
   * @param {string[]} consoleErrors
   */
  function report(consoleErrors) {
    const failed = results.filter((r) => !r.ok);
    for (const r of results) {
      const note = r.note ? `  ·  ${r.note}` : '';
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.step}${note}`);
    }
    console.log(consoleErrors.length ? `\nConsole errors:\n${consoleErrors.join('\n')}` : '\nNo console errors.');
    console.log(`\n${results.length - failed.length}/${results.length} steps passed. Screenshots: ./${OUT}`);
    if (failed.length || consoleErrors.length) process.exit(1);
  }
  return { step, report };
}

/**
 * @param {unknown} cond
 * @param {string} msg
 */
export const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/**
 * Waits for `answer` or the answer region's error alert, whichever shows first: without a key, the alert is expected.
 * @param {Page} page
 * @param {Locator} answer
 * @returns {Promise<{ got: boolean; alert: Locator }>} got is true when the answer arrived
 */
export async function waitForAnswer(page, answer) {
  const alert = page.locator('.answer-region [role="alert"]');
  await answer.or(alert).first().waitFor({ timeout: ANSWER_TIMEOUT_MS });
  return { got: (await answer.count()) > 0, alert };
}
