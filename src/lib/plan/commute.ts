/** Commute tips: an emissions-driven switch to a cleaner mode, or an exposure-driven one for walkers and cyclists. */
import { ACCESS_WALK_MIN_EACH_WAY, EMISSION_KG_PER_KM, TRANSIT_BREATHING, TRANSIT_EXPOSURE_RATIO, commuteCo2SavingKg, commuteDoseFactor, commuteHoursPerDay, pctCut, round } from '../impact.js';
import type { AqiLevel } from '../aqi.js';
import { activeTravelOk, cautious } from '../concern.js';
import type { Commute } from '../types.js';
import { L, METRO_IF, MODE_NAME, n, selfActivity, type RecDraft, type RuleInput, type Text } from './shared.js';

/** A switch must cut the trip's emissions by at least this share to be worth suggesting. */
const MEANINGFUL_CUT = 0.25;
const ACTIVE: ReadonlySet<Commute> = new Set(['walk', 'bicycle']);

/**
 * Which cleaner mode to suggest for a trip, or null when nothing is clearly cleaner. Never suggests a mode that
 * emits more. The bus, which runs almost everywhere, comes first; the metro only where the bus is not clearly cleaner
 * (an auto-rickshaw emits less per km than a bus). Walking and cycling only where the EPA guide (for this band and
 * person) puts no limit on exertion.
 */
export function suggestCommute(current: Commute, kmOneWay: number, band: AqiLevel, sensitive = false): Commute | null {
  const ef = EMISSION_KG_PER_KM;
  if (current === 'wfh' || kmOneWay <= 0 || ef[current] === 0) return null;
  const activeOk = activeTravelOk(band, sensitive);
  if (kmOneWay <= 3 && activeOk) return 'walk';
  if (kmOneWay <= 8 && activeOk) return 'bicycle';
  const options: Commute[] = ['bus', 'metro'];
  return options.find((m) => ef[m] <= ef[current] * (1 - MEANINGFUL_CUT)) ?? null;
}

const SWITCH_DETAIL: Readonly<Record<'bus' | 'metro' | 'active', Text>> = {
  bus: L(
    `Public transport takes cars off the road, which is where most winter tailpipe smoke comes from. The metro is cleaner still, ${METRO_IF.en}.`,
    `सार्वजनिक परिवहन सड़क से गाड़ियाँ कम करता है, और सर्दियों का ज़्यादातर धुआँ इन्हीं से आता है। ${METRO_IF.hi}, तो वह और भी साफ़ है।`,
  ),
  metro: L(
    `Take the metro ${METRO_IF.en}: trains run on electricity and keep you out of roadside smoke. No metro? A shared or electric ride also cuts emissions.`,
    `${METRO_IF.hi}, तो मेट्रो लें: यह बिजली से चलती है और आपको सड़क किनारे के धुएँ से दूर रखती है। मेट्रो नहीं? साझा या इलेक्ट्रिक सवारी भी उत्सर्जन घटाती है।`,
  ),
  active: L(
    'Your trip is short enough to walk or cycle, and today’s air allows it. That removes your vehicle’s exhaust from the street.',
    'आपकी दूरी पैदल या साइकिल के लिए कम है, और आज की हवा इसकी इजाज़त देती है। इससे सड़क से आपकी गाड़ी का धुआँ हटता है।',
  ),
};

/** Said only on days the mask tip itself is given, so no tip mentions a mask the plan does not recommend. */
const MASK_WALK = L(' Wear an N95 for the walk to the stop or station.', ' स्टॉप या स्टेशन तक N95 पहनें।');

const CARPOOL = L(
  ' Can’t switch? Share the ride with one colleague, which halves your share of the emissions, and switch the engine off at long red lights.',
  ' बदल नहीं सकते? एक साथी के साथ गाड़ी बाँटें, इससे आपके हिस्से का उत्सर्जन आधा हो जाता है, और लंबी लाल बत्ती पर इंजन बंद करें।',
);

/** Where the EPA guide says to avoid all physical activity outdoors, a trip not made is the first advice. */
const stayHome = (input: RuleInput): Text =>
  selfActivity(input) === 'avoidAll'
    ? L(' US EPA advises avoiding all physical activity outdoors today: work from home if you can.', ' US EPA के अनुसार आज बाहर हर शारीरिक गतिविधि से बचें: हो सके तो घर से काम करें।')
    : L('', '');

