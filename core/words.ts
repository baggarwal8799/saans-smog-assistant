/**
 * The one format for the word lists the question readers match on, the one function that turns lists into a
 * pattern, and the activity lists. Lists differ on purpose: each one decides a different fact or line.
 */

/**
 * Where an entry may sit in the text: `word` between ASCII word boundaries (\b), `letter` with no letter or mark
 * beside it (\b does not see Devanagari letters), `anywhere` even inside a longer word.
 */
export type Edge = 'word' | 'letter' | 'anywhere';

/** Plain lower-case words. With `prefix`, an entry may also start a longer word: "cough" matches "coughing". */
export interface Words {
  readonly edge: Edge;
  readonly words: readonly string[];
  readonly prefix?: boolean;
}

const LETTER = String.raw`[\p{L}\p{M}]`;
const EDGES: Readonly<Record<Edge, readonly [start: string, end: string]>> = {
  word: [String.raw`\b`, String.raw`\b`],
  letter: [`(?<!${LETTER})`, `(?!${LETTER})`],
  anywhere: ['', ''],
};
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

function alternative({ edge, words, prefix = false }: Words): string {
  const [start, end] = EDGES[edge];
  // NFC, because every reader normalizes the text it tests the same way.
  return `${start}(?:${words.map((w) => escape(w.normalize('NFC'))).join('|')})${prefix ? '' : end}`;
}

/** One case-insensitive pattern matching any entry of the lists. A `letter` edge needs the `u` flag. */
export const compileWords = (lists: readonly Words[], flags: 'i' | 'iu' = 'iu'): RegExp =>
  new RegExp(lists.map(alternative).join('|'), flags);

/**
 * Being outdoors or active outside: "park", "jog", "बाहर", "टहल". A bare "run" is left out because it is also a verb
 * for machines: "should I run the air purifier?" is not about going out.
 */
export const OUTDOOR_ACTIVITIES: readonly Words[] = [
  {
    edge: 'word',
    words: [
      'outside',
      'outdoor',
      'outdoors',
      'park',
      'play',
      'walk',
      'go for a run',
      'running',
      'jog',
      'cycle',
      'bike',
      'school',
      'bus stop',
      'stroll',
      'cricket',
      'football',
      'exercise',
      'sport',
    ],
  },
  { edge: 'anywhere', words: ['बाहर', 'पार्क', 'खेल', 'टहल', 'सैर', 'दौड़', 'स्कूल', 'व्यायाम'] },
];

export const GENTLE_ACTIVITIES: readonly Words[] = [
  { edge: 'word', prefix: true, words: ['walk', 'stroll'] },
  { edge: 'anywhere', words: ['टहल', 'सैर'] },
];

/** Harder exertion, which makes a walk question no longer gentle. */
export const HARD_ACTIVITIES: readonly Words[] = [
  {
    edge: 'word',
    prefix: true,
    words: ['run', 'jog', 'play', 'cricket', 'football', 'exercise', 'sport', 'cycle', 'bike', 'gym'],
  },
  { edge: 'anywhere', words: ['दौड़', 'खेल', 'व्यायाम'] },
];

/** Words that ask whether, or when, to do something: "can", "safe", "कब", "ठीक". */
export const ASKING: readonly Words[] = [
  {
    edge: 'word',
    words: [
      'can',
      'could',
      'should',
      'may',
      'safe',
      'ok',
      'okay',
      'fine',
      'allowed',
      'when',
      'good time',
      'what about',
      'how about',
    ],
  },
  { edge: 'anywhere', words: ['सकत', 'सुरक्षित', 'ठीक', 'चाहिए', 'कब', 'क्या'] },
];
