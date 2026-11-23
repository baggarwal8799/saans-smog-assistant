// @ts-check
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {ReturnType<typeof import('./overlay.mjs').helpers>} Helpers */

/**
 * @param {Page} page
 * @param {Helpers} h
 */
async function airAndRibbon(page, h) {
  const air = h.scene('d_air', 'Live air quality for your place, in plain words', 3200);
  await h.point(page.locator('.aqi-badge'));
  await air;
  await h.point(page.locator('.ribbon'));
  await h.scene('d_ribbon', 'The next 24 hours: the best time to go out, and when to stay in', 3600);
}

/**
 * @param {Page} page
 * @param {Helpers} h
 */
async function planAndImpact(page, h) {
  await h.scrollTo(page.locator('#plan-heading'));
  await h.scene('d_plan', 'A plan for your household. Do these three things first', 3000);
  await h.click(page.locator('.step .why summary').first());
  await h.scene('d_why', 'Every tip shows its direct impact, and how we worked it out', 3800);

  await h.scrollTo(page.locator('.impact-summary'), 'center');
  await h.scene('d_impact', 'Follow the plan: far less smog in your lungs, less CO₂ every month', 3600);

  await h.scrollTo(page.locator('#more-heading'));
  const more = h.scene(
    'd_more',
    'More ways to help: low-emission routines, indoor air fixes, greener swaps, community action',
    3200,
  );
  await h.wait(1200);
  await h.click(page.locator('.row-item summary').nth(1));
  await more;
}

/**
 * @param {Page} page
 * @param {Helpers} h
 */
async function household(page, h) {
  await h.scrollTo(page.locator('.household'), 'center');
  const talking = h.scene('d_household', 'Change your household details and the plan adapts instantly', 1800);
  await h.click(page.getByRole('button', { name: 'Edit household' }));
  await h.click(page.getByLabel('Winter heating'));
  await page.getByLabel('Winter heating').selectOption('coal');
  await talking;
  await h.scrollTo(page.locator('#first-heading'));
  await h.scene('d_coal', 'Coal heating? A carbon-monoxide safety warning jumps to step 1', 3600);
}

/**
 * @param {Page} page
 * @param {Helpers} h
 */
async function askAndAnswer(page, h) {
  await h.scrollTo(page.locator('#ask-heading'));
  await h.scene('d_ask', 'Ask Saans: answers by Google Gemini, using only the numbers in your plan', 1800);
  await h.click(page.getByRole('button', { name: 'Explain my plan' }));
  await h.waitAnswer();
  await h.showCaption('');
  await h.scene('d_answer', undefined, 6500);

  const q = page.getByLabel('Your question');
  await h.click(q);
  const question = h.scene('d_question', 'Ask anything about today’s air');
  await q.pressSequentially('Is it safe for my kids to play in the park this evening?', { delay: 45 });
  await question;
  await h.click(page.getByRole('button', { name: 'Ask', exact: true }));
  await h.waitAnswer();
  await h.showCaption('');
  await h.scene('d_answer2', undefined, 6500);
}

/**
 * @param {Page} page
 * @param {Helpers} h
 */
async function hindiAndOutro(page, h) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await h.wait(900);
  await h.click(page.getByRole('button', { name: /Language/ }));
  await h.scene('d_hindi', 'पूरा ऐप हिन्दी में भी: The whole app also works in Hindi', 3400);
  await h.scrollTo(page.locator('#plan-heading'));
  await h.wait(2000);
  await h.scrollTo(page.locator('#ask-heading'));
  await h.click(page.getByRole('button', { name: 'मेरी योजना समझाएँ' }));
  await h.waitAnswer();
  await h.showCaption('');
  await h.wait(5500);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await h.wait(900);
  await h.scene('d_outro', 'Saans: breathe cleaner, emit less. Accessible, secure, tested, free to run', 4000);
}

/**
 * @param {Page} page
 * @param {Helpers} h
 */
export async function desktopTour(page, h) {
  for (const part of [airAndRibbon, planAndImpact, household, askAndAnswer, hindiAndOutro]) await part(page, h);
}
