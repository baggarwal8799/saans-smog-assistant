import { type AssistantRequest, LIMITS } from '../core/contract.js';
import { isRecord } from '../core/parse.js';
import { toPlace } from '../core/place.js';
import { sanitizeProfile } from '../core/profile.js';
import type { Place } from '../core/types.js';

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

const isControl = (c: number): boolean => (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f;
const isBidiControl = (c: number): boolean => (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);

/** Control characters and bidi overrides can hide instructions from reviewers or break rendering. */
const isUnsafeCodePoint = (c: number): boolean => isControl(c) || isBidiControl(c);

export function stripUnsafe(value: string): string {
  let out = '';
  // A code point from for…of is never empty. charCodeAt gives an astral character's high surrogate (U+D800+),
  // which is as safe as the character itself, so the result is the same as reading the whole code point.
  for (const ch of value) if (!isUnsafeCodePoint(ch.charCodeAt(0))) out += ch;
  return out;
}

function tidyText(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text`);
  // Angle brackets are never needed here and could close the prompt's <CONTEXT>/<QUESTION> fences.
  const text = stripUnsafe(value).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  if (text.length > max) throw new ValidationError(`${field} is too long`);
  return text;
}

export function cleanText(value: unknown, max: number, field: string): string {
  const text = tidyText(value, max, field);
  if (text.length === 0) throw new ValidationError(`${field} is required`);
  return text;
}

export const optionalText = (value: unknown, max: number, field: string): string =>
  value === undefined ? '' : tidyText(value, max, field);

/** Type before range, so a string "28.6" is told it must be a number rather than that it is out of range. */
function cleanNumber(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError(`${field} must be a number`);
  if (value < min || value > max) throw new ValidationError(`${field} is out of range`);
  return value;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ValidationError(`${field} must be an object`);
  return value;
}

/** Each field is checked here for its own error message, then shaped by toPlace exactly as the browser does. */
function cleanPlace(value: unknown): Place {
  const o = asRecord(value, 'place');
  const place = toPlace({
    name: cleanText(o.name, LIMITS.shortText, 'place name'),
    lat: cleanNumber(o.lat, -90, 90, 'lat'),
    lon: cleanNumber(o.lon, -180, 180, 'lon'),
    region: optionalText(o.region, LIMITS.placePart, 'region'),
    country: optionalText(o.country, LIMITS.placePart, 'country'),
  });
  // The checks above match toPlace's own, so this is only reached if the two drift apart.
  if (!place) throw new ValidationError('place is invalid');
  return place;
}

/** Earlier questions only: a forged "answer" from the client could plant facts the model would then repeat. */
function cleanHistory(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.historyTurns) throw new ValidationError('history is invalid');
  return value.map((item) => cleanText(item, LIMITS.question, 'history question'));
}

/** Strict allow-list: unknown fields (a client-made "context" too) are dropped; the household is coerced. */
export function parseAssistantRequest(body: unknown): AssistantRequest {
  const o = asRecord(body, 'body');
  const lang = o.lang;
  if (lang !== 'hi' && lang !== 'en') throw new ValidationError('lang must be en or hi');
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
