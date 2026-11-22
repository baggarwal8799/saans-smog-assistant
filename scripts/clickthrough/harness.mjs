// The step runner: runs each named step, records PASS/FAIL with a note, and screenshots every step.
import { mkdirSync } from 'node:fs';

export const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
export const EXPECT_AI = process.env.EXPECT_AI === 'true';
export const OUT = 'screenshots/clickthrough';
mkdirSync(OUT, { recursive: true });

export const results = [];
let n = 0;
export async function step(page, name, fn) {
  n += 1;
  const id = String(n).padStart(2, '0');
  try {
    const note = await fn();
    results.push({ step: `${id} ${name}`, ok: true, note: note ?? '' });
  } catch (err) {
    results.push({
      step: `${id} ${name}`,
      ok: false,
      note: err instanceof Error ? err.message.split('\n')[0] : String(err),
    });
  }
  await page
    .screenshot({ path: `${OUT}/${id}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`, fullPage: true })
    .catch(() => undefined);
}
export const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/** Prints the report and exits non-zero on any failed step or console error. */
export function report(consoleErrors) {
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const note = r.note ? `  ·  ${r.note}` : '';
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.step}${note}`);
  }
  console.log(consoleErrors.length ? `\nConsole errors:\n${consoleErrors.join('\n')}` : '\nNo console errors.');
  console.log(`\n${results.length - failed.length}/${results.length} steps passed. Screenshots: ./${OUT}`);
  if (failed.length || consoleErrors.length) process.exit(1);
}
