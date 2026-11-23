/** Models mix Latin words and Urdu letters into Hindi, which many cannot read. Acronyms and units stay Latin. */

const UNIT_TOKENS = /[µμ]g\/m³|°C/g;
const LATIN_UNITS = new Set(['km', 'kg', 'g', 'm', 'h', 'min', 'mg', 'ml', 'cm']);
/** PM2.5, AQI, US, N95, FFP2, CO₂, LPG, HEPA: acronyms and pollutant names stay Latin in Hindi text. */
const ACRONYM = /^[A-Z][A-Z0-9.₀-₉²³+]*$/u;
const WORD_BREAK = /[\s,;:!?()[\]"“”‘’'।॥•|…–—/-]+/u;

/** Strips leading and trailing "." and "*" in linear time (a `[.*]+$` regex backtracks on long runs). */
function trimMarks(word: string): string {
  const mark = (ch: string | undefined): boolean => ch === '.' || ch === '*';
  let start = 0;
  let end = word.length;
  while (start < end && mark(word[start])) start++;
  while (end > start && mark(word[end - 1])) end--;
  return word.slice(start, end);
}

function scriptsOf(word: string): { latin: boolean; deva: boolean; other: boolean } {
  const found = { latin: false, deva: false, other: false };
  for (const ch of word) {
    if (!/\p{L}/u.test(ch)) continue;
    if (/\p{Script=Devanagari}/u.test(ch)) found.deva = true;
    else if (/\p{Script=Latin}/u.test(ch)) found.latin = true;
    else if (!/\p{Script=Common}/u.test(ch)) found.other = true;
  }
  return found;
}

/** Words in a Hindi answer that are not Devanagari: other scripts, or Latin that is not an acronym or unit. */
export function nonDevanagariWords(answer: string): string[] {
  const bad = new Set<string>();
  const words = answer.normalize('NFC').replace(UNIT_TOKENS, ' ').split(WORD_BREAK);
  for (const raw of words) {
    const word = trimMarks(raw); // "*smog." → "smog"
    const { latin, deva, other } = scriptsOf(word);
    const allowedLatin = ACRONYM.test(word) || LATIN_UNITS.has(word);
    if (other || (latin && (deva || !allowedLatin))) bad.add(word);
  }
  return [...bad];
}
