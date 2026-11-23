// @ts-check
import { BASE, EXPECT_AI, must, waitForAnswer } from './harness.mjs';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {[name: string, run: (page: Page) => Promise<string | void>][]} Steps */

/** @param {Page} page */
async function openHome(page) {
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'How’s the air where you are?' }).waitFor();
}

/**
 * @param {Page} page
 * @param {string} query
 */
async function search(page, query) {
  await page.getByRole('searchbox').fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

/** @param {Page} page */
async function searchWithNoResults(page) {
  await search(page, 'zzqqxx');
  await page.getByText('No places found').waitFor({ timeout: 15_000 });
}

/** @param {Page} page */
async function searchAndPick(page) {
  await search(page, 'Lucknow');
  const first = page.locator('.results button').first();
  await first.waitFor({ timeout: 15_000 });
  const label = await first.textContent();
  await first.click();
  await page.locator('#air-heading').waitFor({ timeout: 20_000 });
  return label ?? '';
}

/** @param {Page} page */
async function airReadingShown(page) {
  const aqi = await page.locator('.aqi-value').textContent();
  const level = await page.locator('.aqi-label').textContent();
  must(Number(aqi) > 0, `bad AQI "${aqi}"`);
  must((await page.locator('.ribbon-bars .bar').count()) >= 12, 'ribbon has too few hours');
  must((await page.locator('.windows .window').count()) >= 1, 'no time windows');
  return `AQI ${aqi} ${level}`;
}

/** @param {Page} page */
async function planStepsAndRows(page) {
  const steps = await page.locator('.step h4').count();
  const rows = page.locator('.row-item summary');
  const rowCount = await rows.count();
  must(steps >= 1 && steps <= 3, `steps = ${steps}`);
  for (let i = 0; i < rowCount; i++) await rows.nth(i).click();
  must((await page.locator('.row-item details[open]').count()) === rowCount, 'not every row opened');
  const whys = page.locator('.step .why summary');
  for (let i = 0; i < (await whys.count()); i++) await whys.nth(i).click();
  return `${steps} steps, ${rowCount} rows expanded`;
}

const HOUSEHOLD_CHECKS = [
  'Elderly (65+) at home',
  'Someone with asthma, COPD or heart disease',
  'We have an air purifier',
  'Waste or leaves are burned at or near home',
];

/** @param {Page} page */
async function editHousehold(page) {
  await page.getByRole('button', { name: 'Edit household' }).click();
  const before = await page.locator('.step h4').allTextContents();
  await page.getByLabel('People at home').fill('6');
  await page.getByLabel('One-way commute distance (km)').fill('3');
  await page.getByLabel('Outdoor exercise or walk per day (minutes)').fill('45');
  await page.getByLabel('Main daily commute').selectOption('motorbike');
  await page.getByLabel('Cooking fuel').selectOption('biomass');
  await page.getByLabel('Winter heating').selectOption('coal');
  for (const label of HOUSEHOLD_CHECKS) await page.getByLabel(label).check();
  const after = await page.locator('.step h4').allTextContents();
  must(after[0]?.includes('Never burn coal'), `step 1 is "${after[0]}"`);
  const line = await page.locator('.household-line').textContent();
  must(/6 people/.test(line ?? ''), `summary "${line}"`);
  await page.getByRole('button', { name: 'Done' }).click();
  return `steps before: ${before.length}, after: ${after.join(' | ')}`;
}

/** @param {Page} page */
async function commuteHiddenForWfh(page) {
  await page.getByRole('button', { name: 'Edit household' }).click();
  await page.getByLabel('Main daily commute').selectOption('wfh');
  must((await page.getByLabel('One-way commute distance (km)').count()) === 0, 'distance still shown');
  await page.getByLabel('Main daily commute').selectOption('car');
  await page.getByRole('button', { name: 'Done' }).click();
}

/** @param {Page} page */
async function explainPlan(page) {
  // Only the first plan at a place is explained on its own; after the household edit above, it waits for a click.
  const explain = page.getByRole('button', { name: 'Explain my plan' });
  await explain.and(page.locator(':enabled')).waitFor({ timeout: 40_000 });
  await explain.click();
  const answer = page.locator('.answer-text');
  const { got, alert } = await waitForAnswer(page, answer);
  if (got) {
    const text = (await answer.textContent()) ?? '';
    must(text.length > 80, 'answer too short');
    return text.slice(0, 160).replace(/\s+/g, ' ');
  }
  const msg = (await alert.textContent()) ?? '';
  must(!EXPECT_AI, `expected an AI answer, got: ${msg}`);
  return `no key: ${msg}`;
}

/** @param {Page} page */
async function askQuestion(page) {
  await page.getByLabel('Your question').fill('Is it safe for my kids to play in the park this evening?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const answer = page.locator('figure.answer');
  const { got, alert } = await waitForAnswer(page, answer);
  if (got) {
    const cap = await answer.locator('figcaption').textContent();
    must(cap === 'Answer', `caption "${cap}"`);
    return ((await answer.locator('.answer-text').textContent()) ?? '').slice(0, 160).replace(/\s+/g, ' ');
  }
  must(!EXPECT_AI, `expected an AI answer, got: ${await alert.textContent()}`);
  return 'no key: message shown';
}

/** @type {Steps} */
const CORE_STEPS = [
  ['open home', openHome],
  ['search with no results', searchWithNoResults],
  ['search Lucknow and pick it', searchAndPick],
  ['air reading shown', airReadingShown],
  ['plan steps and rows', planStepsAndRows],
  ['edit every household field', editHousehold],
  ['commute hidden for work from home', commuteHiddenForWfh],
  ['explain my plan', explainPlan],
  ['ask a question', askQuestion],
];

/**
 * @param {Page} page
 * @param {import('./harness.mjs').Harness} harness
 * @param {Steps} steps
 */
export async function runSteps(page, { step }, steps) {
  for (const [name, run] of steps) await step(page, name, () => run(page));
}

/**
 * The AI panel steps pass without a key too.
 * @param {Page} page
 * @param {import('./harness.mjs').Harness} harness
 */
export const coreSteps = (page, harness) => runSteps(page, harness, CORE_STEPS);
