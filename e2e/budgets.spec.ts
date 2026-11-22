import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { JS_BUDGET_KB, NARROW_WIDTH_PX } from './limits';
import { mockApis, openHousehold, pickDelhi } from './mocks';

// Generic guards: each test checks a whole class of regression (fonts, bundle size, names, overflow,
// contrast) across many page states, rather than one known bug.

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'spinbutton', 'checkbox', 'radio',
  'switch', 'slider', 'DisclosureTriangle',
]);
const REGION_ROLES = new Set(['region', 'main', 'banner', 'navigation', 'contentinfo', 'complementary', 'form', 'search']);

interface AXNode {
  nodeId: string;
  parentId?: string;
  ignored: boolean;
  role?: { value: string };
  name?: { value: string };
}

/** Interactive elements without a name, and buttons/links that share a name inside one region. */
async function nameProblems(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: AXNode[] };
  await cdp.detach();
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const regionOf = (n: AXNode): string => {
    for (let p = n.parentId ? byId.get(n.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
      if (REGION_ROLES.has(p.role?.value ?? '')) return `${p.role?.value ?? ''} "${p.name?.value ?? ''}" #${p.nodeId}`;
    }
    return 'page';
  };
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const n of nodes) {
    const role = n.role?.value ?? '';
    if (n.ignored || !INTERACTIVE_ROLES.has(role)) continue;
    const name = (n.name?.value ?? '').trim();
    const region = regionOf(n);
    if (!name) problems.push(`unnamed ${role} in ${region}`);
    if (role !== 'button' && role !== 'link') continue;
    const key = `${region} → ${role} "${name}"`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) if (count > 1) problems.push(`${count}× ${key}`);
  return problems;
}

/** The DOM side of the same check: every native interactive element is exposed to the AX tree with a name. */
async function unnamedDomControls(page: Page): Promise<string[]> {
  const controls = page.locator('button, a, input, select, textarea, summary');
  const out: string[] = [];
  for (const el of await controls.all()) {
    if (!(await el.isVisible())) continue;
    const name = await el.evaluate((node) => {
      const e = node as HTMLElement;
      const byIds = (e.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '');
      const labels = 'labels' in e ? Array.from((e as HTMLInputElement).labels ?? [], (l) => l.textContent ?? '') : [];
      return [e.getAttribute('aria-label') ?? '', ...byIds, ...labels, e.textContent ?? '', e.title].join('').trim();
    });
    if (!name) out.push(await el.evaluate((node) => node.outerHTML.slice(0, 120)));
  }
  return out;
}

async function expectNamesOk(page: Page, state: string) {
  expect([...(await nameProblems(page)), ...(await unnamedDomControls(page))], state).toEqual([]);
}

async function expandRows(page: Page, count: number) {
  const rows = page.locator('.row-item summary');
  for (let i = 0; i < count; i++) await rows.nth(i).click();
}

async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, button, li'))
      .filter((e) => e.offsetParent !== null && !e.closest('.visually-hidden') && e.scrollWidth > e.clientWidth + 1)
      .map((e) => `${e.tagName.toLowerCase()}.${e.className} (${e.scrollWidth} > ${e.clientWidth}): ${(e.textContent ?? '').slice(0, 60)}`),
  );
}

test.beforeEach(async ({ page }) => {
  await mockApis(page);
});

test('Devanagari fonts load only once the page is in Hindi', async ({ page }) => {
  const devanagari: string[] = [];
  page.on('request', (r) => {
    if (/devanagari.*\.woff2/.test(r.url())) devanagari.push(r.url());
  });
  await page.goto('/');
  await pickDelhi(page);
  await page.waitForLoadState('networkidle');
  expect(devanagari, 'English page fetched Devanagari fonts').toEqual([]);

  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect.poll(() => devanagari.length).toBeGreaterThan(0);
});

test(`first load transfers under ${JS_BUDGET_KB} KB of JavaScript (compressed)`, async ({ page }) => {
  const sizes: Promise<{ url: string; bytes: number }>[] = [];
  page.on('requestfinished', (r) => {
    if (r.resourceType() !== 'script') return;
    sizes.push(r.sizes().then((s) => ({ url: r.url(), bytes: s.responseBodySize + s.responseHeadersSize })));
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const scripts = await Promise.all(sizes);
  expect(scripts.length).toBeGreaterThan(0);
  const total = scripts.reduce((sum, s) => sum + s.bytes, 0);
  expect(total, JSON.stringify(scripts)).toBeLessThan(JS_BUDGET_KB * 1024);
});

test('every control has a name, and no region repeats a button or link name', async ({ page }) => {
  await page.goto('/');
  await expectNamesOk(page, 'empty page');
  await pickDelhi(page);
  await expectNamesOk(page, 'plan');
  await openHousehold(page);
  await expectNamesOk(page, 'household form open');
  await expandRows(page, 1);
  await expectNamesOk(page, 'expanded row');
  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expectNamesOk(page, 'Hindi');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectNamesOk(page, 'Hindi, dark mode');
});

test(`no text overflows its box at ${NARROW_WIDTH_PX} px, English and Hindi`, async ({ page }) => {
  await page.setViewportSize({ width: NARROW_WIDTH_PX, height: 720 });
  await page.goto('/');
  expect(await overflowing(page), 'empty page').toEqual([]);
  await pickDelhi(page);
  await openHousehold(page);
  await expandRows(page, 3);
  expect(await overflowing(page), 'English').toEqual([]);
  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await page.evaluate(() => document.fonts.ready);
  expect(await overflowing(page), 'Hindi').toEqual([]);
});

test(`no WCAG 2.2 AA violations at ${NARROW_WIDTH_PX} px in Hindi, dark mode, rows expanded`, async ({ page }) => {
  await page.setViewportSize({ width: NARROW_WIDTH_PX, height: 720 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await pickDelhi(page);
  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expandRows(page, 3);
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});

/** A row title must keep at least this share of its row: badges beside it wrap under it instead of squeezing it. */
const MIN_TITLE_SHARE = 0.4;
const squeezedTitles = (page: Page) =>
  page.locator('.row-item summary').evaluateAll((rows, share) =>
    rows.flatMap((row) => {
      const title = row.querySelector('.row-title');
      const w = title?.getBoundingClientRect().width ?? 0;
      return w < row.getBoundingClientRect().width * share ? [`${title?.textContent ?? ''}: ${Math.round(w)} px`] : [];
    }), MIN_TITLE_SHARE);

test('every "More ways" title keeps a readable width at 1280 px and phone width, English and Hindi', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await pickDelhi(page);
  await expect(page.locator('.row-title').first()).toBeVisible();
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await squeezedTitles(page), `English ${width}`).toEqual([]);
  }
  await page.getByRole('button', { name: /Language/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  expect(await squeezedTitles(page), 'Hindi').toEqual([]);
});
