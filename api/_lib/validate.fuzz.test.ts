// @vitest-environment node
/**
 * Property-style fuzzing of request validation, with a seeded generator so every failure reproduces. Each input
 * must either be rejected with a ValidationError or produce a request that satisfies every invariant below.
 */
import { describe, expect, it } from 'vitest';
import { LIMITS, type AssistantRequest } from '../../src/lib/contract';
import { DEFAULT_PROFILE } from '../../src/lib/profile';
import { body } from '../../src/test/apiHelpers';
import { ValidationError, parseAssistantRequest, stripUnsafe } from './validate';

const RUNS = 500;
const SEED = 0x5eed_2026;

/** mulberry32: a tiny, fast PRNG with a 32-bit state. */
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)] as T;
  return { next, int, pick, chance: (p: number) => next() < p };
}
type Rng = ReturnType<typeof rng>;

/** Control, bidi-override and fence characters, plus ordinary text, Hindi and an astral emoji. */
/** Code points the validator must strip: C0 controls (bar tab, LF, CR), DEL and the bidi embeddings and isolates. */
const UNSAFE_POINTS = [0x00, 0x07, 0x0b, 0x1b, 0x1f, 0x7f, 0x202a, 0x202c, 0x202e, 0x2066, 0x2069];
// Built from numbers so the source itself never contains an invisible bidi character (Trojan Source).
const HOSTILE = [...UNSAFE_POINTS.map((c) => String.fromCodePoint(c)), '<', '>', '</QUESTION>'];
const BENIGN = ['a', 'Z', ' ', '\t', '\n', '\r', '7:30', 'दिल्ली', '😷', '?', '"', '\\', '&', '{', '%'];

function text(r: Rng, maxLen: number): string {
  let out = '';
  const len = r.int(maxLen);
  while (out.length < len) out += r.chance(0.3) ? r.pick(HOSTILE) : r.pick(BENIGN);
  return out;
}

const NUMBERS = [NaN, Infinity, -Infinity, -0, 0, 90, 90.0001, -90, -180, 180, 180.5, 1e308, -1e308, Number.MIN_VALUE];

function junk(r: Rng, depth = 0): unknown {
  switch (r.int(depth > 2 ? 7 : 9)) {
    case 0:
      return null;
    case 1:
      return undefined;
    case 2:
      return r.chance(0.5);
    case 3:
      return r.pick(NUMBERS);
    case 4:
      return (r.next() - 0.5) * 1000;
    case 5:
      return text(r, 40);
    case 6:
      return 'x'.repeat(r.pick([LIMITS.question, LIMITS.question + 1, 100_000]));
    case 7:
      return Array.from({ length: r.int(5) }, () => junk(r, depth + 1));
    default:
      return Object.fromEntries(Array.from({ length: r.int(4) }, () => [text(r, 8), junk(r, depth + 1)]));
  }
}

/** Usually a valid value, sometimes junk: each field is mangled on its own, so many requests still pass. */
const maybe = (r: Rng, good: () => unknown): unknown => (r.chance(0.88) ? good() : junk(r));
const coord = (r: Rng, span: number): number => (r.chance(0.9) ? (r.next() - 0.5) * span : r.pick(NUMBERS));

function placeInput(r: Rng): Record<string, unknown> {
  const place: Record<string, unknown> = {
    name: maybe(r, () => `${text(r, 100)}Delhi`),
    lat: coord(r, 190),
    lon: coord(r, 370),
  };
  if (r.chance(0.5)) place.region = maybe(r, () => text(r, 90));
  if (r.chance(0.5)) place.country = maybe(r, () => text(r, 90));
  if (r.chance(0.3)) place[text(r, 6) || 'extra'] = junk(r);
  return place;
}

const EXTRA_KEYS = ['context', 'answer', 'system', 'recommendations', 'usAqi'];

/** Mostly a valid request with some fields mangled and extra keys added. */
function input(r: Rng): unknown {
  if (r.chance(0.05)) return junk(r);
  if (r.chance(0.03)) return JSON.parse('{"__proto__":{"polluted":true},"lang":"en"}') as unknown;
  const o: Record<string, unknown> = body({
    lang: maybe(r, () => r.pick(['en', 'hi'])),
    mode: maybe(r, () => r.pick(['summary', 'question'])),
    question: maybe(r, () => `${text(r, LIMITS.question + 20)}?`),
    place: maybe(r, () => placeInput(r)),
    profile: maybe(r, () => ({ ...DEFAULT_PROFILE, [r.pick(Object.keys(DEFAULT_PROFILE))]: junk(r) })),
    history: maybe(r, () => Array.from({ length: r.int(LIMITS.historyTurns + 2) }, () => `q${text(r, 60)}`)),
  });
  for (let i = r.int(3); i > 0; i--) o[r.pick(EXTRA_KEYS)] = junk(r);
  return o;
}

