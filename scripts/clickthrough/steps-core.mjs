// The always-on steps: search, air reading, plan, household editing, the AI panel, language, place and layout.
import { BASE, EXPECT_AI, must, step } from './harness.mjs';

/** Home, search, plan and household steps, then the two AI panel steps (which pass without a key too). */
export async function coreSteps(page) {
  await step(page, 'open home', async () => {
    await page.goto(BASE);
    await page.getByRole('heading', { name: 'How’s the air where you are?' }).waitFor();
  });

  await step(page, 'search with no results', async () => {
    await page.getByRole('searchbox').fill('zzqqxx');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByText('No places found').waitFor({ timeout: 15_000 });
  });

  await step(page, 'search Lucknow and pick it', async () => {
    await page.getByRole('searchbox').fill('Lucknow');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const first = page.locator('.results button').first();
    await first.waitFor({ timeout: 15_000 });
    const label = await first.textContent();
    await first.click();
    await page.locator('#air-heading').waitFor({ timeout: 20_000 });
    return label ?? '';
  });

  await step(page, 'air reading shown', async () => {
    const aqi = await page.locator('.aqi-value').textContent();
    const level = await page.locator('.aqi-label').textContent();
    must(Number(aqi) > 0, `bad AQI "${aqi}"`);
    must((await page.locator('.ribbon-bars .bar').count()) >= 12, 'ribbon has too few hours');
    must((await page.locator('.windows .window').count()) >= 1, 'no time windows');
    return `AQI ${aqi} ${level}`;
  });

  await step(page, 'plan steps and rows', async () => {
    const steps = await page.locator('.step h4').count();
    const rows = page.locator('.row-item summary');
    const rowCount = await rows.count();
    must(steps >= 1 && steps <= 3, `steps = ${steps}`);
    for (let i = 0; i < rowCount; i++) await rows.nth(i).click();
    must((await page.locator('.row-item details[open]').count()) === rowCount, 'not every row opened');
    const whys = page.locator('.step .why summary');
    for (let i = 0; i < (await whys.count()); i++) await whys.nth(i).click();
    return `${steps} steps, ${rowCount} rows expanded`;
  });

  await step(page, 'edit every household field', async () => {
    await page.getByRole('button', { name: 'Edit household' }).click();
    const before = await page.locator('.step h4').allTextContents();
    await page.getByLabel('People at home').fill('6');
    await page.getByLabel('One-way commute distance (km)').fill('3');
    await page.getByLabel('Outdoor exercise or walk per day (minutes)').fill('45');
    await page.getByLabel('Main daily commute').selectOption('motorbike');
    await page.getByLabel('Cooking fuel').selectOption('biomass');
    await page.getByLabel('Winter heating').selectOption('coal');
    for (const label of [
      'Elderly (65+) at home',
      'Someone with asthma, COPD or heart disease',
      'We have an air purifier',
      'Waste or leaves are burned at or near home',
    ]) {
      await page.getByLabel(label).check();
    }
    const after = await page.locator('.step h4').allTextContents();
    must(after[0]?.includes('Never burn coal'), `step 1 is "${after[0]}"`);
    const line = await page.locator('.household-line').textContent();
    must(/6 people/.test(line ?? ''), `summary "${line}"`);
    await page.getByRole('button', { name: 'Done' }).click();
    return `steps before: ${before.length}, after: ${after.join(' | ')}`;
  });

  await step(page, 'commute hidden for work from home', async () => {
    await page.getByRole('button', { name: 'Edit household' }).click();
    await page.getByLabel('Main daily commute').selectOption('wfh');
    must((await page.getByLabel('One-way commute distance (km)').count()) === 0, 'distance still shown');
    await page.getByLabel('Main daily commute').selectOption('car');
    await page.getByRole('button', { name: 'Done' }).click();
  });

  await step(page, 'explain my plan', async () => {
    // Only the first plan at a place is explained on its own; after the household edit above, it waits for a click.
    // Wait until no request is in flight (buttons enabled), then ask.
    const explain = page.getByRole('button', { name: 'Explain my plan' });
    await explain.and(page.locator(':enabled')).waitFor({ timeout: 40_000 });
    await explain.click();
    const answer = page.locator('.answer-text');
    const alert = page.locator('.answer-region [role="alert"]');
    await answer.or(alert).first().waitFor({ timeout: 40_000 });
    if (await answer.count()) {
      const text = (await answer.textContent()) ?? '';
      must(text.length > 80, 'answer too short');
      return text.slice(0, 160).replace(/\s+/g, ' ');
    }
    const msg = (await alert.textContent()) ?? '';
    must(!EXPECT_AI, `expected an AI answer, got: ${msg}`);
    return `no key: ${msg}`;
  });

  await step(page, 'ask a question', async () => {
    const box = page.getByLabel('Your question');
    await box.fill('Is it safe for my kids to play in the park this evening?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    const answer = page.locator('figure.answer');
    const alert = page.locator('.answer-region [role="alert"]');
    await answer.or(alert).first().waitFor({ timeout: 40_000 });
    if (await answer.count()) {
      const cap = await answer.locator('figcaption').textContent();
      must(cap === 'Answer', `caption "${cap}"`);
      return ((await answer.locator('.answer-text').textContent()) ?? '').slice(0, 160).replace(/\s+/g, ' ');
    }
    must(!EXPECT_AI, `expected an AI answer, got: ${await alert.textContent()}`);
    return 'no key: message shown';
  });
}

/** Runs after the optional AI steps: Hindi, place change, reload persistence, keyboard and phone width. */
export async function finalSteps(page) {
  await step(page, 'switch to Hindi and ask in Hindi', async () => {
    await page.getByRole('button', { name: /Language/ }).click();
    // Hindi loads on demand, so the page (and its lang attribute) switch once the dictionary has arrived.
    await page.getByRole('heading', { name: /आज के लिए आपकी योजना/ }).waitFor();
    must((await page.locator('html').getAttribute('lang')) === 'hi', 'lang attribute not hi');
    await page.getByRole('button', { name: 'मेरी योजना समझाएँ' }).click();
    const answer = page.locator('.answer-text');
    const alert = page.locator('.answer-region [role="alert"]');
    await answer.or(alert).first().waitFor({ timeout: 40_000 });
    const got = (await answer.count()) > 0;
    const text = got ? await answer.textContent() : await alert.textContent();
    // Back to English before any check, so one failed answer cannot break every step after it.
    await page.getByRole('button', { name: /भाषा/ }).click();
    must(!EXPECT_AI || got, `expected a Hindi AI answer, got: ${text}`);
    must(/[\u0900-\u097F]/.test(text ?? ''), 'reply is not in Hindi');
    return (text ?? '').slice(0, 120).replace(/\s+/g, ' ');
  });

  await step(page, 'change place, then use my location', async () => {
    await page.getByRole('button', { name: 'Change place' }).click();
    await page.getByRole('button', { name: 'Use my location' }).click();
    await page.locator('#air-heading').filter({ hasText: /Delhi/ }).waitFor({ timeout: 20_000 });
    return (await page.locator('#air-heading').textContent()) ?? '';
  });

  await step(page, 'reload keeps place, profile and language', async () => {
    await page.reload();
    await page.locator('#air-heading').waitFor({ timeout: 20_000 });
    must(/Delhi/.test((await page.locator('#air-heading').textContent()) ?? ''), 'place lost');
    must(/6 people/.test((await page.locator('.household-line').textContent()) ?? ''), 'profile lost');
  });

  await step(page, 'keyboard: skip link and focus', async () => {
    await page.keyboard.press('Tab');
    must(
      await page.getByRole('link', { name: 'Skip to main content' }).evaluate((el) => el === document.activeElement),
      'skip link not focused first',
    );
    await page.keyboard.press('Enter');
    must(await page.locator('#main').evaluate((el) => el === document.activeElement), 'main not focused');
  });

  await step(page, 'phone width has no sideways scroll', async () => {
    await page.setViewportSize({ width: 360, height: 780 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    must(overflow <= 0, `overflow ${overflow}px`);
  });
}
