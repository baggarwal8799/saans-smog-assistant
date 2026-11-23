/** Wording of the routine tips: exercise and masks. Each takes computed values and returns `Text`. */
import { CHILD_MASK_NOTE } from '../../copy/masks.js';
import { bilingual, NO_TEXT, type Text } from '../../copy/text.js';

/** `reduceOnly` at the EPA "reduce" level, which keeps the workout possible; from "avoid" on, it moves indoors. */
export interface Indoors {
  reduceOnly: boolean;
}

export const indoorsTitle = ({ reduceOnly }: Indoors): Text =>
  reduceOnly
    ? bilingual('Keep today’s workout short and light, or move it indoors', 'आज व्यायाम छोटा और हल्का रखें, या घर के अंदर करें')
    : bilingual('Move today’s workout indoors', 'आज का व्यायाम घर के अंदर करें');

export function indoorsDetail({ reduceOnly }: Indoors): Text {
  const how = reduceOnly
    ? bilingual(
        'US EPA advises reducing prolonged or heavy exertion outdoors at this level; the simplest way is yoga, skipping or stair climbing',
        'इस स्तर पर US EPA बाहर लंबा या तेज़ व्यायाम कम करने की सलाह देता है; सबसे आसान तरीका है ',
      )
    : bilingual('Do yoga, skipping or stair climbing', '');
  return bilingual(
    `Hard exercise makes you breathe about six times more air than resting. ${how.en} indoors with windows shut instead.`,
    `तेज़ व्यायाम में आराम के मुकाबले लगभग छह गुना ज़्यादा हवा साँस में जाती है। ${how.hi}खिड़कियाँ बंद रखकर घर में योग, रस्सी कूद या सीढ़ियाँ चढ़ें।`,
  );
}

interface IndoorFigures {
  outdoor: string;
  indoor: string;
  ratioPct: string;
  rate: number;
  cut: number;
}
export const indoorsWorking = ({ outdoor, indoor, ratioPct, rate, cut }: IndoorFigures): Text =>
  bilingual(
    `Outdoors ≈ ${outdoor} µg/m³; indoors with windows shut ≈ ${indoor} µg/m³ (${ratioPct}% of outside). Breathing ${rate} m³/h either way, so ${cut}% less PM2.5.`,
    `बाहर ≈ ${outdoor} µg/m³; बंद खिड़कियों के साथ अंदर ≈ ${indoor} µg/m³ (बाहर का ${ratioPct}%)। दोनों में ${rate} m³/घंटा साँस, यानी ${cut}% कम PM2.5।`,
  );

export const keepLight = (who: Text): Text =>
  bilingual(
    ` Today, ${who.en} should keep it light or exercise indoors.`,
    ` आज ${who.hi} को हल्का व्यायाम करना चाहिए या घर में करना चाहिए।`,
  );

/** `fine` when the window's own air is at most Moderate: only then is it "cleanest", not just least polluted. */
export const windowWhy = ({ fine, part }: { fine: boolean; part: Text }): Text =>
  fine
    ? bilingual(`This ${part.en} window is the cleanest in the forecast.`, `पूर्वानुमान में ${part.hi} का यह समय सबसे साफ़ है।`)
    : bilingual(
        `This ${part.en} window is the least polluted in the forecast, but its PM2.5 is still above the Moderate band.`,
        `पूर्वानुमान में ${part.hi} का यह समय सबसे कम प्रदूषित है, पर इसका PM2.5 अब भी ‘मध्यम’ स्तर से ऊपर है।`,
      );

export const windowTitle = ({ fine, when }: { fine: boolean; when: Text }): Text =>
  fine
    ? bilingual(`Exercise outside ${when.en}`, `बाहर व्यायाम ${when.hi} करें`)
    : bilingual(`If you must exercise outside, go ${when.en}`, `बाहर व्यायाम करना ही हो तो ${when.hi} करें`);

export const windowDetail = (why: Text, light: Text): Text =>
  bilingual(
    `${why.en} Avoid main roads and keep it to moderate effort.${light.en}`,
    `${why.hi} मुख्य सड़कों से दूर रहें और हल्का-मध्यम व्यायाम करें।${light.hi}`,
  );

export const windowWorking = (windowPm: string, dayPm: string, cut: number): Text =>
  bilingual(
    `PM2.5 averages ${windowPm} µg/m³ in this window vs ${dayPm} µg/m³ over the day: ${cut}% less inhaled for the same workout.`,
    `इस समय PM2.5 औसतन ${windowPm} µg/m³ है, जबकि पूरे दिन का औसत ${dayPm} µg/m³: उसी व्यायाम में ${cut}% कम प्रदूषण।`,
  );

export const MASK_MEMBER_NOTES = {
  children: bilingual(` ${CHILD_MASK_NOTE.en}`, ` ${CHILD_MASK_NOTE.hi}`),
  respiratory: bilingual(
    ' Anyone with lung or heart disease should check with their doctor first.',
    ' फेफड़े या दिल की बीमारी वाले पहले डॉक्टर से पूछें।',
  ),
} as const;

export const MASK_TITLE = bilingual(
  'Wear a well-fitted N95 or FFP2 outdoors',
  'बाहर अच्छी तरह फ़िट N95 या FFP2 मास्क पहनें',
);

const OZONE_NOTE = bilingual(
  ' Note: no mask filters ozone, today’s main pollutant, so also follow the ozone timing advice.',
  ' ध्यान दें: आज का मुख्य प्रदूषक ओज़ोन है, जिसे कोई मास्क नहीं रोकता, इसलिए ओज़ोन के समय वाली सलाह भी मानें।',
);

/** `who` is the members' notes; `ozone` when ozone drives the AQI, which no mask filters. */
export function maskDetail({ who, ozone }: { who: Text; ozone: boolean }): Text {
  const note = ozone ? OZONE_NOTE : NO_TEXT;
  return bilingual(
    `Cloth and surgical masks do little against PM2.5. Pinch the nose clip and check for leaks.${who.en}${note.en}`,
    `कपड़े और सर्जिकल मास्क PM2.5 से ज़्यादा नहीं बचाते। नाक की क्लिप दबाएँ और लीक जाँचें।${who.hi}${note.hi}`,
  );
}

export const maskWorking = (pct: number): Text =>
  bilingual(
    `N95s filter ≥95% in the lab; with real-world fit leaks we count ${pct}% of the PM2.5 you would breathe on the move.`,
    `N95 लैब में ≥95% छानता है; असल में फ़िट के लीक को देखते हुए हम बाहर की साँस का ${pct}% मानते हैं।`,
  );