/** An independent oracle for validate.ts isUnsafeCodePoint, written from the spec rather than copied. */
function isUnsafeChar(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c < 0x20 && ![0x09, 0x0a, 0x0d].includes(c)) ||
    c === 0x7f ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2066 && c <= 0x2069)
  );
}
const hasUnsafe = (value: string): boolean => {
  for (const ch of value) if (isUnsafeChar(ch)) return true;
  return false;
};

function expectCleanText(value: string, max: number, required: boolean) {
  expect(value.length).toBeLessThanOrEqual(max);
  if (required) expect(value.length).toBeGreaterThan(0);
  expect(hasUnsafe(value)).toBe(false);
  expect(value).not.toMatch(/[<>]/);
  expect(value).not.toMatch(/\s\s|^\s|\s$|[\t\n\r]/);
}

function expectInvariants(req: AssistantRequest) {
  // Sets, not sorted arrays: key order is irrelevant here, so no comparator is needed (AGENTS.md rule 12).
  expect(new Set(Object.keys(req))).toEqual(new Set(['lang', 'mode', 'question', 'place', 'profile', 'history']));
  expect(['en', 'hi']).toContain(req.lang);
  expect(['summary', 'question']).toContain(req.mode);
  if (req.mode === 'question') expectCleanText(req.question, LIMITS.question, true);
  else expect(req.question).toBe('');

  const { place } = req;
  for (const key of Object.keys(place)) expect(['name', 'lat', 'lon', 'region', 'country']).toContain(key);
  expectCleanText(place.name, LIMITS.shortText, true);
  if (place.region !== undefined) expectCleanText(place.region, 80, true);
  if (place.country !== undefined) expectCleanText(place.country, 80, true);
  expect(Number.isFinite(place.lat) && place.lat >= -90 && place.lat <= 90).toBe(true);
  expect(Number.isFinite(place.lon) && place.lon >= -180 && place.lon <= 180).toBe(true);

  expect(new Set(Object.keys(req.profile))).toEqual(new Set(Object.keys(DEFAULT_PROFILE)));
  for (const [key, value] of Object.entries(req.profile)) {
    expect(typeof value).toBe(typeof DEFAULT_PROFILE[key as keyof typeof DEFAULT_PROFILE]);
    if (typeof value === 'number') expect(Number.isFinite(value) && value >= 0).toBe(true);
  }

  expect(Array.isArray(req.history)).toBe(true);
  expect(req.history.length).toBeLessThanOrEqual(LIMITS.historyTurns);
  for (const q of req.history) expectCleanText(q, LIMITS.question, true);
}

describe('parseAssistantRequest under fuzzing', () => {
  it(`rejects with ValidationError or returns a clean request, over ${RUNS} seeded inputs`, () => {
    const r = rng(SEED);
    let accepted = 0;
    let rejected = 0;
    for (let i = 0; i < RUNS; i++) {
      const value = input(r);
      let req: AssistantRequest;
      try {
        req = parseAssistantRequest(value);
      } catch (err) {
        // Never a TypeError or RangeError from inside the validator: only its own, expected error.
        expect(err, `run ${i}`).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toMatch(/must be|is required|is too long|is out of range|is invalid/);
        rejected++;
        continue;
      }
      expectInvariants(req);
      accepted++;
    }
    // A "__proto__" key from JSON.parse must never reach Object.prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Both paths must actually be exercised, or the generator has drifted.
    expect(accepted).toBeGreaterThan(RUNS * 0.15); // 124 of 500 with this seed
    expect(rejected).toBeGreaterThan(RUNS * 0.2);
  });
});

describe('stripUnsafe under fuzzing', () => {
  it(`removes every control and bidi character and keeps everything else, over ${RUNS} seeded inputs`, () => {
    const r = rng(SEED + 2);
    for (let i = 0; i < RUNS; i++) {
      const raw = text(r, 200);
      const out = stripUnsafe(raw);
      let kept = '';
      for (const ch of raw) if (!isUnsafeChar(ch)) kept += ch;
      expect(hasUnsafe(out)).toBe(false);
      expect(out).toBe(kept);
      expect(stripUnsafe(out)).toBe(out);
    }
  });
});
