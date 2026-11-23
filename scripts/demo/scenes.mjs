// @ts-check
import { BASE, CITY, OUT } from './config.mjs';
import { desktopTour } from './desktop-tour.mjs';
import { addOverlay, helpers } from './overlay.mjs';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Browser} Browser */
/** @typedef {import('./lines.mjs').Cue} Cue */
/** @typedef {import('./lines.mjs').Durations} Durations */
/** @typedef {ReturnType<typeof helpers>} Helpers */

/**
 * @param {Page} page
 * @param {Helpers} h
 * @param {{ mobile: boolean }} opts
 */
async function pickCity(page, h, { mobile }) {
  const talking = h.scene(
    mobile ? 'm_search' : 'd_search',
    mobile ? 'Search your city' : 'Search your city, or use your location',
    1200,
  );
  const box = page.getByRole('searchbox');
  await h.click(box);
  await box.pressSequentially(CITY, { delay: 110 });
  await h.click(page.getByRole('button', { name: 'Search', exact: true }));
  const first = page.locator('.results button').first();
  await first.waitFor({ timeout: 20_000 });
  await h.wait(500);
  await talking;
  await h.click(first);
  await page.locator('#air-heading').waitFor({ timeout: 30_000 });
  await h.wait(600);
}

/**
 * Opens a recording context with the overlay, runs `tour` on its page, then closes the context (which saves the video).
 * @param {Browser} browser
 * @param {{ options: import('@playwright/test').BrowserContextOptions; mobile: boolean; durations: Durations }} opts
 * @param {(page: Page, h: Helpers) => Promise<void>} tour
 * @returns {Promise<Cue[]>} the narration cues, in the order they started
 */
async function record(browser, { options, mobile, durations }, tour) {
  /** @type {Cue[]} */
  const cues = [];
  const context = await browser.newContext(options);
  await addOverlay(context);
  const page = await context.newPage();
  await tour(page, helpers(page, { mobile, durations, cues, t0: Date.now() }));
  await context.close();
  return cues;
}

/**
 * @param {Browser} browser
 * @param {Durations} durations
 * @returns {Promise<Cue[]>}
 */
export function desktop(browser, durations) {
  const options = {
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: `${OUT}/raw-desktop`, size: { width: 1280, height: 720 } },
  };
  return record(browser, { options, mobile: false, durations }, async (page, h) => {
    await page.goto(BASE);
    await h.wait(800);
    await h.scene('d_intro', 'Saans: a Gen-AI assistant that helps families get through winter smog', 3200);
    await pickCity(page, h, { mobile: false });
    await desktopTour(page, h);
  });
}

/**
 * @param {Page} page
 * @param {Helpers} h
 */
async function mobileTour(page, h) {
  await page.goto(BASE);
  await h.wait(700);
  await h.scene('m_intro', 'Smog season? Meet Saans', 2400);
  await pickCity(page, h, { mobile: true });
  await h.scene('m_air', 'Live air, in plain words', 2600);
  await h.scrollTo(page.locator('.ribbon'), 'center');
  await h.scene('m_ribbon', 'Best time to go out, and when to stay in', 3000);
  await h.scrollTo(page.locator('#first-heading'));
  await h.scene('m_steps', 'Your 3 most important steps', 3000);
  await h.scrollTo(page.locator('.impact-summary'), 'center');
  await h.scene('m_impact', 'Your impact: less smog in your lungs, less CO₂', 3000);
  await h.scrollTo(page.locator('#ask-heading'));
  await h.scene('m_ask', 'Ask Saans (Google Gemini)', 1200);
  await h.click(page.getByRole('button', { name: 'Explain my plan' }));
  await h.waitAnswer();
  await h.showCaption('');
  await h.scene('m_answer', undefined, 5500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await h.wait(800);
  await h.click(page.getByRole('button', { name: /Language/ }));
  await h.scene('m_hindi', 'हिन्दी में भी', 2600);
  await h.scene('m_outro', 'Saans: breathe cleaner, emit less', 3000);
}

/**
 * @param {Browser} browser
 * @param {Durations} durations
 * @returns {Promise<Cue[]>}
 */
export function mobile(browser, durations) {
  const options = {
    // Playwright records at the viewport size (a larger `size` only pads the frame), so record 540×960 and
    // upscale 2× to 1080×1920 with ffmpeg.
    viewport: { width: 540, height: 960 },
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: `${OUT}/raw-mobile`, size: { width: 540, height: 960 } },
  };
  return record(browser, { options, mobile: true, durations }, mobileTour);
}
