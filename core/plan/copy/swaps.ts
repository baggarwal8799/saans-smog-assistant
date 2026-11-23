/** User-facing copy for the swap rules: heating, waste burning and indoor smoke. */
import { bilingual, type Text } from '../../copy/text.js';
import type { TipCopy } from './types.js';

export const GAS_HEATER = {
  title: bilingual('Gas heater: never run it overnight or in a sealed room', 'गैस हीटर: रात भर या बंद कमरे में कभी न चलाएँ'),
  detail: bilingual(
    'A gas heater without a flue releases carbon monoxide and nitrogen dioxide into the room. Keep a window slightly open while it runs, switch it off before sleeping, and fit a carbon monoxide alarm. An oil-filled electric heater adds no fumes.',
    'बिना चिमनी वाला गैस हीटर कमरे में कार्बन मोनोऑक्साइड और नाइट्रोजन डाइऑक्साइड छोड़ता है। चलते समय खिड़की थोड़ी खुली रखें, सोने से पहले बंद कर दें, और कार्बन मोनोऑक्साइड अलार्म लगाएँ। तेल वाला बिजली का हीटर कोई धुआँ नहीं छोड़ता।',
  ),
  explanation: bilingual(
    'Unvented gas heaters add carbon monoxide and nitrogen dioxide indoors (US EPA). Switching to electric heat removes that source; if you keep gas, ventilation and a carbon monoxide alarm are the safeguards.',
    'बिना चिमनी वाले गैस हीटर घर के अंदर कार्बन मोनोऑक्साइड और नाइट्रोजन डाइऑक्साइड बढ़ाते हैं (US EPA)। बिजली के हीटर से यह स्रोत हट जाता है; गैस रखें तो हवा आने देना और कार्बन मोनोऑक्साइड अलार्म ही बचाव हैं।',
  ),
} as const;

const STOVE_INDIA = bilingual('An angithi or brazier', 'अंगीठी');
const STOVE_ELSEWHERE = bilingual('A charcoal brazier or open fire', 'कोयले या लकड़ी की आग');

export const solidHeatingCopy = ({ india }: { india: boolean }): TipCopy => {
  const stove = india ? STOVE_INDIA : STOVE_ELSEWHERE;
  return {
    title: bilingual(
      'Never burn coal or wood in a closed room: switch to an electric heater',
      'बंद कमरे में कभी कोयला या लकड़ी न जलाएँ: बिजली का हीटर लें',
    ),
    detail: bilingual(
      `${stove.en} in a shut room can kill through carbon monoxide, which has no smell. Use an oil-filled electric heater, layers and a hot-water bottle. If you must burn fuel, keep a window open and never sleep with it lit.`,
      `बंद कमरे में ${stove.hi} कार्बन मोनोऑक्साइड से जान ले सकती है, जिसकी कोई गंध नहीं होती। तेल वाला बिजली का हीटर, गर्म कपड़े और गर्म पानी की बोतल इस्तेमाल करें। जलाना ही पड़े तो खिड़की खुली रखें और आग जलती छोड़कर कभी न सोएँ।`,
    ),
    explanation: bilingual(
      'Burning coal or wood indoors adds smoke and carbon monoxide on top of the outdoor smog that leaks in. Electric heat adds neither, so the whole source disappears.',
      'घर में कोयला या लकड़ी जलाने से बाहर से आने वाले स्मॉग के ऊपर और धुआँ व कार्बन मोनोऑक्साइड जुड़ता है। बिजली की गर्मी से ये दोनों नहीं बनते, यानी पूरा स्रोत हट जाता है।',
    ),
  };
};

const REPORT_INDIA = bilingual('report open burning to your municipal app', 'खुले में जलाने की शिकायत नगर निगम ऐप पर करें');
const REPORT_ELSEWHERE = bilingual(
  'report open burning to your local council',
  'खुले में जलाने की शिकायत स्थानीय प्रशासन से करें',
);

/** The household's burning figures, as the waste working quotes them; `india` picks where burning is reported. */
interface WasteFigures {
  india: boolean;
  who: Text;
  kgPerPersonWeek: number;
  pm25GramsPerKg: number;
  weeks: number;
  total: string;
}

