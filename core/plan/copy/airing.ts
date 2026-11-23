/** User-facing copy for airing the house: when to open the windows, and when to keep them shut. */
import { bilingual, type Text } from '../../copy/text.js';
import type { TipCopy } from './types.js';

export const BEFORE_TRAP = bilingual(' This is before the smog trap sets in.', ' यह स्मॉग जाल शुरू होने से पहले का समय है।');
export const AFTER_TRAP = bilingual(' This is after the smog trap lifts.', ' यह स्मॉग जाल हटने के बाद का समय है।');
export const LET_IN_SCOPE = bilingual('in the air you let in', 'अंदर आने वाली हवा में');

export const GAS_COOKING = bilingual(
  ' Always open a window while cooking on gas: the flame adds nitrogen dioxide and CO₂ that build up without fresh air.',
  ' गैस पर खाना बनाते समय खिड़की ज़रूर खोलें: लौ से नाइट्रोजन डाइऑक्साइड और CO₂ बनती है, जो ताज़ी हवा के बिना जमा होती है।',
);
export const OTHER_COOKING = bilingual(' Open a window while cooking, too.', ' खाना बनाते समय भी खिड़की खोलें।');

export interface AiringFigures {
  bestPm25: string;
  avg: string;
  cut: number;
}

export const normalAiringCopy = (when: Text, cooking: Text, figures: AiringFigures): TipCopy => ({
  title: bilingual(`Air the house as usual, ideally ${when.en}`, `घर में रोज़ की तरह हवा आने दें, हो सके तो ${when.hi}`),
  detail: bilingual(
    `Outdoor air is at most Moderate today, so open the windows wide as usual.${cooking.en}`,
    `आज बाहर की हवा ज़्यादा से ज़्यादा ‘मध्यम’ है, इसलिए खिड़कियाँ रोज़ की तरह पूरी खोलें।${cooking.hi}`,
  ),
  explanation: bilingual(
    `Outdoor PM2.5 averages ≈ ${figures.bestPm25} µg/m³ in this window vs ≈ ${figures.avg} µg/m³ over the day, so the air you let in then is ${figures.cut}% cleaner. Airing clears CO₂, moisture and cooking fumes.`,
    `इस समय बाहर का PM2.5 औसतन ≈ ${figures.bestPm25} µg/m³ है, जबकि दिन का औसत ≈ ${figures.avg} µg/m³, यानी तब अंदर आने वाली हवा ${figures.cut}% साफ़। हवा आने से CO₂, नमी और खाने का धुआँ निकलता है।`,
  ),
});

export const wideAiringCopy = (when: Text, order: Text, figures: AiringFigures): TipCopy => ({
  title: bilingual(`Air the house only ${when.en}`, `घर में हवा सिर्फ़ ${when.hi} आने दें`),
  detail: bilingual(
    `Open windows wide for 10–15 minutes so stale air and moisture leave, then shut them again.${order.en} Seal big gaps with a wet towel or tape on very bad days.`,
    `खिड़कियाँ 10–15 मिनट पूरी खोलें ताकि बासी हवा और नमी निकल जाए, फिर बंद कर दें।${order.hi} बहुत खराब दिनों में बड़ी दरारें गीले तौलिये या टेप से बंद करें।`,
  ),
  explanation: bilingual(
    `Outdoor PM2.5 averages ≈ ${figures.bestPm25} µg/m³ in this window vs ≈ ${figures.avg} µg/m³ over the day, so the air you let in is ${figures.cut}% cleaner. A short airing clears CO₂ and moisture from breathing and cooking.`,
    `इस समय बाहर का PM2.5 औसतन ≈ ${figures.bestPm25} µg/m³ है, जबकि दिन का औसत ≈ ${figures.avg} µg/m³, यानी अंदर आने वाली हवा ${figures.cut}% साफ़। थोड़ी देर हवा आने से साँस और खाने की CO₂ और नमी निकलती है।`,
  ),
});

export const ONCE_TRAP_LIFTS = bilingual('once the smog trap lifts', 'स्मॉग जाल हटने के बाद');
export const WARMEST_HOURS = bilingual(
  'in the warmest part of the afternoon, when the air mixes most',
  'दोपहर में सबसे गर्म समय पर, जब हवा सबसे ज़्यादा मिलती है',
);

export const stillDirtierNote = (bestPm25: string, indoor: string): Text =>
  bilingual(
    ` Even then outdoor PM2.5 ≈ ${bestPm25} µg/m³ is above the ≈ ${indoor} µg/m³ indoors with windows shut, so the airing is for fresh air and moisture, not cleaner air.`,
    ` तब भी बाहर का PM2.5 ≈ ${bestPm25} µg/m³ बंद खिड़कियों वाले अंदर के ≈ ${indoor} µg/m³ से ज़्यादा है, इसलिए यह हवा ताज़गी और नमी के लिए है, साफ़ हवा के लिए नहीं।`,
  );

const WHY_SHUT = {
  best: bilingual(
    'Outdoor air stays dirtier than the air indoors even at its least polluted',
    'सबसे कम प्रदूषित समय में भी बाहर की हवा अंदर से ज़्यादा गंदी है',
  ),
  none: bilingual('The forecast has no clean window', 'पूर्वानुमान में कोई साफ़ समय नहीं है'),
} as const;

/** `when` is the brief airing's time, `order` its place against the trap; `hasBest` when a cleanest window exists. */
interface KeepShut {
  when: Text;
  order: Text;
  hasBest: boolean;
}

export const keepShutCopy = ({ when, order, hasBest }: KeepShut): Omit<TipCopy, 'explanation'> => {
  const why = WHY_SHUT[hasBest ? 'best' : 'none'];
  return {
    title: bilingual(`Keep windows shut; air out briefly ${when.en}`, `खिड़कियाँ बंद रखें; ${when.hi} थोड़ी देर हवा आने दें`),
    detail: bilingual(
      `${why.en}, so keep windows shut. For fresh air and moisture, give the house a brief 5–10 minute airing ${when.en}, then shut them again.${order.en}`,
      `${why.hi}, इसलिए खिड़कियाँ बंद रखें। ताज़ी हवा और नमी निकालने के लिए ${when.hi} सिर्फ़ 5–10 मिनट हवा आने दें, फिर बंद कर दें।${order.hi}`,
    ),
  };
};
