/**
 * Script check for Hindi answers: models tend to mix Latin words and Urdu letters into Hindi, which many readers
 * cannot read. Acronyms and units stay Latin, as Hindi text writes them.
 */

/** "µg/m³" and "°C": units dropped before the text is split into words. */
const UNIT_TOKENS = /[µμ]g\/m³|°C/g;
const LATIN_UNITS = new Set(['km', 'kg', 'g', 'm', 'h', 'min', 'mg', 'ml', 'cm']);
/** PM2.5, AQI, US, N95, FFP2, CO₂, LPG, HEPA: acronyms and pollutant names stay Latin in Hindi text. */
export const ACRONYM = /^[A-Z][A-Z0-9.₀-₉²³+]*$/u;
/** Word breaks: spaces and punctuation in either script ("।", "॥", quotes, dashes, "/"). */
const WORD_BREAK = /[\s,;:!?()[\]"“”‘’'।॥•|…–—/-]+/u;

/** Words in a Hindi answer that are not Devanagari: other scripts, or Latin that is not an acronym or unit. */
export function nonDevanagariWords(answer: string): string[] {
  const bad = new Set<string>();
  const words = answer.normalize('NFC').replace(UNIT_TOKENS, ' ').split(WORD_BREAK);
  for (const raw of words) {
    const word = raw.replace(/^[.*]+|[.*]+$/g, ''); // "*smog." → "smog"
    let latin = false;
    let deva = false;
    let other = false;
    for (const ch of word) {
      if (!/\p{L}/u.test(ch)) continue;
      if (/\p{Script=Devanagari}/u.test(ch)) deva = true;
      else if (/\p{Script=Latin}/u.test(ch)) latin = true;
      else if (!/\p{Script=Common}/u.test(ch)) other = true;
    }
    const allowedLatin = ACRONYM.test(word) || LATIN_UNITS.has(word);
    if (other || (latin && (deva || !allowedLatin))) bad.add(word);
  }
  return [...bad];
}
