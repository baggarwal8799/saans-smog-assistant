/**
 * Community action for the whole winter season: pooled rides, a no-burning pledge and a shared clean room, each
 * with its impact worked out from stated assumptions and, where it scales, the household's own data. These are
 * community figures, so they are never added to the household's own total.
 */
import { cautious } from '../concern.js';
import {
  EMISSION_KG_PER_KM,
  INDOOR_RATIO,
  WASTE_BURNED_KG_PER_PERSON_WEEK,
  WASTE_BURNING_PM25_G_PER_KG,
  WEEKS_PER_MONTH,
  WORKDAYS_PER_MONTH,
  monthlyCommuteCo2Kg,
  pctCut,
  round,
} from '../impact.js';
import { HEAVY_EXERTION_AQI, L, joinList, local, n, persons, type RecDraft, type RuleInput, type Text } from './shared.js';
import { wastePm25GPerMonth } from './swaps.js';

/** Stated assumptions: four people to a pooled car; a pledge signed by 20 homes on one street or block. */
const POOL = 4;
const PLEDGE_HOMES = 20;
/** The route used for people who do not drive, so the pool figure is a labelled example, not their own. */
const EXAMPLE_KM = 10;

/** The pool on offer: a carpool for a driver, a school-run pool for a family with children, else none. */
function poolName(car: boolean, kids: boolean): Text | null {
  if (car && kids) return L('a carpool or school-run pool', 'कारपूल या स्कूल के लिए साझा गाड़ी');
  if (car) return L('a carpool', 'कारपूल');
  return kids ? L('a school-run pool', 'स्कूल के लिए साझा गाड़ी') : null;
}

