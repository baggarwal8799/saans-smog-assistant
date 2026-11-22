/**
 * US EPA activity guidance for a question about going outdoors, computed here instead of left to the model: the
 * model receives the verdict as a fact in EPA's own words, and the server opens a yes/no answer with the verdict's
 * reply, whatever the model said. A mask never turns an "avoid" into a "yes". Pure.
 */
import { aqiLevel } from './aqi.js';
import { askedPeople } from './askedPeople.js';
import { asciiDigits, askedTimes, forecastAt } from './askedTimes.js';
import { EPA_BANDS, epaActivity, epaVerdict, type Verdict } from './epa.js';
import { CHILD_MASK_NOTE } from './plan/copy/masks.js';
import type { AirReport, Lang, Profile } from './types.js';
import type { EpaReply } from './contract.js';

export { EPA_BANDS, epaVerdict, type Verdict };

/**
 * Words that make a question about being outdoors or active outside: "park", "jog", "बाहर", "टहल". A bare "run"
 * is left out because it is also a verb for machines: "should I run the air purifier?" is not about going out.
 */
const OUTDOOR = new RegExp(
  String.raw`\b(outside|outdoors?|park|play|walk|go for a run|running|jog|cycle|bike|school|bus stop|stroll|` +
    String.raw`cricket|football|exercise|sport)\b` +
    '|बाहर|पार्क|खेल|टहल|सैर|दौड़|स्कूल|व्यायाम',
  'i',
);
/**
 * Words that ask whether, or when, to do something ("can", "safe", "कब", "ठीक"). An outdoor word alone is not a
 * question about going out: "a poem about cricket" gets no activity verdict.
 */
const ASK = new RegExp(
  String.raw`\b(can|could|should|may|safe|ok|okay|fine|allowed|when|good time|what about|how about)\b` +
    '|सकत|सुरक्षित|ठीक|चाहिए|कब|क्या',
  'i',
);

/** True when the question asks whether, or when, to do an outdoor activity: only then is a verdict made. */
export const asksOutdoor = (question: string): boolean => {
  if (!OUTDOOR.test(question)) return false;
  // A bare "?" asks about doing it only when a person or a time is named: "my father, morning walk at 7?" does,
  // "Who won the football match?" does not.
  const aboutSomeone = question.includes('?') && (askedPeople(question).length > 0 || askedTimes(question).length > 0);
  return ASK.test(question) || aboutSomeone;
};

/**
 * US EPA sensitive groups for particle pollution, as a question or profile names them: children, teens, adults 65+,
 * pregnancy, and lung or heart disease. A condition or age said in the question counts, not only the profile.
 */
const SENSITIVE = {
  people: new Set(['children', 'grandparents', 'pregnant family member']),
  /** Named parents count when the household has an older adult. */
  parents: new Set(['father', 'mother']),
  condition: new RegExp(
    [
      String.raw`\b(?:asthma\w*|copd|bronchitis|emphysema|`,
      String.raw`(?:lung|heart|cardiac|respiratory) (?:disease|condition|problem|issue)s?|`,
      String.raw`breathing (?:trouble|problem|difficult)\w*)\b|`,
      String.raw`(?<![\p{L}\p{M}])`,
      String.raw`(?:अस्थमा|दमा|दिल|हृदय|फेफड़[\p{L}\p{M}]*|सा[ँं]स की (?:तकलीफ़?|बीमारी))(?![\p{L}\p{M}])`,
    ]
      .join('')
      .normalize('NFC'),
    'iu',
  ),
  /** "70-year-old", "aged 70", "he is 70", "70 साल": the age is group 1 or 2. */
  age: new RegExp(
    String.raw`(\d{1,3})(?:[-\s]?(?:years?|yrs?)[-\s]?old|\s*(?:साल|वर्ष)(?!\s*से))` +
      String.raw`|\b(?:aged?|(?:he|she)(?:'s| is))\s+(\d{1,3})\b(?![:.]\d|\s*[ap]\.?m)`,
    'giu',
  ),
};
const sensitiveAge = (age: number): boolean => age < 18 || (age >= 65 && age <= 120);

/** True when the question itself names a health condition or a sensitive age: then it applies to everyone named. */
function cuedSensitive(question: string): boolean {
  const q = asciiDigits(question);
  return SENSITIVE.condition.test(q) || [...q.matchAll(SENSITIVE.age)].some((m) => sensitiveAge(Number(m[1] ?? m[2])));
}

/** The CONTEXT line for the current band, naming the household's sensitive members; empty for Good air. */
export function bandGuidance(aqi: number, profile: Profile): string {
  const { name, range, caution } = EPA_BANDS[aqiLevel(aqi)];
  if (!caution) return '';
  const who = [
    profile.hasChildren && 'children',
    profile.hasElderly && 'older adults',
    profile.hasRespiratory && 'someone with a heart or lung condition',
  ].filter(Boolean);
  const note =
    who.length > 0
      ? ` This household has ${who.join(', ')} (US EPA sensitive groups): say what this means for them.`
      : '';
  return `US EPA guidance for ${name} air (US AQI ${range}): ${caution}.${note}`;
}

/**
 * US EPA's own activity words for one group at one band, so the model is handed the exact strength of the advice:
 * "avoid all physical activity" only where EPA says it, "prolonged or heavy exertion" everywhere else.
 */
