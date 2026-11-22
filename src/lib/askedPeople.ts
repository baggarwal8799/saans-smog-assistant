/**
 * Who a question is about ("my kids and my father"): the people the US EPA verdict judges (verdict.ts) and the
 * model must answer for. The labels are fixed words, never the user's text, so they are safe to state inside CONTEXT.
 */
import type { Lang } from './types.js';

interface Person {
  /** How the person is named to the model. */
  label: Readonly<Record<Lang, string>>;
  /** Words in a question that mean this person. */
  asked: RegExp;
}

const PEOPLE: readonly Person[] = [
  {
    label: { en: 'children', hi: 'बच्चे' },
    asked: /\b(kids?|child(ren)?|son|daughter|baby|toddler)\b|बच्च|बेटा|बेटी/i,
  },
  {
    label: { en: 'father', hi: 'पिता' },
    asked: /\b(father|dad|papa)\b|पिता|पापा|पिताजी/i,
  },
  {
    label: { en: 'mother', hi: 'माँ' },
    asked: /\b(mother|mom|mum|mummy)\b|माँ|मम्मी|माता/i,
  },
  {
    label: { en: 'grandparents', hi: 'दादा-दादी या नाना-नानी' },
    asked: new RegExp(
      String.raw`\b(grand(pa|ma|father|mother|parents?)|elderly|old(er)? (man|woman|people))\b|` +
        'दादा|दादी|नाना|नानी|बुज़ुर्ग|बुजुर्ग',
      'i',
    ),
  },
  {
    label: { en: 'pregnant family member', hi: 'गर्भवती' },
    asked: /\bpregnan|गर्भवती/i,
  },
];

/** The people a question asks about, in a fixed order. */
export function askedPeople(question: string): Person[] {
  return PEOPLE.filter((p) => p.asked.test(question));
}

/**
 * A CONTEXT line naming everyone the question is about, so the answer covers each of them. A single person is named
 * only in a follow-up, where the subject can change from the earlier question ("And what about my father?").
 */
export function askedPeopleFact(question: string, lang: Lang, followUp = false): string[] {
  const people = askedPeople(question);
  if (people.length === 0 || (people.length === 1 && !followUp)) return [];
  const names = people.map((p) => p.label[lang]).join(', ');
  return people.length === 1
    ? [`Person asked about: ${names}. Name them in the answer.`]
    : [`People asked about: ${names}. Answer for each of them by name.`];
}
