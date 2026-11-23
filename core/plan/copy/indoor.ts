/** User-facing copy for the DIY purifier and wet cleaning. */
import { bilingual, plural, type Text } from '../../copy/text.js';
import type { TipCopy } from './types.js';

const UNIT_FORMS = { en: ['unit', 'units'], hi: ['यूनिट', 'यूनिट'] } as const;
export const coverageCopy = (who: Text, perRoom: number, rooms: number): Text => {
  const units = plural(rooms, UNIT_FORMS);
  return bilingual(
    ` One unit cleans one closed room: ${who.en} ÷ ${perRoom} per bedroom ≈ ${units.en}.`,
    ` एक यूनिट एक बंद कमरा साफ़ करती है: ${who.hi} ÷ ${perRoom} प्रति कमरा ≈ ${units.hi}।`,
  );
};

interface PurifierFigures {
  closedPct: string;
  diyPct: string;
  closedUg: string;
  diyUg: string;
  cut: number;
}

export const purifierCopy = (rooms: Text, figures: PurifierFigures): TipCopy => ({
  title: bilingual('Build a DIY box-fan air purifier', 'घर पर बॉक्स-फ़ैन एयर प्यूरीफ़ायर बनाएँ'),
  detail: bilingual(
    `Tape a MERV-13 or HEPA-grade filter to the back of a box or table fan, with the airflow arrow pointing into the fan. It costs a fraction of a branded purifier. Run it in the room where you sleep.${rooms.en}`,
    `एक बॉक्स या टेबल फ़ैन के पीछे MERV-13 या HEPA-ग्रेड फ़िल्टर टेप करें, हवा का तीर फ़ैन की ओर रहे। यह ब्रांडेड प्यूरीफ़ायर से बहुत सस्ता है। जिस कमरे में सोते हैं, वहाँ चलाएँ।${rooms.hi}`,
  ),
  explanation: bilingual(
    `Tests of fan-filter units show indoor PM2.5 dropping from ≈ ${figures.closedPct}% to ≈ ${figures.diyPct}% of outside: here ≈ ${figures.closedUg} → ${figures.diyUg} µg/m³, ${figures.cut}% less while you are home.`,
    `फ़ैन-फ़िल्टर के परीक्षणों में अंदर का PM2.5 बाहर के ≈ ${figures.closedPct}% से ≈ ${figures.diyPct}% तक घटता है: यहाँ ≈ ${figures.closedUg} → ${figures.diyUg} µg/m³, घर पर ${figures.cut}% कम।`,
  ),
});

export const DUST_SCOPE = bilingual('from stirred-up dust', 'उड़ी धूल से');

export const cleaningCopy = (pct: number): TipCopy => ({
  title: bilingual(
    'Wet-mop instead of sweeping; skip the “air-purifying plant” myth',
    'झाड़ू की जगह गीला पोंछा लगाएँ; “हवा साफ़ करने वाले पौधों” के भ्रम में न पड़ें',
  ),
  detail: bilingual(
    'Dry sweeping throws settled dust back into the air. Wipe surfaces with a damp cloth. Houseplants are nice, but you would need hundreds per room to match one purifier.',
    'सूखी झाड़ू जमी धूल को फिर हवा में उड़ा देती है। गीले कपड़े से सतह पोंछें। पौधे अच्छे हैं, पर एक प्यूरीफ़ायर जितना असर पाने के लिए हर कमरे में सैकड़ों पौधे चाहिए।',
  ),
  explanation: bilingual(
    `Dry sweeping lifts settled dust back into the air; we count ${pct}% less PM2.5 at home from damp cleaning. That is an assumed figure, kept low because sweeping mostly lifts coarser dust rather than fine particles. A 2019 review (Cummings & Waring) found plants clear indoor air 100–1000× slower than normal ventilation, so we give plants no impact.`,
    `सूखी झाड़ू जमी धूल को फिर हवा में उड़ाती है; गीली सफ़ाई से हम घर पर PM2.5 में ${pct}% कमी मानते हैं। यह अनुमान है, जिसे कम रखा गया है क्योंकि झाड़ू से ज़्यादातर मोटी धूल उड़ती है, बारीक कण कम। 2019 की समीक्षा (Cummings & Waring) में पौधे सामान्य वेंटिलेशन से 100–1000 गुना धीमे पाए गए, इसलिए हम पौधों का कोई असर नहीं गिनते।`,
  ),
});
