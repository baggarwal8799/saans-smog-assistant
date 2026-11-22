// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REQUESTS_PER_MINUTE } from '../api/_lib/assistant';
import { LIMITS } from '../api/_lib/contract';
import { DEFAULT_MODEL, FALLBACK_MODELS } from '../api/_lib/gemini';
import { JS_BUDGET_KB } from '../e2e/limits';
import { AIR_CACHE_MAX } from './lib/aqi';
import { HEAVY_EXERTION_AQI } from './lib/plan/shared';
import { TRAP_MIXING_M, TRAP_WIND_KMH } from './lib/weather';

// Docs drift silently. Every number and name a doc states is checked against the constant it describes,
// so changing the code without the docs (or the docs without the code) fails here.

const ROOT = resolve(__dirname, '..');
const DOCS = ['README.md', 'AGENTS.md', 'SETUP.md', 'DEPLOY.md'] as const;
const text = Object.fromEntries(DOCS.map((d) => [d, readFileSync(join(ROOT, d), 'utf8')])) as Record<(typeof DOCS)[number], string>;
const all = DOCS.map((d) => text[d]).join('\n');
const num = (s: string) => Number(s.replace(/,/g, ''));
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** The self-hosted server's body cap is a private constant, so read it from the source. */
function serverMaxBodyKb(): number {
  const m = /const MAX_BODY = (\d+) \* 1024;/.exec(readFileSync(join(ROOT, 'server/index.ts'), 'utf8'));
  if (!m?.[1]) throw new Error('MAX_BODY not found in server/index.ts');
  return Number(m[1]);
}

/** Each size claim must sit next to words that say which constant it is. */
const SIZE_CLAIMS: { context: RegExp; bytes: number }[] = [
  { context: /request body|request limit|body cap of/i, bytes: LIMITS.bodyBytes },
  { context: /KB body cap|server.*cap/i, bytes: serverMaxBodyKb() * 1024 },
  { context: /Antigravity|this file under/i, bytes: 24_000 },
  { context: /JavaScript|bundle/i, bytes: JS_BUDGET_KB * 1024 },
];

function matchesIn(re: RegExp): { doc: string; m: RegExpExecArray }[] {
  return DOCS.flatMap((doc) => [...text[doc].matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))].map((m) => ({ doc, m })));
}

describe('numbers in the docs match the code', () => {
  it.each([
    ['N per minute', /(\d+) (?:questions )?per minute/, REQUESTS_PER_MINUTE],
    ['air cache entries', /(\d+) entries/, AIR_CACHE_MAX],
    ['smog-trap wind', /(\d+) km\/h/, TRAP_WIND_KMH],
    ['smog-trap mixing height', /mixing(?: height)?[^.\n]{0,12}?(\d+) m\b/, TRAP_MIXING_M],
    ['workouts move indoors', /from AQI (\d+)/, HEAVY_EXERTION_AQI + 1],
  ])('%s', (_label, re, expected) => {
    const found = matchesIn(re);
    expect(found.length, `no doc mentions ${re}`).toBeGreaterThan(0);
    for (const { doc, m } of found) expect(num(m[1] ?? ''), `${doc}: "${m[0]}"`).toBe(expected);
  });

  it('every KB or byte size is a known constant', () => {
    for (const { doc, m } of matchesIn(/(\d[\d,]*)\s?(KB|bytes)\b/)) {
      const at = m.index;
      const window = text[doc as (typeof DOCS)[number]].slice(Math.max(0, at - 60), at + 40);
      const claim = SIZE_CLAIMS.find((c) => c.context.test(window));
      expect(claim, `${doc}: unmapped size "${window}"`).toBeDefined();
      const n = num(m[1] ?? '');
      // A KB claim may be binary (16 KB = 16 × 1024) or decimal (24 KB = 24,000 bytes), but must be exact.
      const candidates = m[2] === 'KB' ? [n * 1024, n * 1000] : [n];
      expect(candidates, `${doc}: "${window}"`).toContain(claim?.bytes);
    }
  });

  it('history length matches LIMITS.historyTurns, and no doc says model answers are sent back', () => {
    const found = matchesIn(/last (\w+) (?:questions|exchanges|turns)/i);
    expect(found.length).toBeGreaterThan(0);
    for (const { doc, m } of found) expect(WORDS[(m[1] ?? '').toLowerCase()], `${doc}: "${m[0]}"`).toBe(LIMITS.historyTurns);
    expect(all).not.toMatch(/\bexchanges\b|earlier turns|(previous|past|earlier) answers/i);
  });
});

