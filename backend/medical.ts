/** Safety lines are added by code, not left to the model: a check can remove text but cannot add a forgotten line. */
import type { AssistantRequest } from '../core/contract.js';
import { bilingual, type Text } from '../core/copy/text.js';
import { ASTHMA_WORDS, HEALTH_WORDS, INDOOR_FUELS, URGENT_SIGNS } from '../core/healthWords.js';
import { compileWords } from '../core/words.js';

// Prettier counts Devanagari vowel signs as zero width, so it would rejoin the Hindi into one line over 120.
// prettier-ignore
export const MEDICAL_LINE: Text = bilingual(
  'If anyone has trouble breathing, chest pain, confusion or bluish lips, get medical help at once.',
  (
    'अगर किसी को साँस लेने में तकलीफ़, सीने में दर्द, ' +
    'घबराहट या होंठ नीले पड़ें, तो तुरंत डॉक्टर की मदद लें।'
  ).normalize('NFC'),
);

const CONDITION = compileWords(HEALTH_WORDS);

/** A breathing emergency now: the answer opens with the get-help line and no yes/no word, whatever the grammar. */
const URGENT = compileWords(URGENT_SIGNS);
export const isUrgent = (req: AssistantRequest): boolean =>
  req.mode === 'question' && URGENT.test(req.question.normalize('NFC'));

export function needsMedicalLine(req: AssistantRequest): boolean {
  const said = req.mode === 'question' ? [req.question, ...req.history] : [];
  return req.profile.hasRespiratory || said.some((s) => CONDITION.test(s.normalize('NFC')));
}

/** Models leave these out: a "No" to "can we sleep with the coal angithi lit?" may never say carbon monoxide. */
interface SafetyNote {
  topic: RegExp;
  line: Text;
}

const SAFETY_NOTES: readonly SafetyNote[] = [
  {
    topic: compileWords(INDOOR_FUELS),
    line: bilingual(
      'Burning fuel in a closed room can build up carbon monoxide, which has no smell and can kill in sleep: ' +
        'never sleep with it lit, and keep a window slightly open while it burns.',
      (
        'बंद कमरे में ईंधन जलाने से कार्बन मोनोऑक्साइड जमा हो सकती है, जिसकी कोई गंध नहीं होती ' +
        'और जो नींद में जान ले सकती है: जलती आग के साथ कभी न सोएँ, और जलते समय खिड़की थोड़ी खुली रखें।'
      ).normalize('NFC'),
    ),
  },
  {
    topic: compileWords(ASTHMA_WORDS),
    line: bilingual(
      'Anyone with asthma should keep their reliever inhaler with them ' +
        'and follow the action plan their doctor gave them.',
      'अस्थमा वाले अपना इनहेलर साथ रखें और डॉक्टर की बताई योजना मानें।'.normalize('NFC'),
    ),
  },
];

export function safetyLines(req: AssistantRequest): string[] {
  const said = (req.mode === 'question' ? [req.question, ...req.history] : []).map((s) => s.normalize('NFC'));
  const notes = SAFETY_NOTES.filter((n) => said.some((s) => n.topic.test(s))).map((n) => n.line[req.lang]);
  if (isUrgent(req)) return [MEDICAL_LINE[req.lang], ...notes];
  return needsMedicalLine(req) ? [...notes, MEDICAL_LINE[req.lang]] : notes;
}
