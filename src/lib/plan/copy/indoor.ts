/** User-facing copy for the indoor rules (indoor.ts): airing, the DIY purifier and wet cleaning. */
import { bilingual, plural, type Text } from '../text.js';

export const NONE = bilingual('', '');
export const BEFORE_TRAP = bilingual(' This is before the smog trap sets in.', ' यह स्मॉग जाल शुरू होने से पहले का समय है।');
export const AFTER_TRAP = bilingual(' This is after the smog trap lifts.', ' यह स्मॉग जाल हटने के बाद का समय है।');
export const LET_IN_SCOPE = bilingual('in the air you let in', 'अंदर आने वाली हवा में');

export const GAS_COOKING = bilingual(
  ' Always open a window while cooking on gas: the flame adds nitrogen dioxide and CO₂ that build up without fresh air.',
  ' गैस पर खाना बनाते समय खिड़की ज़रूर खोलें: लौ से नाइट्रोजन डाइऑक्साइड और CO₂ बनती है, जो ताज़ी हवा के बिना जमा होती है।',
);
export const OTHER_COOKING = bilingual(' Open a window while cooking, too.', ' खाना बनाते समय भी खिड़की खोलें।');

/** The figures every airing explanation quotes. */
export interface AiringFigures {
  bestPm25: string;
  avg: string;
  cut: number;
}

/** The three texts every tip carries. */
export interface TipCopy {
  title: Text;
  detail: Text;
  explanation: Text;
}

export const normalAiringCopy = (when: Text, cooking: Text, f: AiringFigures): TipCopy => ({
  title: bilingual(`Air the house as usual, ideally ${when.en}`, `घर में रोज़ की तरह हवा आने दें, हो सके तो ${when.hi}`),
  detail: bilingual(
    `Outdoor air is at most Moderate today, so open the windows wide as usual.${cooking.en}`,
    `आज बाहर की हवा ज़्यादा से ज़्यादा ‘मध्यम’ है, इसलिए खिड़कियाँ रोज़ की तरह पूरी खोलें।${cooking.hi}`,
  ),
  explanation: bilingual(
    `Outdoor PM2.5 averages ≈ ${f.bestPm25} µg/m³ in this window vs ≈ ${f.avg} µg/m³ over the day, ` +
      `so the air you let in then is ${f.cut}% cleaner. Airing clears CO₂, moisture and cooking fumes.`,
    `इस समय बाहर का PM2.5 औसतन ≈ ${f.bestPm25} µg/m³ है, जबकि दिन का औसत ≈ ${f.avg} µg/m³, ` +
      `यानी तब अंदर आने वाली हवा ${f.cut}% साफ़। हवा आने से CO₂, नमी और खाने का धुआँ निकलता है।`,
  ),
});

export const wideAiringCopy = (when: Text, order: Text, f: AiringFigures): TipCopy => ({
  title: bilingual(`Air the house only ${when.en}`, `घर में हवा सिर्फ़ ${when.hi} आने दें`),
  detail: bilingual(
    `Open windows wide for 10–15 minutes so stale air and moisture leave, then shut them again.${order.en} ` +
      'Seal big gaps with a wet towel or tape on very bad days.',
    `खिड़कियाँ 10–15 मिनट पूरी खोलें ताकि बासी हवा और नमी निकल जाए, फिर बंद कर दें।${order.hi} ` +
      'बहुत खराब दिनों में बड़ी दरारें गीले तौलिये या टेप से बंद करें।',
  ),
  explanation: bilingual(
    `Outdoor PM2.5 averages ≈ ${f.bestPm25} µg/m³ in this window vs ≈ ${f.avg} µg/m³ over the day, ` +
      `so the air you let in is ${f.cut}% cleaner. A short airing clears CO₂ and moisture from breathing and cooking.`,
    `इस समय बाहर का PM2.5 औसतन ≈ ${f.bestPm25} µg/m³ है, जबकि दिन का औसत ≈ ${f.avg} µg/m³, ` +
      `यानी अंदर आने वाली हवा ${f.cut}% साफ़। थोड़ी देर हवा आने से साँस और खाने की CO₂ और नमी निकलती है।`,
  ),
});

export const ONCE_TRAP_LIFTS = bilingual('once the smog trap lifts', 'स्मॉग जाल हटने के बाद');
export const WARMEST_HOURS = bilingual(
  'in the warmest part of the afternoon, when the air mixes most',
  'दोपहर में सबसे गर्म समय पर, जब हवा सबसे ज़्यादा मिलती है',
);

export const stillDirtierNote = (bestPm25: string, indoor: string): Text =>
  bilingual(
    ` Even then outdoor PM2.5 ≈ ${bestPm25} µg/m³ is above the ≈ ${indoor} µg/m³ indoors with windows shut, ` +
      'so the airing is for fresh air and moisture, not cleaner air.',
    ` तब भी बाहर का PM2.5 ≈ ${bestPm25} µg/m³ बंद खिड़कियों वाले अंदर के ≈ ${indoor} µg/m³ से ज़्यादा है, ` +
      'इसलिए यह हवा ताज़गी और नमी के लिए है, साफ़ हवा के लिए नहीं।',
  );

const WHY_SHUT = {
  best: bilingual(
    'Outdoor air stays dirtier than the air indoors even at its least polluted',
    'सबसे कम प्रदूषित समय में भी बाहर की हवा अंदर से ज़्यादा गंदी है',
  ),
  none: bilingual('The forecast has no clean window', 'पूर्वानुमान में कोई साफ़ समय नहीं है'),
} as const;

