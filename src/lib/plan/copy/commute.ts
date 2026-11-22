/** User-facing wording of the commute tips (plan/commute.ts). */
import { bilingual, type Text } from '../text.js';
import { METRO_IF, MODE_NAME } from '../shared.js';
import type { Commute } from '../../types.js';

const NONE = bilingual('', '');

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
export const maskWalk = (on: boolean): Text =>
  on ? bilingual(' Wear an N95 for the walk to the stop or station.', ' स्टॉप या स्टेशन तक N95 पहनें।') : NONE;

export const carpool = (driver: boolean): Text =>
  driver
    ? bilingual(
        ' Can’t switch? Share the ride with one colleague, which halves your share of the emissions, and switch the engine off at long red lights.',
        ' बदल नहीं सकते? एक साथी के साथ गाड़ी बाँटें, इससे आपके हिस्से का उत्सर्जन आधा हो जाता है, और लंबी लाल बत्ती पर इंजन बंद करें।',
      )
    : NONE;

export const stayHomeNote = (avoidAll: boolean): Text =>
  avoidAll
    ? bilingual(
        ' US EPA advises avoiding all physical activity outdoors today: work from home if you can.',
        ' US EPA के अनुसार आज बाहर हर शारीरिक गतिविधि से बचें: हो सके तो घर से काम करें।',
      )
    : NONE;

export const switchTitle = (from: Commute, to: Commute): Text =>
  bilingual(
    `Switch your ${MODE_NAME[from].en} commute to ${MODE_NAME[to].en}`,
    `${MODE_NAME[from].hi} की जगह ${MODE_NAME[to].hi} से आना-जाना करें`,
  );

const metroSaving = (metroEf: number): Text =>
  bilingual(
    ` If a metro line serves your route, the metro (${metroEf} kg/km) would save even more.`,
    ` ${METRO_IF.hi}, तो मेट्रो (${metroEf} किग्रा/किमी) से और ज़्यादा बचत होगी।`,
  );

export interface SwitchMaths {
  km: string;
  fromEf: number;
  toEf: number;
  kg: number;
  /** The metro's factor, quoted only when the bus is suggested. */
  metroEf: number | null;
}

export function switchWorking(m: SwitchMaths): Text {
  const more = m.metroEf === null ? NONE : metroSaving(m.metroEf);
  return bilingual(
    `${m.km} km a month × (${m.fromEf} − ${m.toEf}) kg CO₂/km = ${m.kg} kg CO₂ saved.${more.en}`,
    `हर महीने ${m.km} किमी × (${m.fromEf} − ${m.toEf}) किग्रा CO₂/किमी = ${m.kg} किग्रा CO₂ की बचत।${more.hi}`,
  );
}

export const howActive = (walk: boolean): Text =>
  bilingual(walk ? 'walking' : 'cycling', walk ? 'पैदल चलने' : 'साइकिल चलाने');

export const takeTransit = (metro: boolean): Text =>
  metro
    ? bilingual(`Take the metro ${METRO_IF.en}, or else the bus,`, `${METRO_IF.hi} तो मेट्रो लें, नहीं तो बस,`)
    : bilingual(`Take the bus (or the metro, ${METRO_IF.en})`, `बस लें (या मेट्रो, ${METRO_IF.hi}),`);

export interface Leg {
  ratio: number;
  rate: number;
  hours: string;
}

export function accessWalk(minutes: number, w: Leg): Text {
  return bilingual(
    ` plus a ${minutes}-minute walk each way to the stop or station (${w.ratio} × street PM2.5 at ${w.rate} m³/h)`,
    ` और स्टॉप या स्टेशन तक हर तरफ़ ${minutes} मिनट पैदल (सड़क का PM2.5 × ${w.ratio}, ${w.rate} m³/घंटा)`,
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

/** `a` is the current mode's leg and `b` the safer `alt` mode's; `walk` is the walk to and from transit. */
export interface ExposureWorking {
  alt: Commute;
  a: Leg;
  b: Leg;
  walk: Text;
  cut: number;
}

export function exposureWorking({ alt, a, b, walk, cut }: ExposureWorking): Text {
  const mode = MODE_NAME[alt];
  return bilingual(
    `Round trip: ${a.ratio} × street PM2.5 at ${a.rate} m³/h for ${a.hours} h, vs ${b.ratio} × street PM2.5 at ${b.rate} m³/h for ${b.hours} h by ${mode.en}${walk.en}: ${cut}% less PM2.5 inhaled.`,
    `आना-जाना: सड़क का PM2.5 × ${a.ratio}, ${a.rate} m³/घंटा साँस, ${a.hours} घंटे; ${mode.hi} से × ${b.ratio}, ${b.rate} m³/घंटा, ${b.hours} घंटे,${walk.hi}: ${cut}% कम PM2.5।`,
  );
}

export const COMMUTE_SCOPE = bilingual('on your commute', 'आने-जाने में');
