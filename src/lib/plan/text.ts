/** Bilingual text: every line of the plan is written in English and Hindi together, and joined the same way. */
import type { Lang } from '../types.js';

export type Text = Readonly<Record<Lang, string>>;

/** One piece of plan text, in English and in Hindi. */
export const bilingual = (en: string, hi: string): Text => ({ en, hi });

/** The pieces run together in order, in each language: a sentence, then the notes that follow it. */
export const joinText = (...parts: readonly Text[]): Text =>
  bilingual(parts.map((t) => t.en).join(''), parts.map((t) => t.hi).join(''));

/** "a, b and c" / "a, b और c". */
export function joinList(items: readonly Text[]): Text {
  const join = (lang: Lang, and: string): string => {
    const words = items.map((t) => t[lang]);
    if (words.length < 2) return words.join('');
    return `${words.slice(0, -1).join(', ')} ${and} ${words.slice(-1).join('')}`;
  };
  return bilingual(join('en', 'and'), join('hi', 'और'));
}

const PLURAL_RULES: Readonly<Record<Lang, Intl.PluralRules>> = {
  en: new Intl.PluralRules('en-IN'),
  hi: new Intl.PluralRules('hi-IN'),
};
/** Each language's [singular, plural] word for a count. */
export type PluralForms = Readonly<Record<Lang, readonly [one: string, other: string]>>;

/**
 * "4 people" / "4 लोग": the count with the word in the right grammatical number for each language (CLDR rules,
 * as `tn` in i18n.ts; English and Hindi have only "one" and "other").
 */
export function plural(count: number, forms: PluralForms): Text {
  const word = (lang: Lang): string => forms[lang][PLURAL_RULES[lang].select(count) === 'one' ? 0 : 1];
  return bilingual(`${count} ${word('en')}`, `${count} ${word('hi')}`);
}