export const keepShutCopy = (when: Text, order: Text, hasBest: boolean): Omit<TipCopy, 'explanation'> => {
  const why = WHY_SHUT[hasBest ? 'best' : 'none'];
  return {
    title: bilingual(`Keep windows shut; air out briefly ${when.en}`, `खिड़कियाँ बंद रखें; ${when.hi} थोड़ी देर हवा आने दें`),
    detail: bilingual(
      `${why.en}, so keep windows shut. For fresh air and moisture, give the house a brief 5–10 minute airing ` +
        `${when.en}, then shut them again.${order.en}`,
      `${why.hi}, इसलिए खिड़कियाँ बंद रखें। ताज़ी हवा और नमी निकालने के लिए ${when.hi} सिर्फ़ 5–10 मिनट हवा आने दें, ` +
        `फिर बंद कर दें।${order.hi}`,
    ),
  };
};

const UNIT_FORMS = { en: ['unit', 'units'], hi: ['यूनिट', 'यूनिट'] } as const;
export const coverageCopy = (who: Text, perRoom: number, rooms: number): Text => {
  const units = plural(rooms, UNIT_FORMS);
  return bilingual(
    ` One unit cleans one closed room: ${who.en} ÷ ${perRoom} per bedroom ≈ ${units.en}.`,
    ` एक यूनिट एक बंद कमरा साफ़ करती है: ${who.hi} ÷ ${perRoom} प्रति कमरा ≈ ${units.hi}।`,
  );
};

/** Percentages and µg/m³ figures for the DIY purifier working. */
export interface PurifierFigures {
  closedPct: string;
  diyPct: string;
  closedUg: string;
  diyUg: string;
  cut: number;
}

export const purifierCopy = (rooms: Text, f: PurifierFigures): TipCopy => ({
  title: bilingual('Build a DIY box-fan air purifier', 'घर पर बॉक्स-फ़ैन एयर प्यूरीफ़ायर बनाएँ'),
  detail: bilingual(
    'Tape a MERV-13 or HEPA-grade filter to the back of a box or table fan, with the airflow arrow pointing into ' +
      `the fan. It costs a fraction of a branded purifier. Run it in the room where you sleep.${rooms.en}`,
    'एक बॉक्स या टेबल फ़ैन के पीछे MERV-13 या HEPA-ग्रेड फ़िल्टर टेप करें, हवा का तीर फ़ैन की ओर रहे। ' +
      `यह ब्रांडेड प्यूरीफ़ायर से बहुत सस्ता है। जिस कमरे में सोते हैं, वहाँ चलाएँ।${rooms.hi}`,
  ),
  explanation: bilingual(
    `Tests of fan-filter units show indoor PM2.5 dropping from ≈ ${f.closedPct}% to ≈ ${f.diyPct}% of outside: ` +
      `here ≈ ${f.closedUg} → ${f.diyUg} µg/m³, ${f.cut}% less while you are home.`,
    `फ़ैन-फ़िल्टर के परीक्षणों में अंदर का PM2.5 बाहर के ≈ ${f.closedPct}% से ≈ ${f.diyPct}% तक घटता है: ` +
      `यहाँ ≈ ${f.closedUg} → ${f.diyUg} µg/m³, घर पर ${f.cut}% कम।`,
  ),
});

export const cleaningCopy = (pct: number): TipCopy & { scope: Text } => ({
  title: bilingual(
    'Wet-mop instead of sweeping; skip the “air-purifying plant” myth',
    'झाड़ू की जगह गीला पोंछा लगाएँ; “हवा साफ़ करने वाले पौधों” के भ्रम में न पड़ें',
  ),
  detail: bilingual(
    'Dry sweeping throws settled dust back into the air. Wipe surfaces with a damp cloth. ' +
      'Houseplants are nice, but you would need hundreds per room to match one purifier.',
    'सूखी झाड़ू जमी धूल को फिर हवा में उड़ा देती है। गीले कपड़े से सतह पोंछें। ' +
      'पौधे अच्छे हैं, पर एक प्यूरीफ़ायर जितना असर पाने के लिए हर कमरे में सैकड़ों पौधे चाहिए।',
  ),
  explanation: bilingual(
    `Dry sweeping lifts settled dust back into the air; we count ${pct}% less PM2.5 at home from damp cleaning. ` +
      'That is an assumed figure, kept low because sweeping mostly lifts coarser dust rather than fine particles. ' +
      'A 2019 review (Cummings & Waring) found plants clear indoor air 100–1000× slower than normal ventilation, ' +
      'so we give plants no impact.',
    `सूखी झाड़ू जमी धूल को फिर हवा में उड़ाती है; गीली सफ़ाई से हम घर पर PM2.5 में ${pct}% कमी मानते हैं। ` +
      'यह अनुमान है, जिसे कम रखा गया है क्योंकि झाड़ू से ज़्यादातर मोटी धूल उड़ती है, बारीक कण कम। ' +
      '2019 की समीक्षा (Cummings & Waring) में पौधे सामान्य वेंटिलेशन से 100–1000 गुना धीमे पाए गए, ' +
      'इसलिए हम पौधों का कोई असर नहीं गिनते।',
  ),
  scope: bilingual('from stirred-up dust', 'उड़ी धूल से'),
});
