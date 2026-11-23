/** The model must never produce a number of its own. The prompt asks for digits, so only digits are read. */
import { DIGITS_RULE, SYSTEM_INSTRUCTION } from './prompt.js';

/** Small counts ("2 h", "3 steps", "1 window") carry no claim worth grounding. */
const SAFE_SMALL = 3;

const CLOCK = /\b\d{1,2}:\d{2}\b/g;

/** Numbers that are names, clock times or years, never a quantity the model could invent. */
const NOT_QUANTITIES = [
  /(?<![A-Za-z])[A-Za-z]+\d+(?:\.\d+)?/g, // PM2.5, PM10, N95, FFP2, CO2 (starts only at a letter run's start)
  CLOCK,
  /\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?|o'clock)(?![a-z])/gi, // 7 am, 2 p.m., 6 o'clock
  /\d{1,2}\s*बजे/gu, // 7 बजे
  /\b(?:19|20)\d{2}\b/g, // years: 2026
];

/** Devanagari digits to ASCII ("२१०" → "210"), thousands separators dropped ("1,200" → "1200"). */
const normaliseNumbers = (text: string): string =>
  text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966)).replace(/(\d),(?=\d{3}(?!\d))/g, '$1');

const numbersIn = (text: string): number[] => (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Every number the model saw, plus the whole-number rounding of each decimal ("≈ 7.9" may be said as "about 8"). */
function groundedNumbers(context: string): Set<number> {
  // Clock times are allowed in any answer anyway, and plan list numbers ("2. Close the windows") are positions:
  // neither grounds a quantity.
  const all = numbersIn(
    normaliseNumbers(context)
      .replace(CLOCK, ' ')
      .replace(/^\d+\.\s/gm, ' '),
  );
  return new Set([...all, ...all.map(Math.round)]);
}

/** The system rules, without the digits rule: its example "7" is not a fact. */
const RULE_FACTS = SYSTEM_INSTRUCTION.replace(DIGITS_RULE, '');

/** The quantities in `answer` that neither CONTEXT nor the system rules contain. */
export function ungroundedNumbers(answer: string, context: string): number[] {
  // The system rules are part of what the model saw: "AQI 151 or higher" there is a fact, not an invention.
  const known = groundedNumbers(`${context}\n${RULE_FACTS}`);
  const text = NOT_QUANTITIES.reduce((t, re) => t.replace(re, ' '), normaliseNumbers(answer));
  const bad = numbersIn(text).filter((n) => !(Number.isInteger(n) && n <= SAFE_SMALL) && !known.has(n));
  return [...new Set(bad)];
}
