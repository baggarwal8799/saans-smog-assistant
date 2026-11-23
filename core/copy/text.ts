/**
 * The one rule for English and Hindi wording: UI chrome (labels, buttons) uses t(). All other text is a `Text` made
 * with bilingual(), kept in a copy module; the exceptions are the server's fixed lines, beside the code that adds them.
 */
import type { Lang } from '../types.js';

export type Text = Readonly<Record<Lang, string>>;

export const bilingual = (en: string, hi: string): Text => ({ en, hi });

export const NO_TEXT = bilingual('', '');

/** Each language's parts joined by `separator`: none for parts that carry their own spaces, ' ' for sentences. */
export const joinText = (parts: readonly Text[], separator = ''): Text =>
  bilingual(parts.map((t) => t.en).join(separator), parts.map((t) => t.hi).join(separator));

/** Items joined by `separator`, with "and" / "और" before the last one after `lastSeparator`. */
const joinWith =
  (separator: string, lastSeparator: string): ((items: readonly Text[]) => Text) =>
  (items: readonly Text[]): Text => {
    const join = (lang: Lang, and: string): string => {
      const words = items.map((t) => t[lang]);
      if (words.length < 2) return words.join('');
      return `${words.slice(0, -1).join(separator)}${lastSeparator}${and} ${words.slice(-1).join('')}`;
    };
    return bilingual(join('en', 'and'), join('hi', 'और'));
  };

/** "a, b and c" / "a, b और c". */
export const joinList = joinWith(', ', ' ');
/** "a; b; and c" / "a; b; और c": for steps that contain commas of their own. */
export const joinSteps = joinWith('; ', '; ');

const PLURAL_RULES: Readonly<Record<Lang, Intl.PluralRules>> = {
  en: new Intl.PluralRules('en-IN'),
  hi: new Intl.PluralRules('hi-IN'),
};

/** CLDR grammatical number of `count`; English and Hindi have only "one" and "other", so the rest become "other". */
export const pluralForm = (lang: Lang, count: number): 'one' | 'other' =>
  PLURAL_RULES[lang].select(count) === 'one' ? 'one' : 'other';

type PluralForms = Readonly<Record<Lang, readonly [one: string, other: string]>>;

/** "4 people" / "4 लोग": the count with the word in the right grammatical number for each language. */
export function plural(count: number, forms: PluralForms): Text {
  const word = (lang: Lang): string => forms[lang][pluralForm(lang, count) === 'one' ? 0 : 1];
  return bilingual(`${count} ${word('en')}`, `${count} ${word('hi')}`);
}
