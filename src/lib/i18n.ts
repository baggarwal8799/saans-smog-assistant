import type { Commute, Cooking, Heating, Lang, Pollutant } from './types.js';
import type { AqiLevel } from './aqi.js';
import { en, type MessageKey } from './i18n-en.js';
import { preloaded } from './i18n-preloaded.js';

export type { MessageKey };

type Dictionary = Record<MessageKey, string>;

// English ships in the main bundle. In the browser Hindi is its own chunk, fetched only for people who use it; on a
// server it is preloaded (see i18n-preloaded.ts).
const dictionaries: Partial<Record<Lang, Dictionary>> = { en, ...preloaded };
let hindi: Promise<void> | null = null;

/** True once `lang` can be rendered without falling back to English. */
export function isLangReady(lang: Lang): boolean {
  return dictionaries[lang] !== undefined;
}

/**
 * Fetches a language's dictionary once; concurrent callers share the request. A failed fetch (offline) rejects and
 * is forgotten, so the next attempt tries again instead of being stuck on English.
 */
export function loadDictionary(lang: Lang): Promise<void> {
  if (isLangReady(lang)) return Promise.resolve();
  hindi ??= import('./i18n-hi.js').then(
    (m) => {
      // Typed as the full dictionary, so a missing Hindi key still fails the type check here and in i18n-hi.ts.
      const hi: Dictionary = m.hi;
      dictionaries.hi = hi;
    },
    (err: unknown) => {
      hindi = null;
      throw err;
    },
  );
  return hindi;
}

/** Falls back to English for a language still loading, so a stray early call never shows a raw key or crashes. */
export function t(lang: Lang, key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = (dictionaries[lang] ?? en)[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** Keys that come as a `${base}_one` / `${base}_other` pair. */
export type PluralBase = {
  [K in MessageKey]: K extends `${infer B}_one` ? (`${B}_other` extends MessageKey ? B : never) : never;
}[MessageKey];

const pluralRules = new Map<Lang, Intl.PluralRules>();

/**
 * A counted string in the right grammatical number: English "1 person" and "2 people", Hindi "1 व्यक्ति" and "2 लोग".
 * `count` is the number as shown (already rounded), so "1.0" and "1" agree with the words next to them. `{n}` is
 * the count formatted for the language unless the caller passes its own. English and Hindi have only the "one"
 * and "other" forms, so any other category CLDR might return falls back to "other".
 */
export function tn(lang: Lang, base: PluralBase, count: number, params: Record<string, string | number> = {}): string {
  let rules = pluralRules.get(lang);
  if (!rules) pluralRules.set(lang, (rules = new Intl.PluralRules(lang === 'hi' ? 'hi-IN' : 'en-IN')));
  const form = rules.select(count) === 'one' ? 'one' : 'other';
  return t(lang, `${base}_${form}`, { n: formatNumber(lang, count, 1), ...params });
}

export const aqiKey = (level: AqiLevel): MessageKey => `aqi_${level}`;
export const pollutantKey = (p: Pollutant): MessageKey => `pollutant_${p}`;
export const commuteKey = (mode: Commute): MessageKey => `commute_${mode}`;
export const cookingKey = (fuel: Cooking): MessageKey => `cooking_${fuel}`;
export const heatingKey = (h: Heating): MessageKey => `heating_${h}`;

export function formatNumber(lang: Lang, value: number, digits = 0): string {
  return new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}
