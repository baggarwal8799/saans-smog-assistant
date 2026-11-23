/** User-facing wording of the commute tips. */
import { bilingual, NO_TEXT, type Text } from '../../copy/text.js';
import type { Commute } from '../../types.js';
import { METRO_IF, MODE_NAME } from './shared.js';

export const SWITCH_DETAIL: Readonly<Record<'bus' | 'metro' | 'active', Text>> = {
  bus: bilingual(
    `Public transport takes cars off the road, which is where most winter tailpipe smoke comes from. The metro is cleaner still, ${METRO_IF.en}.`,
    `सार्वजनिक परिवहन सड़क से गाड़ियाँ कम करता है, और सर्दियों का ज़्यादातर धुआँ इन्हीं से आता है। ${METRO_IF.hi}, तो वह और भी साफ़ है।`,
  ),
  metro: bilingual(
    `Take the metro ${METRO_IF.en}: trains run on electricity and keep you out of roadside smoke. No metro? A shared or electric ride also cuts emissions.`,
    `${METRO_IF.hi}, तो मेट्रो लें: यह बिजली से चलती है और आपको सड़क किनारे के धुएँ से दूर रखती है। मेट्रो नहीं? साझा या इलेक्ट्रिक सवारी भी उत्सर्जन घटाती है।`,
  ),
  active: bilingual(
    'Your trip is short enough to walk or cycle, and today’s air allows it. That removes your vehicle’s exhaust from the street.',
    'आपकी दूरी पैदल या साइकिल के लिए कम है, और आज की हवा इसकी इजाज़त देती है। इससे सड़क से आपकी गाड़ी का धुआँ हटता है।',
  ),
};

/** Said only on days the mask tip itself is given, so no tip mentions a mask the plan does not recommend. */
export const maskWalk = ({ maskDay }: { maskDay: boolean }): Text =>
  maskDay ? bilingual(' Wear an N95 for the walk to the stop or station.', ' स्टॉप या स्टेशन तक N95 पहनें।') : NO_TEXT;

export const carpool = ({ driver }: { driver: boolean }): Text =>
  driver
    ? bilingual(
        ' Can’t switch? Share the ride with one colleague, which halves your share of the emissions, and switch the engine off at long red lights.',
        ' बदल नहीं सकते? एक साथी के साथ गाड़ी बाँटें, इससे आपके हिस्से का उत्सर्जन आधा हो जाता है, और लंबी लाल बत्ती पर इंजन बंद करें।',
      )
    : NO_TEXT;

export const stayHomeNote = ({ avoidAll }: { avoidAll: boolean }): Text =>
  avoidAll
    ? bilingual(
        ' US EPA advises avoiding all physical activity outdoors today: work from home if you can.',
        ' US EPA के अनुसार आज बाहर हर शारीरिक गतिविधि से बचें: हो सके तो घर से काम करें।',
      )
    : NO_TEXT;

export const switchTitle = (from: Commute, to: Commute): Text =>
  bilingual(
    `Switch your ${MODE_NAME[from].en} commute to ${MODE_NAME[to].en}`,
    `${MODE_NAME[from].hi} की जगह ${MODE_NAME[to].hi} से आना-जाना करें`,
  );

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const metroSaving = (metroEf: number): Text =>
  bilingual(
    ` ${capitalise(METRO_IF.en)}, the metro (${metroEf} kg/km) would save even more.`,
    ` ${METRO_IF.hi}, तो मेट्रो (${metroEf} किग्रा/किमी) से और ज़्यादा बचत होगी।`,
  );

interface SwitchMaths {
  monthKm: string;
  fromEf: number;
  toEf: number;
  savedKg: number;
  /** The metro's factor, quoted only when the bus is suggested. */
  metroEf: number | null;
}

export function switchWorking(maths: SwitchMaths): Text {
  const more = maths.metroEf === null ? NO_TEXT : metroSaving(maths.metroEf);
  return bilingual(
    `${maths.monthKm} km a month × (${maths.fromEf} − ${maths.toEf}) kg CO₂/km = ${maths.savedKg} kg CO₂ saved.${more.en}`,
    `हर महीने ${maths.monthKm} किमी × (${maths.fromEf} − ${maths.toEf}) किग्रा CO₂/किमी = ${maths.savedKg} किग्रा CO₂ की बचत।${more.hi}`,
  );
}

export const howActive = ({ walk }: { walk: boolean }): Text =>
  bilingual(walk ? 'walking' : 'cycling', walk ? 'पैदल चलने' : 'साइकिल चलाने');

export const takeTransit = ({ metro }: { metro: boolean }): Text =>
  metro
    ? bilingual(`Take the metro ${METRO_IF.en}, or else the bus,`, `${METRO_IF.hi} तो मेट्रो लें, नहीं तो बस,`)
    : bilingual(`Take the bus (or the metro, ${METRO_IF.en})`, `बस लें (या मेट्रो, ${METRO_IF.hi}),`);

export interface Leg {
  ratio: number;
  rate: number;
  hours: string;
}

export function accessWalk(minutes: number, walkLeg: Leg): Text {
  return bilingual(
    ` plus a ${minutes}-minute walk each way to the stop or station (${walkLeg.ratio} × street PM2.5 at ${walkLeg.rate} m³/h)`,
    ` और स्टॉप या स्टेशन तक हर तरफ़ ${minutes} मिनट पैदल (सड़क का PM2.5 × ${walkLeg.ratio}, ${walkLeg.rate} m³/घंटा)`,
  );
}

export const exposureTitle = (alt: Commute, how: Text): Text =>
  bilingual(`Today, take the ${MODE_NAME[alt].en} instead of ${how.en}`, `आज ${how.hi} की जगह ${MODE_NAME[alt].hi} लें`);

export function exposureDetail(how: Text, take: Text, home: Text): Text {
  return bilingual(
    `On a day this smoggy, ${how.en} at the roadside means breathing hard in the dirtiest air. ${take.en} and go back to ${how.en} once the air improves.${home.en}`,
    `इतनी स्मॉग वाले दिन सड़क किनारे ${how.hi} का मतलब है सबसे गंदी हवा में तेज़ साँस लेना। ${take.hi} और हवा सुधरने पर फिर से ${how.hi} लगें।${home.hi}`,
  );
}

/** `walk` is the walk to and from transit, on top of `altLeg`. */
interface ExposureWorking {
  alt: Commute;
  currentLeg: Leg;
  altLeg: Leg;
  walk: Text;
  cut: number;
}

export function exposureWorking({ alt, currentLeg, altLeg, walk, cut }: ExposureWorking): Text {
  const mode = MODE_NAME[alt];
  return bilingual(
    `Round trip: ${currentLeg.ratio} × street PM2.5 at ${currentLeg.rate} m³/h for ${currentLeg.hours} h, vs ${altLeg.ratio} × street PM2.5 at ${altLeg.rate} m³/h for ${altLeg.hours} h by ${mode.en}${walk.en}: ${cut}% less PM2.5 inhaled.`,
    `आना-जाना: सड़क का PM2.5 × ${currentLeg.ratio}, ${currentLeg.rate} m³/घंटा साँस, ${currentLeg.hours} घंटे; ${mode.hi} से × ${altLeg.ratio}, ${altLeg.rate} m³/घंटा, ${altLeg.hours} घंटे,${walk.hi}: ${cut}% कम PM2.5।`,
  );
}

export const COMMUTE_SCOPE = bilingual('on your commute', 'आने-जाने में');
