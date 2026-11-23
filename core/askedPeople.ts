/**
 * Who a question is about ("my kids and my father"). The labels are fixed words, never the user's text, so they are
 * safe to state inside CONTEXT.
 */
import { bilingual, type Text } from './copy/text.js';

interface Person {
  /** How the person is named to the model. */
  label: Text;
  /** Words in a question that mean this person. */
  asked: RegExp;
}

const PEOPLE: readonly Person[] = [
  {
    label: bilingual('children', 'बच्चे'),
    asked: /\b(kids?|child(ren)?|son|daughter|baby|toddler)\b|बच्च|बेटा|बेटी/i,
  },
  {
    label: bilingual('father', 'पिता'),
    asked: /\b(father|dad|papa)\b|पिता|पापा|पिताजी/i,
  },
  {
    label: bilingual('mother', 'माँ'),
    asked: /\b(mother|mom|mum|mummy)\b|माँ|मम्मी|माता/i,
  },
  {
    label: bilingual('grandparents', 'दादा-दादी या नाना-नानी'),
    asked: new RegExp(
      String.raw`\b(grand(pa|ma|father|mother|parents?)|elderly|old(er)? (man|woman|people))\b|` +
        'दादा|दादी|नाना|नानी|बुज़ुर्ग|बुजुर्ग',
      'i',
    ),
  },
  {
    label: bilingual('pregnant family member', 'गर्भवती'),
    asked: /\bpregnan|गर्भवती/i,
  },
];

/** The people a question asks about, in a fixed order. */
export function askedPeople(question: string): Person[] {
  return PEOPLE.filter((p) => p.asked.test(question));
}
