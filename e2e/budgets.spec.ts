import { expect, test, type Page } from '@playwright/test';
import { JS_BUDGET_KB } from './limits';
import { expandRows, mockApis, openHousehold, pickDelhi } from './mocks';

// Generic guards: each test checks a whole class of regression (fonts, bundle size, names) across many page
// states, rather than one known bug. Layout and contrast guards are in budgets-layout.spec.ts.

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'spinbutton',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'DisclosureTriangle',
]);
const REGION_ROLES = new Set([
  'region',
  'main',
  'banner',
  'navigation',
  'contentinfo',
  'complementary',
  'form',
  'search',
]);

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
      const byIds = (e.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '');
      const labels = 'labels' in e ? Array.from((e as HTMLInputElement).labels ?? [], (l) => l.textContent) : [];
      return [e.getAttribute('aria-label') ?? '', ...byIds, ...labels, e.textContent, e.title].join('').trim();
    });
    if (!name) out.push(await el.evaluate((node) => node.outerHTML.slice(0, 120)));
  }
  return out;
}

async function expectNamesOk(page: Page, state: string) {
  expect([...(await nameProblems(page)), ...(await unnamedDomControls(page))], state).toEqual([]);
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