export const EPA_ACTION = {
  reduce: 'reduce prolonged or heavy exertion outdoors',
  avoidHeavy: 'avoid prolonged or heavy exertion outdoors',
  avoidAll: 'avoid all physical activity outdoors',
} as const;
// The same mask note the plan's N95 tip uses, so the plan and the assistant never disagree about children.
const AVOID_NOTE = `; move it indoors or to an hour listed as fit for outdoor activity (a mask does not make it safe; ${CHILD_MASK_NOTE.en})`;

/**
 * A gentle walk or stroll, with no harder activity named. The answer stays EPA's "avoid prolonged or heavy
 * exertion" (so the plain reply is still "no"), but it carries the plan's own words for a trip that cannot wait,
 * "short and gentle", so the assistant and the plan say the same thing.
 */
const GENTLE = /\b(walk|stroll)|टहल|सैर/i;
const HARD = /\b(run|jog|play|cricket|football|exercise|sport|cycle|bike|gym)|दौड़|खेल|व्यायाम/i;
const isGentle = (question: string): boolean => GENTLE.test(question) && !HARD.test(question);

function advice(aqi: number, sensitive: boolean, gentle: boolean): string {
  const level = epaActivity(aqiLevel(aqi), sensitive);
  if (level === 'fine') return 'outdoor activity is fine';
  if (level === 'reduce') return `${EPA_ACTION.reduce}, with more breaks`;
  if (level === 'avoid' && gentle)
    return `${EPA_ACTION.avoidHeavy}; if a short trip out cannot wait, keep it gentle${AVOID_NOTE}`;
  return `${level === 'avoidAll' ? EPA_ACTION.avoidAll : EPA_ACTION.avoidHeavy}${AVOID_NOTE}`;
}

/**
 * The one yes/no word table: the verdict's reply below, and the reply word the server opens an answer with
 * (api/_lib/answer.ts), so the CONTEXT and the rendered answer always use the same word.
 */
export const YES_NO: Readonly<Record<Lang, Record<EpaReply, string>>> = {
  en: { yes: 'Yes', no: 'No' },
  hi: { yes: 'हाँ', no: 'नहीं' },
};

/** The one-word reply a yes/no question gets for each verdict, so the model copies it instead of hedging. */
const REPLY: Readonly<Record<Lang, Record<Verdict, string>>> = {
  en: { fine: YES_NO.en.yes, reduce: 'Only briefly and gently', avoid: YES_NO.en.no },
  hi: { fine: YES_NO.hi.yes, reduce: 'सिर्फ़ थोड़ी देर और हल्का', avoid: YES_NO.hi.no },
};

export interface OutdoorFacts {
  lines: string[];
  /**
   * "no" when anyone asked about should avoid the activity at any asked time, "yes" when it is fine for everyone;
   * absent when the verdict is only "reduce", which is not a plain yes or no.
   */
  reply?: EpaReply;
}

/** Each person a question asks about (or "the person asking"), and whether they are in an EPA sensitive group. */
export function peopleAsked(question: string, profile: Profile): { who: string; sensitive: boolean }[] {
  // Who has the household's heart or lung condition is not known, so every named person is treated as having it.
  const cued = cuedSensitive(question) || profile.hasRespiratory;
  const sensitive = (who: string): boolean =>
    cued || SENSITIVE.people.has(who) || (profile.hasElderly && SENSITIVE.parents.has(who));
  const named = askedPeople(question).map((p) => ({ who: p.label.en, sensitive: sensitive(p.label.en) }));
  // The person asking is an adult of unknown health: the household's children or elders do not make them sensitive.
  return named.length > 0 ? named : [{ who: 'the person asking', sensitive: cued }];
}

/** Verdict lines for each person and time a question asks about; nothing when it does not ask about going outdoors. */
export function outdoorFacts(question: string, report: AirReport, profile: Profile, lang: Lang = 'en'): OutdoorFacts {
  if (!asksOutdoor(question)) return { lines: [] };
  const verdicts = new Set<Verdict>();
  const people = peopleAsked(question, profile);
  const gentle = isGentle(question);
  const times = askedTimes(question);
  // A part of the day is judged at its worst hour: conservative, as health advice should be.
  const at =
    times.length > 0
      ? times.map((t) => ({
          label: `${t.hours.length > 1 ? 'in the' : 'at'} ${t.label}`,
          aqi: forecastAt(t, report).worst?.usAqi ?? report.current.usAqi,
        }))
      : [{ label: 'now', aqi: report.current.usAqi }];
  const lines = at.map(({ label, aqi }) => {
    const each = people.map(({ who, sensitive }) => {
      verdicts.add(epaVerdict(aqi, sensitive));
      return `${who}: ${advice(aqi, sensitive, gentle)}`;
    });
    const reply = people.map(({ who, sensitive }) => `${who}: ${REPLY[lang][epaVerdict(aqi, sensitive)]}`).join('; ');
    const guidance = `US EPA activity guidance ${label} (US AQI ≈ ${Math.round(aqi)}): ${each.join('; ')}.`;
    return `${guidance} The yes/no answer for each: ${reply}.`;
  });
  // Conservative, as health advice should be: one "avoid" anywhere makes the plain answer "no".
  if (verdicts.has('avoid')) return { lines, reply: 'no' };
  return verdicts.has('reduce') ? { lines } : { lines, reply: 'yes' };
}