describe('model names in the docs match api/_lib/gemini.ts', () => {
  const known = [DEFAULT_MODEL, ...FALLBACK_MODELS];
  /** Mentioned only as models that no longer work; each mention must say so. */
  const RETIRED = ['gemini-2.5-flash'];

  it('every gemini-* id is in the chain, or documented as retired', () => {
    for (const { doc, m } of matchesIn(/(?<![/\w-])gemini-[a-z0-9][\w.-]*[a-z0-9]/)) {
      const id = m[0];
      if (known.includes(id)) continue;
      expect(RETIRED, `${doc}: unknown model "${id}"`).toContain(id);
      const line = text[doc as (typeof DOCS)[number]].slice(m.index, text[doc as (typeof DOCS)[number]].indexOf('\n', m.index));
      expect(line, `${doc}: retired "${id}" must say why`).toMatch(/404|no longer|closed/);
    }
  });

  it('every stated default is DEFAULT_MODEL', () => {
    const found = matchesIn(/(?:default `|`GEMINI_MODEL` \| `|AI: Gemini \(|tier, `)(gemini-[\w.-]+)/);
    expect(found.length).toBeGreaterThan(2);
    for (const { doc, m } of found) expect(m[1], doc).toBe(DEFAULT_MODEL);
  });

  it('the documented fallback chain is the real one', () => {
    const line = /The chain is ([^\n]*?)\. Each/.exec(text['AGENTS.md'])?.[1] ?? '';
    const ids = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    expect(ids).toEqual(['GEMINI_MODEL', DEFAULT_MODEL, ...FALLBACK_MODELS]);
  });
});

describe('commands and paths in the docs exist', () => {
  const scripts = Object.keys((JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts);

  it('every `npm run X` is a package.json script', () => {
    const named = [...all.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(5);
    expect(named.filter((s) => !scripts.includes(s ?? ''))).toEqual([]);
  });

  /** Build outputs and local-only files: mentioned on purpose, but absent on a fresh clone. */
  const GENERATED = /^(\.\/)?(dist|dist-server|coverage|test-results|screenshots|demo|node_modules)(\/|$)|^\.env$/;
  const SEARCH_DIRS = ['', 'src', 'src/lib', 'src/lib/plan', 'src/components', 'api', 'api/_lib', 'server', 'scripts', 'e2e'];
  const exists = (p: string) => {
    const parts = p.split('/');
    const glob = parts.findIndex((s) => /[*{]/.test(s));
    // For a glob, the folder before the first wildcard segment must exist.
    return existsSync(join(ROOT, ...(glob === -1 ? parts : parts.slice(0, glob))));
  };

  it('every repo path in backticks exists', () => {
    const prose = all.replace(/^```[\s\S]*?^```/gm, '');
    const tokens = [...new Set([...prose.matchAll(/`([^`\s]+)`/g)].map((m) => m[1] ?? ''))];
    const paths = tokens.filter((t) => /^\.?[\w-]+(\/[\w.*-]*)+$/.test(t) && !/^\//.test(t));
    const files = tokens.filter((t) => !t.includes('/') && /^(\.?[\w-]+\.(md|json|ya?ml|tsx?|mjs|example)|Dockerfile|\.nvmrc|\.dockerignore)$/.test(t));
    expect(paths.length).toBeGreaterThan(20);
    const missing = [
      ...paths.filter((p) => !GENERATED.test(p) && !exists(p)),
      ...files.filter((f) => !SEARCH_DIRS.some((d) => existsSync(join(ROOT, d, f)) || readdirSync(join(ROOT, d || '.')).includes(f))),
    ];
    expect(missing).toEqual([]);
  });
});

describe('docs stay readable by agents and never go stale', () => {
  it('AGENTS.md is under 24,000 bytes (Antigravity truncates longer rule files)', () => {
    expect(Buffer.byteLength(text['AGENTS.md'], 'utf8')).toBeLessThan(24_000);
  });

  it('no doc hard-codes a test count', () => {
    expect(all.match(/\b\d+ (unit|integration|browser|e2e|end-to-end|Playwright) tests?\b/gi) ?? []).toEqual([]);
  });
});
