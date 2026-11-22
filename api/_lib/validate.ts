import { sanitizeProfile } from '../../src/lib/profile.js';
import type { Place } from '../../src/lib/types.js';
import { LIMITS, type AssistantRequest } from './contract.js';

export class ValidationError extends Error {}

/**
 * The media type exactly "application/json", with at most one parameter, charset=utf-8 (JSON is UTF-8, RFC 8259).
 * A substring match would also accept "text/plain; x=application/json", a type a cross-site form can send.
 */
export function isJsonContentType(header: string | null): boolean {
  const [type, ...params] = (header ?? '').split(';').map((part) => part.trim().toLowerCase());
  if (type !== 'application/json' || params.length > 1) return false;
  return params.every((p) => /^charset=(?:utf-8|"utf-8")$/.test(p));
}

/** Control characters and bidi overrides can hide instructions from reviewers or break rendering. */
function isUnsafeCodePoint(c: number): boolean {
  const control = (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f;
  const bidi = (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);
  return control || bidi;
}

export function stripUnsafe(value: string): string {
  let out = '';
  for (const ch of value) if (!isUnsafeCodePoint(ch.codePointAt(0) ?? 0)) out += ch;
  return out;
}

export function cleanText(value: unknown, max: number, field: string, required = true): string {
  if (typeof value !== 'string') {
    if (!required && value === undefined) return '';
    throw new ValidationError(`${field} must be text`);
  }
  // Angle brackets are never needed here and could close the prompt's <CONTEXT>/<QUESTION> fences.
  const text = stripUnsafe(value).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  if (required && text.length === 0) throw new ValidationError(`${field} is required`);
  if (text.length > max) throw new ValidationError(`${field} is too long`);
  return text;
}

/** Type before range, so a string "28.6" is told it must be a number rather than that it is out of range. */
function cleanNumber(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError(`${field} must be a number`);
  if (value < min || value > max) throw new ValidationError(`${field} is out of range`);
  return value;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function cleanPlace(value: unknown): Place {
  const o = asRecord(value, 'place');
  const place: Place = {
    name: cleanText(o.name, LIMITS.shortText, 'place name'),
    lat: cleanNumber(o.lat, -90, 90, 'lat'),
    lon: cleanNumber(o.lon, -180, 180, 'lon'),
  };
  const region = cleanText(o.region, 80, 'region', false);
  const country = cleanText(o.country, 80, 'country', false);
  if (region) place.region = region;
  if (country) place.country = country;
  return place;
}

/**
 * Earlier QUESTIONS only, cleaned and capped exactly like the question. Model answers are never accepted back from
 * the client: a forged "answer" could plant facts that the model would then repeat.
 */
function cleanHistory(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.historyTurns) throw new ValidationError('history is invalid');
  return value.map((item) => cleanText(item, LIMITS.question, 'history question'));
}

/**
 * Strict allow-list validation: unknown fields (including any client-made "context") are dropped, anything
 * malformed is rejected. The household is coerced to valid values with the same rules the app uses, so an
 * out-of-range commute is clamped to its mode's bound (impact.ts MAX_COMMUTE_KM) exactly as the form does.
 */
export function parseAssistantRequest(body: unknown): AssistantRequest {
  const o = asRecord(body, 'body');
  const lang = o.lang === 'hi' ? 'hi' : o.lang === 'en' ? 'en' : null;
  if (!lang) throw new ValidationError('lang must be en or hi');
  const mode = o.mode === 'summary' || o.mode === 'question' ? o.mode : null;
  if (!mode) throw new ValidationError('mode must be summary or question');
  const question = mode === 'question' ? cleanText(o.question, LIMITS.question, 'question') : '';
  return {
    lang,
    mode,
    question,
    place: cleanPlace(o.place),
    profile: sanitizeProfile(asRecord(o.profile, 'profile')),
    history: cleanHistory(o.history),
  };
}
