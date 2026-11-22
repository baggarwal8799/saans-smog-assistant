/**
 * The medical-safety line is added by code, not left to the model: a check can remove text but cannot add a line the
 * model forgot. When the household or the user's own words involve a heart or lung condition, asthma or symptoms,
 * this fixed sentence goes after the answer (answer.ts renderAnswer), in the answer's language.
 */
import type { AssistantLang, AssistantRequest } from './contract.js';

export const MEDICAL_LINE: Record<AssistantLang, string> = {
  en: 'If anyone has trouble breathing, chest pain, confusion or bluish lips, get medical help at once.',
  hi: 'अगर किसी को साँस लेने में तकलीफ़, सीने में दर्द, घबराहट या होंठ नीले पड़ें, तो तुरंत डॉक्टर की मदद लें।'.normalize('NFC'),
};

/** Whole words, or word starts where a term ends in "*". Lower case; matched on NFC text. */
const TERMS = [
  'asthma*', 'copd', 'bronch*', 'wheez*', 'cough*', 'breathless*', 'short of breath', 'shortness of breath',
  'trouble breathing', 'difficulty breathing', 'breathing problem*', 'inhaler*', 'chest', 'heart', 'lung*',
  'symptom*', 'sick', 'unwell', 'fever*', 'dizz*', 'allerg*', 'sore throat', 'headache*',
  'दमा', 'अस्थमा', 'खाँसी', 'खांसी', 'साँस फूल*', 'सांस फूल*', 'साँस लेने में', 'सांस लेने में', 'घरघराहट', 'इनहेलर',
  'सीने', 'सीना', 'दिल', 'हृदय', 'फेफड़*', 'बीमार*', 'लक्षण', 'एलर्जी', 'बुखार', 'चक्कर',
];

const LETTER = String.raw`[\p{L}\p{M}]`;
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CONDITION = new RegExp(
  TERMS.map((term) => term.normalize('NFC'))
    // "asthma*" → (?<!letter)asthma; "chest" → (?<!letter)chest(?!letter)
    .map((t) => `(?<!${LETTER})${t.endsWith('*') ? escape(t.slice(0, -1)) : `${escape(t)}(?!${LETTER})`}`)
    .join('|'),
  'iu',
);

/**
 * Signs of a breathing emergency happening now ("wheezing badly", "can't breathe", "साँस नहीं ले पा"). The answer
 * then opens with the get-help line and gives no yes/no word, whatever the question's grammar.
 */
const URGENT = /wheez|can(?:'|’)?t breathe|cannot breathe|struggling to breathe|short(?:ness)? of breath|chest pain|bluish|blue lips|faint|साँस नहीं|सांस नहीं|साँस फूल|सांस फूल|सीने में दर्द/iu;
export const isUrgent = (req: AssistantRequest): boolean => req.mode === 'question' && URGENT.test(req.question.normalize('NFC'));

/** True when the household has a heart or lung condition, or the question or an earlier one mentions one. */
export function needsMedicalLine(req: AssistantRequest): boolean {
  const said = req.mode === 'question' ? [req.question, ...req.history] : [];
  return req.profile.hasRespiratory || said.some((s) => CONDITION.test(s.normalize('NFC')));
}

/**
 * Further fixed safety lines, each added when the user's own words raise its topic, because models leave them out:
 * a "No" to "can we sleep with the coal angithi lit?" may never say carbon monoxide, and an asthma follow-up may
 * give no inhaler advice.
 */
interface SafetyNote {
  topic: RegExp;
  line: Record<AssistantLang, string>;
}

const SAFETY_NOTES: readonly SafetyNote[] = [
  {
    // Fuel burnt indoors: "coal angithi", "gas heater", "fireplace", "अंगीठी", "हीटर".
    topic: new RegExp(
      String.raw`angithi|anghithi|brazier|charcoal|\bcoal\b|\bwood\b|fire ?place|bonfire|gas heater|kerosene heater|`
        + 'heater|sigri|अंगीठी|अँगीठी|कोयला|कोयले|लकड़ी|हीटर|सिगड़ी',
      'iu',
    ),
    line: {
      en: 'Burning fuel in a closed room can build up carbon monoxide, which has no smell and can kill in sleep: never sleep with it lit, and keep a window slightly open while it burns.',
      hi: 'बंद कमरे में ईंधन जलाने से कार्बन मोनोऑक्साइड जमा हो सकती है, जिसकी कोई गंध नहीं होती और जो नींद में जान ले सकती है: जलती आग के साथ कभी न सोएँ, और जलते समय खिड़की थोड़ी खुली रखें।'.normalize('NFC'),
    },
  },
  {
    topic: /asthma|copd|inhaler|wheez|दमा|अस्थमा|इनहेलर|घरघराहट/iu,
    line: {
      en: 'Anyone with asthma should keep their reliever inhaler with them and follow the action plan their doctor gave them.',
      hi: 'अस्थमा वाले अपना इनहेलर साथ रखें और डॉक्टर की बताई योजना मानें।'.normalize('NFC'),
    },
  },
];

/** The fixed lines this request needs, in order: topic notes first, the medical line last. */
export function safetyLines(req: AssistantRequest): string[] {
  const said = (req.mode === 'question' ? [req.question, ...req.history] : []).map((s) => s.normalize('NFC'));
  const notes = SAFETY_NOTES.filter((n) => said.some((s) => n.topic.test(s))).map((n) => n.line[req.lang]);
  if (isUrgent(req)) return [MEDICAL_LINE[req.lang], ...notes];
  return needsMedicalLine(req) ? [...notes, MEDICAL_LINE[req.lang]] : notes;
}
