/** Wording of the community tip (./community.ts). Every function takes computed values and returns `Text`. */
import { bilingual, type Text } from '../text.js';

/** The pool on offer: a carpool for a driver, a school-run pool for a family with children, else none. */
export function poolName(car: boolean, kids: boolean): Text | null {
  if (car && kids) return bilingual('a carpool or school-run pool', 'कारपूल या स्कूल के लिए साझा गाड़ी');
  if (car) return bilingual('a carpool', 'कारपूल');
  return kids ? bilingual('a school-run pool', 'स्कूल के लिए साझा गाड़ी') : null;
}

export const STEP_NAME = {
  pool: bilingual('pool rides', 'साझा सवारी'),
  pledge: bilingual('stop burning', 'जलाना बंद'),
  room: bilingual('share a clean room', 'एक साझा साफ़ कमरा'),
} as const;

export const lead = (several: boolean): Text =>
  several ? bilingual('Set these up', 'ये काम शुरू करें') : bilingual('Set this up', 'यह काम शुरू करें');

export const cleanRoom = (place: Text): Text =>
  bilingual(
    `one purifier in a shared clean room or ${place.en} where those most at risk can sit on smoggy days`,
    `एक साझा साफ़ कमरे या ${place.hi} में एक प्यूरीफ़ायर, जहाँ स्मॉग वाले दिनों में सबसे ज़्यादा जोखिम वाले लोग बैठ सकें`,
  );

export const pledge = (burnt: Text, to: Text): Text =>
  bilingual(
    `a no-burning pledge for ${burnt.en}, with any open fire reported to the ${to.en}`,
    `${burnt.hi} न जलाने का संकल्प, और कहीं खुले में आग दिखे तो ${to.hi} से शिकायत`,
  );

/** What is burnt, who hears about it and where the clean room goes, in India and elsewhere. */
export const PLACE_WORDS = {
  india: {
    burnt: bilingual('leaves and garbage', 'पत्ते और कूड़ा'),
    to: bilingual('municipality', 'नगर निगम'),
    place: bilingual('crèche', 'क्रेच'),
  },
  abroad: {
    burnt: bilingual(
      'garden waste, and wood stoves or fireplaces on smoggy days',
      'बगीचे का कचरा, और स्मॉग वाले दिनों में लकड़ी का चूल्हा या फ़ायरप्लेस',
    ),
    to: bilingual('council', 'स्थानीय प्रशासन'),
    place: bilingual('nursery', 'नर्सरी'),
  },
} as const;

export const title = (names: Text): Text =>
  bilingual(`Plan with neighbours: ${names.en}`, `पड़ोसियों के साथ: ${names.hi}`);

export const detailIndia = (lead: Text, what: Text, limit: number): Text =>
  bilingual(
    `${lead.en} with your RWA or school this winter: ${what.en}. ` +
      `Ask them too to move assemblies and sports indoors when AQI is above ${limit}.`,
    `इस सर्दी अपनी RWA या स्कूल के साथ ${lead.hi}: ${what.hi}। ` +
      `उनसे यह भी कहें कि AQI ${limit} से ऊपर हो तो प्रार्थना सभा और खेल अंदर कराएँ।`,
  );

export const detailAbroad = (lead: Text, what: Text, limit: number): Text =>
  bilingual(
    `${lead.en} with your residents’ association or school this winter: ${what.en}. ` +
      `Ask them too to move assemblies and sports indoors when AQI is above ${limit}.`,
    `इस सर्दी अपने निवासी संघ या स्कूल के साथ ${lead.hi}: ${what.hi}। ` +
      `उनसे यह भी कहें कि AQI ${limit} से ऊपर हो तो सभा और खेल अंदर कराएँ।`,
  );

export interface PoolFigures {
  pool: number;
  own: boolean;
  km: number;
  cars: number;
  monthKm: string;
  ef: number;
  kg: number;
}
export const poolWorking = ({ pool, own, km, cars, monthKm, ef, kg }: PoolFigures): Text => {
  const whose = own ? bilingual('your', 'आपके') : bilingual('an example', 'उदाहरण के');
  return bilingual(
    `Carpool: ${pool} to a car on ${whose.en} ${km} km route takes ${cars} cars off the road: ` +
      `${cars} × ${monthKm} km a month × ${ef} kg CO₂/km ≈ ${kg} kg CO₂.`,
    `कारपूल: ${whose.hi} ${km} किमी रास्ते पर एक गाड़ी में ${pool} लोग, यानी सड़क से ${cars} गाड़ियाँ कम: ` +
      `${cars} × हर महीने ${monthKm} किमी × ${ef} किग्रा CO₂/किमी ≈ ${kg} किग्रा CO₂।`,
  );
};

export interface PledgeFigures {
  homes: number;
  who: Text;
  kgWeek: number;
  gPerKg: number;
  weeks: number;
  grams: number;
}
export const pledgeWorking = ({ homes, who, kgWeek, gPerKg, weeks, grams }: PledgeFigures): Text =>
  bilingual(
    `Pledge: ${homes} homes × ${who.en} × ${kgWeek} kg burned a week × ${gPerKg} g/kg × ${weeks} weeks ≈ ` +
      `${grams} g of PM2.5 a month kept out of the street’s air.`,
    `संकल्प: ${homes} घर × ${who.hi} × हफ़्ते में ${kgWeek} किलो × ${gPerKg} ग्राम/किलो × ${weeks} हफ़्ते ≈ ` +
      `हर महीने ${grams} ग्राम PM2.5 गली की हवा से बाहर।`,
  );

export const roomWorking = (closedPct: string, purifierPct: string, cut: number): Text =>
  bilingual(
    `Clean room: a purifier with the door shut brings PM2.5 from ≈ ${closedPct}% to ≈ ${purifierPct}% of outside, ` +
      `${cut}% less for those inside.`,
    `साफ़ कमरा: दरवाज़ा बंद करके प्यूरीफ़ायर चलाने से PM2.5 बाहर के ≈ ${closedPct}% से ≈ ${purifierPct}% रह जाता है, ` +
      `अंदर बैठे लोगों के लिए ${cut}% कम।`,
  );

export const COMMUNITY_NOTE = bilingual(
  'These are community figures, not added to your own total.',
  'ये समुदाय के आँकड़े हैं, आपके अपने कुल में नहीं जोड़े गए।',
);

export const ROOM_SCOPE = bilingual('in the shared room', 'साझा कमरे में');
