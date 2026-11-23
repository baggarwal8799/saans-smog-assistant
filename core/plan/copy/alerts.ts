/** Wording of the time-critical alerts (../alerts.ts): the ozone peak and the smog trap. */
import { bilingual, type Text } from '../../copy/text.js';

export const EXERCISE_INDOORS = bilingual('Exercise indoors today.', 'आज घर में ही व्यायाम करें।');
export const WALK_GENTLY = bilingual('Walk gently or exercise indoors.', 'धीरे टहलें या घर में व्यायाम करें।');
export const ASTHMA = bilingual(' This matters most for anyone with asthma.', ' अस्थमा वालों के लिए यह सबसे ज़रूरी है।');

export const ozoneTitle = (when: Text): Text =>
  bilingual(
    `Ozone is the main pollutant: no hard outdoor exercise ${when.en}`,
    `मुख्य प्रदूषक ओज़ोन है: ${when.hi} बाहर तेज़ व्यायाम न करें`,
  );

/** `gentle` is EXERCISE_INDOORS or WALK_GENTLY; `asthma` is ASTHMA or empty. */
export const ozoneDetail = (part: Text, gentle: Text, asthma: Text): Text =>
  bilingual(
    `Ozone forms in sunlight from traffic and industry fumes; today it peaks in the ${part.en}. It is a gas: masks do not stop it. ${gentle.en}${asthma.en}`,
    `ओज़ोन धूप में गाड़ियों और उद्योगों के धुएँ से बनती है; आज यह ${part.hi} में सबसे ज़्यादा है। यह गैस है: मास्क इसे नहीं रोकता। ${gentle.hi}${asthma.hi}`,
  );

/** `o3` is the window's average, `sensitive` the EPA level for sensitive groups, `indoorPct` indoor/outdoor %. */
export const ozoneExplanation = (o3: string, sensitive: number, indoorPct: string, cut: number): Text =>
  bilingual(
    `Ozone averages ≈ ${o3} µg/m³ in this window (about ${sensitive} µg/m³ is unhealthy for sensitive groups). Indoor ozone is typically about ${indoorPct}% of outdoor, so exercising indoors means ${cut}% less ozone breathed.`,
    `इस समय ओज़ोन औसतन ≈ ${o3} µg/m³ है (लगभग ${sensitive} µg/m³ संवेदनशील लोगों के लिए हानिकारक है)। घर के अंदर ओज़ोन आमतौर पर बाहर की लगभग ${indoorPct}% होती है, इसलिए अंदर व्यायाम से साँस में ओज़ोन ${cut}% कम।`,
  );

export const COILS = bilingual('coils', 'कॉइल');
export const CANDLES = bilingual('candles', 'मोमबत्ती');
export const TRAP_SCOPE = bilingual('at home during the trap', 'जाल के दौरान घर पर');

export const trapTitle = (when: Text): Text =>
  bilingual(
    `Smog trap ${when.en}: shut windows before it starts, and burn nothing`,
    `${when.hi} स्मॉग जाल: शुरू होने से पहले खिड़कियाँ बंद करें, और कुछ न जलाएँ`,
  );

/** `smoke` is COILS where mosquito coils are a habit, else CANDLES. */
export const trapDetail = (smoke: Text): Text =>
  bilingual(
    `Cold, still air will sit low over the city like a lid, so smoke from traffic, cooking and burning stays at breathing height. Close windows before it starts, run any purifier, and skip incense, ${smoke.en} and wood fires.`,
    `ठंडी, रुकी हुई हवा शहर पर ढक्कन की तरह बैठ जाएगी, इसलिए गाड़ियों, खाने और जलाने का धुआँ साँस की ऊँचाई पर ही रहेगा। शुरू होने से पहले खिड़कियाँ बंद करें, प्यूरीफ़ायर चलाएँ, और अगरबत्ती, ${smoke.hi} या लकड़ी न जलाएँ।`,
  );

interface TrapWorking {
  wind: Text;
  mixing: Text;
  windKmh: number;
  mixingM: number;
  working: Text;
}

export const trapExplanation = ({ wind, mixing, windKmh, mixingM, working }: TrapWorking): Text =>
  bilingual(
    `Forecast wind ${wind.en} and a mixing layer ${mixing.en} deep (a trap is wind under ${windKmh} km/h and a layer under ${mixingM} m). ${working.en}`,
    `पूर्वानुमान: हवा ${wind.hi} और मिश्रण परत ${mixing.hi} (जाल का मतलब: हवा ${windKmh} किमी/घंटा से कम और परत ${mixingM} मीटर से कम)। ${working.hi}`,
  );