/** "a; b; and c" / "a; b; और c": the steps, which contain commas of their own. */
const steps = (items: readonly string[], and: string): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join('; ')}; ${and} ${items[items.length - 1] ?? ''}`;

export function communityRec({ profile: p, concern, india }: RuleInput): RecDraft | null {
  const own = p.commuteMode === 'car' && p.commuteKm > 0;
  const pool = poolName(p.commuteMode === 'car', p.hasChildren);
  // A shared clean room keeps outdoor smog out, so on a clean-air day it is not suggested and claims no cut. The
  // no-burning pledge applies everywhere, because winter smoke comes from burning in every city: leaves and garbage
  // in India, wood stoves, fireplaces and garden waste elsewhere. So every household gets at least one community step.
  const room = concern !== 'low';
  const km = own ? p.commuteKm : EXAMPLE_KM;
  const cars = POOL - 1;
  const kg = pool ? round(monthlyCommuteCo2Kg('car', km) * cars, 1) : 0;
  const monthKm = n(km * 2 * WORKDAYS_PER_MONTH);
  const who = persons(p.householdSize);
  const pledge = wastePm25GPerMonth(PLEDGE_HOMES * p.householdSize);
  const { closed, purifier } = INDOOR_RATIO;
  const roomCut = pctCut(closed, purifier);
  const pct = (r: number): string => n(r * 100);
  const limit = HEAVY_EXERTION_AQI;
  const pick = <T>(poolPart: T, pledgePart: T, roomPart: T): T[] => [...(pool ? [poolPart] : []), pledgePart, ...(room ? [roomPart] : [])];
  const list = (en: readonly string[], hi: readonly string[]): Text => L(steps(en, 'and'), steps(hi, 'और'));
  const named = pick(L('pool rides', 'साझा सवारी'), L('stop burning', 'जलाना बंद'), L('share a clean room', 'एक साझा साफ़ कमरा'));
  const lead = named.length > 1 ? L('Set these up', 'ये काम शुरू करें') : L('Set this up', 'यह काम शुरू करें');
  const cleanEn = (place: string): string => `one purifier in a shared clean room or ${place} where those most at risk can sit on smoggy days`;
  const cleanHi = (place: string): string => `एक साझा साफ़ कमरे या ${place} में एक प्यूरीफ़ायर, जहाँ स्मॉग वाले दिनों में सबसे ज़्यादा जोखिम वाले लोग बैठ सकें`;
  const pledgeEn = (burnt: string, to: string): string => `a no-burning pledge for ${burnt}, with any open fire reported to the ${to}`;
  const pledgeHi = (burnt: string, to: string): string => `${burnt} न जलाने का संकल्प, और कहीं खुले में आग दिखे तो ${to} से शिकायत`;
  const what = (burnt: Text, to: Text, place: Text): Text =>
    list(pick(pool?.en ?? '', pledgeEn(burnt.en, to.en), cleanEn(place.en)), pick(pool?.hi ?? '', pledgeHi(burnt.hi, to.hi), cleanHi(place.hi)));
  const inIndia = what(L('leaves and garbage', 'पत्ते और कूड़ा'), L('municipality', 'नगर निगम'), L('crèche', 'क्रेच'));
  const abroad = what(
    L('garden waste, and wood stoves or fireplaces on smoggy days', 'बगीचे का कचरा, और स्मॉग वाले दिनों में लकड़ी का चूल्हा या फ़ायरप्लेस'),
    L('council', 'स्थानीय प्रशासन'),
    L('nursery', 'नर्सरी'),
  );
  const title = joinList(named);
  return {
    id: 'community-plan',
    category: 'community',
    priority: cautious(concern) ? 2 : 3,
    title: L(`Plan with neighbours: ${title.en}`, `पड़ोसियों के साथ: ${title.hi}`),
    detail: local(
      india,
      L(
        `${lead.en} with your RWA or school this winter: ${inIndia.en}. Ask them too to move assemblies and sports indoors when AQI is above ${limit}.`,
        `इस सर्दी अपनी RWA या स्कूल के साथ ${lead.hi}: ${inIndia.hi}। उनसे यह भी कहें कि AQI ${limit} से ऊपर हो तो प्रार्थना सभा और खेल अंदर कराएँ।`,
      ),
      L(
        `${lead.en} with your residents’ association or school this winter: ${abroad.en}. Ask them too to move assemblies and sports indoors when AQI is above ${limit}.`,
        `इस सर्दी अपने निवासी संघ या स्कूल के साथ ${lead.hi}: ${abroad.hi}। उनसे यह भी कहें कि AQI ${limit} से ऊपर हो तो सभा और खेल अंदर कराएँ।`,
      ),
    ),
    explanation: L(
      [...pick(
        `Carpool: ${POOL} to a car on ${own ? 'your' : 'an example'} ${km} km route takes ${cars} cars off the road: ${cars} × ${monthKm} km a month × ${EMISSION_KG_PER_KM.car} kg CO₂/km ≈ ${kg} kg CO₂.`,
        `Pledge: ${PLEDGE_HOMES} homes × ${who.en} × ${WASTE_BURNED_KG_PER_PERSON_WEEK} kg burned a week × ${WASTE_BURNING_PM25_G_PER_KG} g/kg × ${WEEKS_PER_MONTH} weeks ≈ ${pledge} g of PM2.5 a month kept out of the street’s air.`,
        `Clean room: a purifier with the door shut brings PM2.5 from ≈ ${pct(closed)}% to ≈ ${pct(purifier)}% of outside, ${roomCut}% less for those inside.`,
      ), 'These are community figures, not added to your own total.'].join(' '),
      [...pick(
        `कारपूल: ${own ? 'आपके' : 'उदाहरण के'} ${km} किमी रास्ते पर एक गाड़ी में ${POOL} लोग, यानी सड़क से ${cars} गाड़ियाँ कम: ${cars} × हर महीने ${monthKm} किमी × ${EMISSION_KG_PER_KM.car} किग्रा CO₂/किमी ≈ ${kg} किग्रा CO₂।`,
        `संकल्प: ${PLEDGE_HOMES} घर × ${who.hi} × हफ़्ते में ${WASTE_BURNED_KG_PER_PERSON_WEEK} किलो × ${WASTE_BURNING_PM25_G_PER_KG} ग्राम/किलो × ${WEEKS_PER_MONTH} हफ़्ते ≈ हर महीने ${pledge} ग्राम PM2.5 गली की हवा से बाहर।`,
        `साफ़ कमरा: दरवाज़ा बंद करके प्यूरीफ़ायर चलाने से PM2.5 बाहर के ≈ ${pct(closed)}% से ≈ ${pct(purifier)}% रह जाता है, अंदर बैठे लोगों के लिए ${roomCut}% कम।`,
      ), 'ये समुदाय के आँकड़े हैं, आपके अपने कुल में नहीं जोड़े गए।'].join(' '),
    ),
    ...(pool ? { co2KgPerMonth: kg } : {}),
    // The pledge takes burning smoke out of the street's air: a source removed, counted for the community only.
    removesSource: true,
    ...(room ? { exposureCutPct: roomCut, scope: L('in the shared room', 'साझा कमरे में') } : {}),
    community: true,
  };
}