/** Emissions-driven: a cleaner mode for a vehicle commute. */
export function commuteRec(input: RuleInput): RecDraft | null {
  const { profile: p, concern, band } = input;
  const alt = suggestCommute(p.commuteMode, p.commuteKm, band, p.hasRespiratory);
  if (!alt) return null;
  // The chip and the working show the same rounded figure.
  const kg = round(commuteCo2SavingKg(p.commuteMode, alt, p.commuteKm), 1);
  if (kg <= 0) return null;
  const from = MODE_NAME[p.commuteMode];
  const to = MODE_NAME[alt];
  const km = n(p.commuteKm * 2 * 22);
  const ef = EMISSION_KG_PER_KM;
  // Carpooling is the fallback for drivers who cannot switch, so it lives inside this tip instead of competing
  // with it as a second, bigger-looking number.
  const fallback = p.commuteMode === 'car' ? CARPOOL : L('', '');
  const transit = alt === 'bus' || alt === 'metro';
  const detail = SWITCH_DETAIL[transit ? alt : 'active'];
  const mask = transit && cautious(concern) ? MASK_WALK : L('', '');
  const home = stayHome(input);
  return {
    id: 'commute-switch',
    category: 'routine',
    priority: 1,
    title: L(`Switch your ${from.en} commute to ${to.en}`, `${from.hi} की जगह ${to.hi} से आना-जाना करें`),
    detail: L(detail.en + mask.en + fallback.en + home.en, detail.hi + mask.hi + fallback.hi + home.hi),
    explanation: L(
      `${km} km a month × (${ef[p.commuteMode]} − ${ef[alt]}) kg CO₂/km = ${kg} kg CO₂ saved.${alt === 'bus' ? ` If a metro line serves your route, the metro (${ef.metro} kg/km) would save even more.` : ''}`,
      `हर महीने ${km} किमी × (${ef[p.commuteMode]} − ${ef[alt]}) किग्रा CO₂/किमी = ${kg} किग्रा CO₂ की बचत।${alt === 'bus' ? ` ${METRO_IF.hi}, तो मेट्रो (${ef.metro} किग्रा/किमी) से और ज़्यादा बचत होगी।` : ''}`,
    ),
    co2KgPerMonth: kg,
  };
}

/** The public-transport mode that puts the least street PM2.5 in your lungs over this trip. */
export const safestTransit = (km: number): Commute => (commuteDoseFactor('metro', km) <= commuteDoseFactor('bus', km) ? 'metro' : 'bus');

/**
 * Exposure-driven: walkers and cyclists already emit nothing, but above the active-travel limit their deep
 * breathing at the roadside is the problem, so the metro (or bus) on bad days protects their lungs.
 */
export function commuteExposureRec(input: RuleInput): RecDraft | null {
  const { profile: p, band } = input;
  const mode = p.commuteMode;
  if (!ACTIVE.has(mode) || p.commuteKm <= 0 || activeTravelOk(band, p.hasRespiratory)) return null;
  const home = stayHome(input);
  const alt = safestTransit(p.commuteKm);
  const before = commuteDoseFactor(mode, p.commuteKm);
  const after = commuteDoseFactor(alt, p.commuteKm);
  const cut = pctCut(before, after);
  const how = L(mode === 'walk' ? 'walking' : 'cycling', mode === 'walk' ? 'पैदल चलने' : 'साइकिल चलाने');
  const take =
    alt === 'metro'
      ? L(`Take the metro ${METRO_IF.en}, or else the bus,`, `${METRO_IF.hi} तो मेट्रो लें, नहीं तो बस,`)
      : L(`Take the bus (or the metro, ${METRO_IF.en})`, `बस लें (या मेट्रो, ${METRO_IF.hi}),`);
  const leg = (m: Commute) => ({
    ratio: TRANSIT_EXPOSURE_RATIO[m],
    rate: TRANSIT_BREATHING[m],
    hours: n(commuteHoursPerDay(m, p.commuteKm), 1),
  });
  const a = leg(mode);
  const b = leg(alt);
  const w = leg('walk');
  const walk = L(
    ` plus a ${ACCESS_WALK_MIN_EACH_WAY}-minute walk each way to the stop or station (${w.ratio} × street PM2.5 at ${w.rate} m³/h)`,
    ` और स्टॉप या स्टेशन तक हर तरफ़ ${ACCESS_WALK_MIN_EACH_WAY} मिनट पैदल (सड़क का PM2.5 × ${w.ratio}, ${w.rate} m³/घंटा)`,
  );
  return {
    id: 'commute-exposure',
    category: 'routine',
    priority: 1,
    title: L(`Today, take the ${MODE_NAME[alt].en} instead of ${how.en}`, `आज ${how.hi} की जगह ${MODE_NAME[alt].hi} लें`),
    detail: L(
      `On a day this smoggy, ${how.en} at the roadside means breathing hard in the dirtiest air. ${take.en} and go back to ${how.en} once the air improves.${home.en}`,
      `इतनी स्मॉग वाले दिन सड़क किनारे ${how.hi} का मतलब है सबसे गंदी हवा में तेज़ साँस लेना। ${take.hi} और हवा सुधरने पर फिर से ${how.hi} लगें।${home.hi}`,
    ),
    explanation: L(
      `Round trip: ${a.ratio} × street PM2.5 at ${a.rate} m³/h for ${a.hours} h, vs ${b.ratio} × street PM2.5 at ${b.rate} m³/h for ${b.hours} h by ${MODE_NAME[alt].en}${walk.en}: ${cut}% less PM2.5 inhaled.`,
      `आना-जाना: सड़क का PM2.5 × ${a.ratio}, ${a.rate} m³/घंटा साँस, ${a.hours} घंटे; ${MODE_NAME[alt].hi} से × ${b.ratio}, ${b.rate} m³/घंटा, ${b.hours} घंटे,${walk.hi}: ${cut}% कम PM2.5।`,
    ),
    exposureCutPct: cut,
    scope: L('on your commute', 'आने-जाने में'),
    smogDefence: true,
  };
}
