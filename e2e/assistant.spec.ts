import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, mockApis, mockAssistant, pickDelhi } from './mocks';

test('a successful answer renders as a paragraph plus a real list, and stays accessible', async ({ page }) => {
  await mockApis(page);
  const sent = await mockAssistant(page);
  await page.goto('/');
  await pickDelhi(page);

  const ask = page.getByRole('region', { name: /Ask/ });
  // The summary is requested on its own once the plan appears.
  await expect(ask.getByRole('figure')).toContainText('Personal summary');

  await ask.getByLabel('Your question').fill('Can I go for a run at 7:30 tomorrow?');
  await ask.getByRole('button', { name: 'Ask', exact: true }).click();

  const answer = ask.getByRole('figure');
  await expect(answer.locator('figcaption')).toHaveText('Answer');
  await expect(answer.locator('p')).toHaveText(/^No\. At 7:30 the air is still inside the smog trap/);
  const items = answer.getByRole('list').getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toHaveText('Run after 13:00, when PM2.5 falls to about 90.');
  // The bullet marker is turned into list markup, never shown as text.
  await expect(answer).not.toContainText('•');
  await expect(page.getByRole('alert')).toHaveCount(0);

  const question = sent.find((b) => b.mode === 'question');
  expect(question).toMatchObject({ lang: 'en', question: 'Can I go for a run at 7:30 tomorrow?' });
  expect(question?.place).toMatchObject({ name: 'New Delhi', lat: 28.61, lon: 77.21 });

  await expectNoA11yViolations(page);
});
