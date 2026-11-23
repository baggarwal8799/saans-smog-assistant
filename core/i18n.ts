import { pluralForm } from './copy/text.js';
import { en, type MessageKey } from './i18n-en.js';
import { preloaded } from './i18n-preloaded.js';
import type { AqiLevel, Commute, Cooking, Heating, Lang, Pollutant } from './types.js';

export type { MessageKey };

type Dictionary = Record<MessageKey, string>;

// Module state on purpose: t() is called synchronously everywhere, so one loaded dictionary must serve every caller.
const dictionaries: Partial<Record<Lang, Dictionary>> = { en, ...preloaded };

type LazyLang = Exclude<Lang, 'en'>;

/** Each non-English language's own lazy chunk, so a language can only ever load its own dictionary. */
const loaders: Readonly<Record<LazyLang, () => Promise<Dictionary>>> = {
  // Typed as the full dictionary, so a missing Hindi key fails the type check.
  hi: () => import('./i18n-hi.js').then((loaded) => loaded.hi),
};
const loading = new Map<LazyLang, Promise<void>>();

export function isLangReady(lang: Lang): boolean {
  return dictionaries[lang] !== undefined;
}

/** Fetches a dictionary once for all callers; a failed fetch is forgotten, so the next attempt retries. */
export function loadDictionary(lang: Lang): Promise<void> {
  if (lang === 'en' || isLangReady(lang)) return Promise.resolve();
  const inFlight = loading.get(lang);
  if (inFlight) return inFlight;
  const load = loaders[lang]().then(
    (dictionary) => {
      dictionaries[lang] = dictionary;
    },
    (err: unknown) => {
      loading.delete(lang);
      throw err;
    },
  );
  loading.set(lang, load);
  return load;
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

/** A counted string in the right grammatical number ("1 person", "2 लोग"); `count` is the number as shown. */
export function tn(lang: Lang, base: PluralBase, count: number, params: Record<string, string | number> = {}): string {
  return t(lang, `${base}_${pluralForm(lang, count)}`, { n: formatNumber(lang, count, 1), ...params });
}

export const aqiKey = (level: AqiLevel): MessageKey => `aqi_${level}`;
export const pollutantKey = (pollutant: Pollutant): MessageKey => `pollutant_${pollutant}`;
export const commuteKey = (mode: Commute): MessageKey => `commute_${mode}`;
export const cookingKey = (fuel: Cooking): MessageKey => `cooking_${fuel}`;
export const heatingKey = (heating: Heating): MessageKey => `heating_${heating}`;

export function formatNumber(lang: Lang, value: number, digits = 0): string {
  return new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}
