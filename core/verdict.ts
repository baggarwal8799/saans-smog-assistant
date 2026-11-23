/**
 * US EPA activity guidance for a question about going outdoors, computed here rather than left to the model; the
 * server opens a yes/no answer with the verdict's reply. A mask never turns an "avoid" into a "yes".
 */
import { aqiLevel } from './aqi.js';
import { askedPeople } from './askedPeople.js';
import { asciiDigits, type AskedTime, askedTimes, forecastAt } from './askedTimes.js';
import type { EpaReply } from './contract.js';
import { EPA_BANDS, epaActivity, epaVerdict, type Verdict } from './epa.js';
import { SENSITIVE_CONDITIONS } from './healthWords.js';
import type { AirReport, AqiLevel, Profile } from './types.js';
import { ASKING, compileWords, GENTLE_ACTIVITIES, HARD_ACTIVITIES, OUTDOOR_ACTIVITIES } from './words.js';

const OUTDOOR = compileWords(OUTDOOR_ACTIVITIES, 'i');
/** An outdoor word alone is not a question about going out: "a poem about cricket" gets no activity verdict. */
const ASK = compileWords(ASKING, 'i');

export const asksOutdoor = (question: string): boolean => {
  if (!OUTDOOR.test(question)) return false;
  // A bare "?" asks about doing it only when a person or a time is named: "my father, morning walk at 7?" does,
  // "Who won the football match?" does not.
  const aboutSomeone = question.includes('?') && (askedPeople(question).length > 0 || askedTimes(question).length > 0);
  return ASK.test(question) || aboutSomeone;
};

/** "70" in "70-year-old": up to three digits, read before the unit. */
const AGE_BEFORE = String.raw`(?<before>\d{1,3})`;
/** "-year-old", " yrs old", "years old". */
const YEARS_OLD = String.raw`[-\s]?(?:years?|yrs?)[-\s]?old`;
/** " साल", "वर्ष", but not "साल से", which is "for years". */
const SAAL = String.raw`\s*(?:साल|वर्ष)(?!\s*से)`;
/** "aged ", "age ", "she's ", "he is ". */
const AGED = String.raw`\b(?:aged?|(?:he|she)(?:'s| is))\s+`;
/** "9" in "she's 9": up to three digits, read after the lead word. */
const AGE_AFTER = String.raw`(?<after>\d{1,3})\b`;
/** Rules out "he is 7:30", "he is 7.5" and "he is 7 pm", which are not ages. */
const NOT_A_TIME = String.raw`(?![:.]\d|\s*[ap]\.?m)`;
/** "70-year-old", "5 yrs old", "70 साल". */
const AGE_THEN_UNIT = `${AGE_BEFORE}(?:${YEARS_OLD}|${SAAL})`;
/** "aged 70", "she's 9". */
const AGED_THEN_AGE = `${AGED}${AGE_AFTER}${NOT_A_TIME}`;
/** "my 70-year-old father", "she's 9"; not "for 70 years" or "70 साल से". */
const AGE = new RegExp(`${AGE_THEN_UNIT}|${AGED_THEN_AGE}`, 'giu');

/** US EPA sensitive groups for particle pollution; a condition or age said in the question counts too. */
const SENSITIVE = {
  people: new Set(['children', 'grandparents', 'pregnant family member']),
  /** Named parents count when the household has an older adult. */
  parents: new Set(['father', 'mother']),
  condition: compileWords(SENSITIVE_CONDITIONS),
  age: AGE,
};
const sensitiveAge = (age: number): boolean => age < 18 || (age >= 65 && age <= 120);

/** A condition or sensitive age in the question applies to everyone it names. */
function cuedSensitive(question: string): boolean {
  const text = asciiDigits(question);
  return (
    SENSITIVE.condition.test(text) ||
    [...text.matchAll(SENSITIVE.age)].some((m) => sensitiveAge(Number(m.groups?.before ?? m.groups?.after)))
  );
}

