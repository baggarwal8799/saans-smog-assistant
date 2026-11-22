/** Wording of the sensitive-groups tip (../vulnerable.ts). Every function takes computed values only. */
import type { Activity } from '../../epa.js';
import { bilingual, type Text } from '../text.js';

export type Level = Exclude<Activity, 'fine'>;
type Advice = { title: Text; detail: Text };
const EMPTY = bilingual('', '');

/** The EPA guide for sensitive groups at each level, in its own words. */
export const GUIDE: Readonly<Record<Level, Text>> = {
  reduce: bilingual(
    'sensitive groups should reduce prolonged or heavy exertion outdoors',
    'संवेदनशील लोगों को बाहर लंबी या ज़ोरदार मेहनत कम करनी चाहिए',
  ),
  avoid: bilingual(
    'sensitive groups should avoid prolonged or heavy exertion outdoors',
    'संवेदनशील लोगों को बाहर लंबी या ज़ोरदार मेहनत से बचना चाहिए',
  ),
  avoidAll: bilingual(
    'sensitive groups should avoid all physical activity outdoors',
    'संवेदनशील लोगों को बाहर हर तरह की शारीरिक गतिविधि से बचना चाहिए',
  ),
};

const WATCH = bilingual(' Watch for coughing or breathlessness.', ' खाँसी या साँस फूलने पर नज़र रखें।');
export const SCHOOL_RUNS = bilingual('school runs, ', 'स्कूल आना-जाना, ');
export const MEDS = bilingual(' Keep inhalers and medicines handy.', ' इनहेलर और दवाएँ पास रखें।');
export const SCOPE_INDOORS = bilingual('for them indoors', 'घर के अंदर उनके लिए');

export function reduceAdvice(who: Text, when: Text, part: Text, school: Text): Advice {
  const en = `This ${part.en} stretch has the most PM2.5 in the forecast. Outside it, keep ${school.en}walks and errands`;
  const hi = `पूर्वानुमान में ${part.hi} का यह समय सबसे ज़्यादा PM2.5 वाला है। इसके बाहर ${school.hi}सैर और काम`;
  return {
    title: bilingual(`Keep ${who.en} indoors ${when.en}`, `${when.hi} ${who.hi} को घर में रखें`),
    detail: bilingual(`${en} short and gentle.${WATCH.en}`, `${hi} थोड़ी देर और हल्के रखें।${WATCH.hi}`),
  };
}

export function avoidAdvice(who: Text, when: Text, part: Text, hasPeak: boolean): Advice {
  const peak = hasPeak
    ? bilingual(
        ` Keep them fully indoors ${when.en}, the ${part.en} peak.`,
        ` ${when.hi}, ${part.hi} के सबसे खराब समय में, उन्हें पूरी तरह घर में रखें।`,
      )
    : EMPTY;
  return {
    title: bilingual(
      `All day today: no long or hard outdoor activity for ${who.en}`,
      `आज दिन भर ${who.hi} को बाहर लंबी या ज़ोरदार गतिविधि न करने दें`,
    ),
    detail: bilingual(
      `Move their play, sport and long walks indoors, and keep any trip out short and gentle.${peak.en}${WATCH.en}`,
      `उनका खेल, कसरत और लंबी सैर घर के अंदर कराएँ, और बाहर का कोई भी काम छोटा और हल्का रखें।${peak.hi}${WATCH.hi}`,
    ),
  };
}

export function avoidAllAdvice(who: Text, when: Text, part: Text, hasPeak: boolean): Advice {
  const peak = hasPeak
    ? bilingual(` The air is worst ${when.en}, in the ${part.en}.`, ` हवा ${when.hi}, ${part.hi} में, सबसे खराब होगी।`)
    : EMPTY;
  return {
    title: bilingual(`Keep ${who.en} indoors all day today`, `आज दिन भर ${who.hi} को घर के अंदर रखें`),
    detail: bilingual(
      `No outdoor play, sport or walks for them today; keep them active indoors.${peak.en}${WATCH.en}`,
      `आज उन्हें बाहर न खेलने दें, न कसरत कराएँ, न सैर; घर में ही सक्रिय रखें।${peak.hi}${WATCH.hi}`,
    ),
  };
}

export const peakNote = (pm25: string, when: Text): Text =>
  bilingual(
    ` Forecast PM2.5 peaks at ≈ ${pm25} µg/m³ ${when.en}.`,
    ` पूर्वानुमान में PM2.5 ${when.hi} ≈ ${pm25} µg/m³ तक पहुँचता है।`,
  );

/** `band` is the AQI band's name in each language; `peak` is peakNote() or empty. */
export interface VulnerableWorking {
  band: Text;
  level: Level;
  ratio: string;
  cut: number;
  peak: Text;
}

export function vulnerableExplanation({ band, level, ratio, cut, peak }: VulnerableWorking): Text {
  const guide = GUIDE[level];
  return bilingual(
    `US EPA, ${band.en} air: ${guide.en}. Indoors with windows shut, their air is about ${ratio}% of outside: ` +
      `${cut}% less PM2.5 for them.${peak.en}`,
    `US EPA, ‘${band.hi}’ हवा: ${guide.hi}। खिड़कियाँ बंद करके घर में उनकी हवा बाहर की लगभग ${ratio}% रहती है: ` +
      `उनके लिए PM2.5 ${cut}% कम।${peak.hi}`,
  );
}
