/** User-facing copy for the kitchen: cleaner cooking fuel, and the exhaust for gas and electric cooking. */
import { bilingual, joinText, type Text } from '../../copy/text.js';
import type { TipCopy } from './types.js';

export const KIDS_OUT_OF_KITCHEN = bilingual(
  ' Keep children out of the kitchen while it burns.',
  ' चूल्हा जलते समय बच्चों को रसोई से दूर रखें।',
);

const SOLID_SMOKE = bilingual(
  'Smoke from wood, dung or kerosene is the biggest indoor pollution source in many homes, and whoever is near the stove breathes most of it.',
  'लकड़ी, उपले या मिट्टी के तेल का धुआँ कई घरों में अंदर के प्रदूषण का सबसे बड़ा स्रोत है, और चूल्हे के पास रहने वाले इसमें सबसे ज़्यादा साँस लेते हैं।',
);
const SUBSIDY_INDIA = bilingual(
  ' Under the PM Ujjwala Yojana, eligible households can get a subsidised LPG connection.',
  ' प्रधानमंत्री उज्ज्वला योजना में पात्र परिवारों को सस्ता LPG कनेक्शन मिल सकता है।',
);
const SUBSIDY_ELSEWHERE = bilingual(
  ' Ask your local authority about clean-cooking subsidies.',
  ' साफ़ ईंधन पर मिलने वाली सरकारी मदद के बारे में स्थानीय प्रशासन से पूछें।',
);

/** `india` picks the subsidy named; `kids` is the children's note or empty; `fuelCut` the kitchen smoke cut, %. */
interface CleanCooking {
  india: boolean;
  kids: Text;
  fuelCut: number;
}

export const cleanCookingCopy = ({ india, kids, fuelCut }: CleanCooking): TipCopy => {
  const subsidy = india ? SUBSIDY_INDIA : SUBSIDY_ELSEWHERE;
  return {
    title: bilingual('Switch to LPG or induction for daily cooking', 'रोज़ का खाना LPG या इंडक्शन पर बनाएँ'),
    detail: joinText([SOLID_SMOKE, subsidy, kids]),
    explanation: bilingual(
      `Kitchen PM2.5 with solid fuels often runs above 500 µg/m³ while cooking, vs typically under 100 µg/m³ with LPG: roughly ${fuelCut}% less kitchen smoke.`,
      `ठोस ईंधन से खाना बनाते समय रसोई का PM2.5 अक्सर 500 µg/m³ से ऊपर होता है, LPG के साथ आमतौर पर 100 से कम: रसोई का धुआँ लगभग ${fuelCut}% कम।`,
    ),
  };
};

export const exhaustCopy = (hoodCut: number): TipCopy => ({
  title: bilingual(
    'Run the exhaust or chimney while cooking, and 10 minutes after',
    'खाना बनाते समय और 10 मिनट बाद तक एग्ज़ॉस्ट या चिमनी चलाएँ',
  ),
  detail: bilingual(
    'Frying and high-heat cooking make fine particles even on gas. Use lids, cook on the back burners under the hood, and skip deep-frying on the worst days.',
    'गैस पर भी तलने और तेज़ आँच से बारीक कण बनते हैं। ढक्कन लगाएँ, चिमनी के नीचे पीछे वाले बर्नर पर पकाएँ, और सबसे खराब दिनों में डीप-फ़्राई न करें।',
  ),
  explanation: bilingual(
    `Studies of vented range hoods find cooking PM2.5 in the kitchen falls by roughly a third to a half; we count the conservative ${hoodCut}%.`,
    `चिमनी वाले हुड के अध्ययनों में रसोई का PM2.5 लगभग एक-तिहाई से आधा घटता है; हम कम वाला ${hoodCut}% मानते हैं।`,
  ),
});