export type SensitiveMember = 'children' | 'olderAdults' | 'heartOrLung';

interface BandFact {
  level: AqiLevel;
  /** The household's members in US EPA sensitive groups. */
  members: SensitiveMember[];
}

/** Null for Good air, which carries no caution. */
export function bandFact(aqi: number, profile: Profile): BandFact | null {
  const level = aqiLevel(aqi);
  if (!EPA_BANDS[level].caution) return null;
  const flags: readonly [boolean, SensitiveMember][] = [
    [profile.hasChildren, 'children'],
    [profile.hasElderly, 'olderAdults'],
    [profile.hasRespiratory, 'heartOrLung'],
  ];
  return { level, members: flags.filter(([has]) => has).map(([, member]) => member) };
}

/** A walk with no harder activity named keeps EPA's "avoid", but carries the plan's "short and gentle" too. */
const GENTLE = compileWords(GENTLE_ACTIVITIES, 'i');
const HARD = compileWords(HARD_ACTIVITIES, 'i');
const isGentle = (question: string): boolean => GENTLE.test(question) && !HARD.test(question);

export type AdviceKind = 'fine' | 'reduce' | 'avoidGentle' | 'avoidHeavy' | 'avoidAll';

function adviceKind(aqi: number, { sensitive, gentle }: { sensitive: boolean; gentle: boolean }): AdviceKind {
  const level = epaActivity(aqiLevel(aqi), { sensitive });
  if (level === 'avoid') return gentle ? 'avoidGentle' : 'avoidHeavy';
  return level;
}

/** `who` is null for the person asking. */
interface PersonAsked {
  who: string | null;
  sensitive: boolean;
}

export function peopleAsked(question: string, profile: Profile): PersonAsked[] {
  // Who has the household's heart or lung condition is not known, so every named person is treated as having it.
  const cued = cuedSensitive(question) || profile.hasRespiratory;
  const sensitive = (who: string): boolean =>
    cued || SENSITIVE.people.has(who) || (profile.hasElderly && SENSITIVE.parents.has(who));
  const named = askedPeople(question).map((p) => ({ who: p.label.en, sensitive: sensitive(p.label.en) }));
  // The person asking is an adult of unknown health: the household's children or elders do not make them sensitive.
  return named.length > 0 ? named : [{ who: null, sensitive: cued }];
}

export interface PersonAdvice {
  who: string | null;
  advice: AdviceKind;
  verdict: Verdict;
}

export interface OutdoorMoment {
  /** Null for now. */
  time: AskedTime | null;
  aqi: number;
  people: PersonAdvice[];
}

interface OutdoorFacts {
  moments: OutdoorMoment[];
  /** Absent when the verdict is only "reduce", which is not a plain yes or no. */
  reply?: EpaReply;
}

export function outdoorFacts(question: string, report: AirReport, profile: Profile): OutdoorFacts {
  if (!asksOutdoor(question)) return { moments: [] };
  const people = peopleAsked(question, profile);
  const gentle = isGentle(question);
  const times = askedTimes(question);
  // A part of the day is judged at its worst hour: conservative, as health advice should be.
  const judgedAt: { time: AskedTime | null; aqi: number }[] =
    times.length > 0
      ? times.map((time) => ({ time, aqi: forecastAt(time, report).worst?.usAqi ?? report.current.usAqi }))
      : [{ time: null, aqi: report.current.usAqi }];
  const moments = judgedAt.map(({ time, aqi }) => ({
    time,
    aqi,
    people: people.map(({ who, sensitive }) => ({
      who,
      advice: adviceKind(aqi, { sensitive, gentle }),
      verdict: epaVerdict(aqi, { sensitive }),
    })),
  }));
  const verdicts = new Set(moments.flatMap((moment) => moment.people.map((person) => person.verdict)));
  // One "avoid" anywhere makes the plain answer "no".
  if (verdicts.has('avoid')) return { moments, reply: 'no' };
  return verdicts.has('reduce') ? { moments } : { moments, reply: 'yes' };
}
