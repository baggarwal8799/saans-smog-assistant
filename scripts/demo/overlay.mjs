// @ts-check
/** The pointer the recording shows: the app has none of its own on video. */
const CURSOR_STYLE = {
  position: 'fixed',
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  zIndex: '99999',
  pointerEvents: 'none',
  background: 'rgba(28, 91, 176, 0.35)',
  border: '2px solid #1c5bb0',
  transform: 'translate(-50%, -50%)',
  left: '-50px',
  top: '-50px',
  transition: 'transform 120ms',
};

const CAPTION_STYLE = {
  position: 'fixed',
  left: '50%',
  bottom: '28px',
  transform: 'translateX(-50%)',
  zIndex: '99998',
  pointerEvents: 'none',
  maxWidth: '86%',
  padding: '12px 22px',
  borderRadius: '14px',
  background: 'rgba(20, 34, 48, 0.92)',
  color: '#fff',
  font: "600 24px/1.35 'Mukta', system-ui, sans-serif",
  textAlign: 'center',
  boxShadow: '0 6px 24px rgba(0,0,0,.25)',
  opacity: '0',
  transition: 'opacity 250ms',
};

/**
 * A visible cursor and a caption bar, added only to the recording (never part of the app). It runs inside the page,
 * so it uses nothing from this module: the styles arrive as its argument.
 * @param {{ cursorStyle: Record<string, string>; captionStyle: Record<string, string> }} styles
 */
function overlay({ cursorStyle, captionStyle }) {
  const install = () => {
    if (document.getElementById('demo-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    Object.assign(cursor.style, cursorStyle);
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    Object.assign(caption.style, captionStyle);
    document.body.append(cursor, caption);
    window.addEventListener('mousemove', (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    });
    window.addEventListener('mousedown', () => (cursor.style.transform = 'translate(-50%, -50%) scale(0.7)'));
    window.addEventListener('mouseup', () => (cursor.style.transform = 'translate(-50%, -50%)'));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 */
export const addOverlay = (context) =>
  context.addInitScript(overlay, { cursorStyle: CURSOR_STYLE, captionStyle: CAPTION_STYLE });

/** @typedef {import('@playwright/test').Locator} Locator */

/** @typedef {{ mobile: boolean; durations: Durations; cues: import('./lines.mjs').Cue[]; t0: number }} HelperOpts */
/** @typedef {import('./lines.mjs').Durations} Durations */

/**
 * Sets the caption bar's text; an empty text hides it.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @param {boolean} mobile
 */
const setCaption = (page, text, mobile) =>
  page.evaluate(
    ({ text, mobile }) => {
      const el = document.getElementById('demo-caption');
      if (!el) return;
      el.textContent = text;
      el.style.fontSize = mobile ? '20px' : '24px';
      el.style.opacity = text ? '1' : '0';
    },
    { text, mobile },
  );

/**
 * The paced actions a recorded scene is built from: waits, captions, narration cues, a visible pointer and scrolling.
 * The waits are the video's pacing (time for the viewer and the narration), not waits for the app.
 * @param {import('@playwright/test').Page} page
 * @param {HelperOpts} opts
 */
export function helpers(page, { mobile, durations, cues, t0 }) {
  const wait = (/** @type {number} */ ms) => page.waitForTimeout(ms);
  const showCaption = (/** @type {string} */ text) => setCaption(page, text, mobile);
  /**
   * Shows a caption and starts its narration line. Resolves when both the minimum time and the spoken line
   * are over, so the next scene never talks over this one. Call without await to act while it is spoken.
   * @param {import('./lines.mjs').LineId} id
   * @param {string | undefined} caption
   * @param {number} [minMs]
   */
  const scene = async (id, caption, minMs = 0) => {
    if (caption !== undefined) await showCaption(caption);
    const spoken = durations[id];
    if (spoken !== undefined) cues.push({ id, at: Date.now() - t0 });
    await wait(Math.max(minMs, spoken ? spoken * 1000 + 350 : 0));
  };
  const point = async (/** @type {Locator} */ locator) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await wait(250);
  };
  const click = async (/** @type {Locator} */ locator) => {
    await point(locator);
    await locator.click();
  };
  /**
   * @param {Locator} locator
   * @param {ScrollLogicalPosition} [block]
   */
  const scrollTo = async (locator, block = 'start') => {
    await locator.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);
    await wait(1100);
  };
  const waitAnswer = async () => {
    const answer = page.locator('.answer-text');
    const alert = page.locator('.answer-region [role="alert"]');
    await answer.or(alert).first().waitFor({ timeout: 45_000 });
    await scrollTo(page.locator('.answer-region'), 'center');
  };
  return { wait, showCaption, scene, point, click, scrollTo, waitAnswer };
}
