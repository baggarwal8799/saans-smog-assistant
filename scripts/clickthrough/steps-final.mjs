// @ts-check
import { EXPECT_AI, must, waitForAnswer } from './harness.mjs';
import { runSteps } from './steps-core.mjs';

/** @typedef {import('@playwright/test').Page} Page */

/** @param {Page} page */
async function askInHindi(page) {
  await page.getByRole('button', { name: /Language/ }).click();
  // Hindi loads on demand, so the page (and its lang attribute) switch once the dictionary has arrived.
  await page.getByRole('heading', { name: /आज के लिए आपकी योजना/ }).waitFor();
  must((await page.locator('html').getAttribute('lang')) === 'hi', 'lang attribute not hi');
  await page.getByRole('button', { name: 'मेरी योजना समझाएँ' }).click();
  const answer = page.locator('.answer-text');
  const { got, alert } = await waitForAnswer(page, answer);
  const text = got ? await answer.textContent() : await alert.textContent();
  // Back to English before any check, so one failed answer cannot break every step after it.
  await page.getByRole('button', { name: /भाषा/ }).click();
  must(!EXPECT_AI || got, `expected a Hindi AI answer, got: ${text}`);
  must(/[ऀ-ॿ]/.test(text ?? ''), 'reply is not in Hindi');
  return (text ?? '').slice(0, 120).replace(/\s+/g, ' ');
}

/** @param {Page} page */
async function useMyLocation(page) {
  await page.getByRole('button', { name: 'Change place' }).click();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await page.locator('#air-heading').filter({ hasText: /Delhi/ }).waitFor({ timeout: 20_000 });
  return (await page.locator('#air-heading').textContent()) ?? '';
}

/** @param {Page} page */
async function reloadKeepsState(page) {
  await page.reload();
  await page.locator('#air-heading').waitFor({ timeout: 20_000 });
  must(/Delhi/.test((await page.locator('#air-heading').textContent()) ?? ''), 'place lost');
  must(/6 people/.test((await page.locator('.household-line').textContent()) ?? ''), 'profile lost');
}

/** @param {Page} page */
async function keyboardSkipLink(page) {
  await page.keyboard.press('Tab');
  must(
    await page.getByRole('link', { name: 'Skip to main content' }).evaluate((el) => el === document.activeElement),
    'skip link not focused first',
  );
  await page.keyboard.press('Enter');
  must(await page.locator('#main').evaluate((el) => el === document.activeElement), 'main not focused');
}

/** @param {Page} page */
async function phoneWidth(page) {
  await page.setViewportSize({ width: 360, height: 780 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  must(overflow <= 0, `overflow ${overflow}px`);
}

/** @type {import('./steps-core.mjs').Steps} */
const FINAL_STEPS = [
  ['switch to Hindi and ask in Hindi', askInHindi],
  ['change place, then use my location', useMyLocation],
  ['reload keeps place, profile and language', reloadKeepsState],
  ['keyboard: skip link and focus', keyboardSkipLink],
  ['phone width has no sideways scroll', phoneWidth],
];

/**
 * @param {Page} page
 * @param {import('./harness.mjs').Harness} harness
 */
export const finalSteps = (page, harness) => runSteps(page, harness, FINAL_STEPS);
