/** Health and indoor-fuel words: the sensitive-group fact, the medical-safety line and the topic notes. */
import type { Words } from './words.js';

const ORGANS = ['lung', 'heart', 'cardiac', 'respiratory'];
const ILLNESSES = ['disease', 'condition', 'problem', 'issue'].flatMap((w) => [w, `${w}s`]);

/** Lung or heart disease, which puts a person in a US EPA sensitive group. */
export const SENSITIVE_CONDITIONS: readonly Words[] = [
  {
    edge: 'word',
    words: ['copd', 'bronchitis', 'emphysema', ...ORGANS.flatMap((o) => ILLNESSES.map((i) => `${o} ${i}`))],
  },
  {
    edge: 'word',
    prefix: true,
    words: ['asthma', 'breathing trouble', 'breathing problem', 'breathing difficult'],
  },
  {
    edge: 'letter',
    words: [
      'अस्थमा',
      'दमा',
      'दिल',
      'हृदय',
      'साँस की तकलीफ',
      'साँस की तकलीफ़',
      'साँस की बीमारी',
      'सांस की तकलीफ',
      'सांस की तकलीफ़',
      'सांस की बीमारी',
    ],
  },
  { edge: 'letter', prefix: true, words: ['फेफड़'] },
];

/** Health words that call for the medical-safety line: conditions, symptoms and medicines. */
export const HEALTH_WORDS: readonly Words[] = [
  {
    edge: 'letter',
    words: [
      'copd',
      'short of breath',
      'shortness of breath',
      'trouble breathing',
      'difficulty breathing',
      'chest',
      'heart',
      'sick',
      'unwell',
      'sore throat',
      'दमा',
      'अस्थमा',
      'खाँसी',
      'खांसी',
      'साँस लेने में',
      'सांस लेने में',
      'घरघराहट',
      'इनहेलर',
      'सीने',
      'सीना',
      'दिल',
      'हृदय',
      'लक्षण',
      'एलर्जी',
      'बुखार',
      'चक्कर',
    ],
  },
  {
    edge: 'letter',
    prefix: true,
    words: [
      'asthma',
      'bronch',
      'wheez',
      'cough',
      'breathless',
      'breathing problem',
      'inhaler',
      'lung',
      'symptom',
      'fever',
      'dizz',
      'allerg',
      'headache',
      'साँस फूल',
      'सांस फूल',
      'फेफड़',
      'बीमार',
    ],
  },
];

/** Signs of a breathing emergency happening now: "wheezing badly", "can't breathe", "साँस नहीं ले पा". */
export const URGENT_SIGNS: readonly Words[] = [
  {
    edge: 'anywhere',
    words: [
      'wheez',
      'cant breathe',
      "can't breathe",
      'can’t breathe',
      'cannot breathe',
      'struggling to breathe',
      'short of breath',
      'shortness of breath',
      'chest pain',
      'bluish',
      'blue lips',
      'faint',
      'साँस नहीं',
      'सांस नहीं',
      'साँस फूल',
      'सांस फूल',
      'सीने में दर्द',
    ],
  },
];

/** Asthma and its medicines, which call for the reliever-inhaler note. */
export const ASTHMA_WORDS: readonly Words[] = [
  { edge: 'anywhere', words: ['asthma', 'copd', 'inhaler', 'wheez', 'दमा', 'अस्थमा', 'इनहेलर', 'घरघराहट'] },
];

/** Fuel burnt indoors for heat, which calls for the carbon monoxide note: "coal angithi", "gas heater", "अंगीठी". */
export const INDOOR_FUELS: readonly Words[] = [
  { edge: 'word', words: ['coal', 'wood'] },
  {
    edge: 'anywhere',
    words: [
      'angithi',
      'anghithi',
      'brazier',
      'charcoal',
      'fireplace',
      'fire place',
      'bonfire',
      'gas heater',
      'kerosene heater',
      'heater',
      'sigri',
      'अंगीठी',
      'अँगीठी',
      'कोयला',
      'कोयले',
      'लकड़ी',
      'हीटर',
      'सिगड़ी',
    ],
  },
];