export const wasteCopy = (figures: WasteFigures): TipCopy => {
  const report = figures.india ? REPORT_INDIA : REPORT_ELSEWHERE;
  return {
    title: bilingual(
      'Compost leaves and hand waste to collection instead of burning',
      'पत्ते और कूड़ा जलाने की जगह खाद बनाएँ या कूड़ा गाड़ी को दें',
    ),
    detail: bilingual(
      `Burning mixed waste or leaves releases dense smoke right at breathing height for the whole street. Use a compost pit or bin for leaves and kitchen scraps, and ${report.en}.`,
      `कूड़ा या पत्ते जलाने से पूरी गली में साँस की ऊँचाई पर घना धुआँ फैलता है। पत्तों और रसोई के कचरे के लिए खाद का गड्ढा या डिब्बा बनाएँ, और ${report.hi}।`,
    ),
    explanation: bilingual(
      `Each kg of household waste burned in the open releases ≈ ${figures.pm25GramsPerKg} g of PM2.5. Assuming ${figures.kgPerPersonWeek} kg burned per person a week: ${figures.who.en} × ${figures.kgPerPersonWeek} kg × ${figures.pm25GramsPerKg} g/kg × ${figures.weeks} weeks ≈ ${figures.total} g of PM2.5 a month kept out of your street air.`,
      `खुले में जलाया गया हर किलो कूड़ा ≈ ${figures.pm25GramsPerKg} ग्राम PM2.5 छोड़ता है। हर व्यक्ति का हफ़्ते में ${figures.kgPerPersonWeek} किलो जलना मानें: ${figures.who.hi} × ${figures.kgPerPersonWeek} किलो × ${figures.pm25GramsPerKg} ग्राम/किलो × ${figures.weeks} हफ़्ते ≈ हर महीने ${figures.total} ग्राम PM2.5 आपकी गली की हवा में नहीं जाता।`,
    ),
  };
};

const TRAPPED_SMOKE = bilingual(
  'Smoke you make indoors is trapped with you when windows are shut for smog.',
  'स्मॉग में खिड़कियाँ बंद होने पर घर के अंदर का धुआँ आपके साथ ही फँसा रहता है।',
);

export const INCENSE = {
  title: bilingual('Skip incense and candles on smoggy days', 'स्मॉग वाले दिनों में अगरबत्ती और मोमबत्ती न जलाएँ'),
  detail: bilingual(
    `${TRAPPED_SMOKE.en} An electric diffuser or LED candles add no smoke.`,
    `${TRAPPED_SMOKE.hi} बिजली का डिफ़्यूज़र या LED मोमबत्ती धुआँ नहीं करते।`,
  ),
  explanation: bilingual(
    'Burning incense and candles releases fine particles straight into the room you breathe in (US EPA). Skipping them removes that source.',
    'अगरबत्ती और मोमबत्ती जलाने से बारीक कण सीधे उसी कमरे में फैलते हैं जिसमें आप साँस लेते हैं (US EPA)। इन्हें छोड़ने से वह स्रोत हट जाता है।',
  ),
} as const;

const COIL_DETAIL = {
  shut: bilingual(
    `${TRAPPED_SMOKE.en} Mosquito nets, window mesh and plug-in vaporisers add no smoke.`,
    `${TRAPPED_SMOKE.hi} मच्छरदानी, खिड़की की जाली और प्लग-इन वेपोराइज़र धुआँ नहीं करते।`,
  ),
  open: bilingual(
    'Smoke you make indoors goes straight into the air your family breathes. Mosquito nets, window mesh and plug-in vaporisers add no smoke.',
    'घर के अंदर बना धुआँ सीधे उसी हवा में जाता है जिसमें परिवार साँस लेता है। मच्छरदानी, खिड़की की जाली और प्लग-इन वेपोराइज़र धुआँ नहीं करते।',
  ),
} as const;

/** `windowsShut` when the day is smoggy enough to keep windows shut; `low`–`high` the coil's cigarette range. */
interface CoilFigures {
  windowsShut: boolean;
  low: number;
  high: number;
}

export const coilCopy = ({ windowsShut, low, high }: CoilFigures): TipCopy => ({
  title: bilingual(
    'Swap mosquito coils, incense and candles for nets or a plug-in repellent',
    'मच्छर कॉइल, अगरबत्ती और मोमबत्ती की जगह मच्छरदानी या प्लग-इन रिपेलेंट',
  ),
  detail: COIL_DETAIL[windowsShut ? 'shut' : 'open'],
  explanation: bilingual(
    `A lab study (Liu et al., 2003) found one burning mosquito coil gives off as much PM2.5 as ${low}–${high} cigarettes. Dropping it removes that whole source.`,
    `एक लैब अध्ययन (Liu et al., 2003) में एक जलती मच्छर कॉइल से ${low}–${high} सिगरेट जितना PM2.5 निकला। इसे छोड़ने से वह पूरा स्रोत हट जाता है।`,
  ),
});
