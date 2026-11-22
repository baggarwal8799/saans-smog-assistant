/** Indoor air quality: when to air the house, purifiers, and cleaning. */
import { fineToGoOut, scaled } from '../concern.js';
import { INDOOR_RATIO, PEOPLE_PER_ROOM, WET_CLEAN_CUT, pctCut, round, shutRatio } from '../impact.js';
import type { SmogTrap, TimeWindow } from '../types.js';
import { L, SCOPE, n, persons, shut, type RecDraft, type RuleInput, type Text } from './shared.js';
import { phrase } from './spans.js';

/** Where the window sits relative to the trap, worked out from the times rather than assumed. */
function trapOrder(best: TimeWindow, trap: SmogTrap | null): Text {
  if (!trap) return L('', '');
  if (best.end <= trap.start) return L(' This is before the smog trap sets in.', ' यह स्मॉग जाल शुरू होने से पहले का समय है।');
  return L(' This is after the smog trap lifts.', ' यह स्मॉग जाल हटने के बाद का समय है।');
}

/**
 * Opening windows wide is honest only when the air let in is no dirtier than the air already indoors (shut windows,
 * INDOOR_RATIO.closed × the day's average), or is at most Moderate.
 */
export const airingWide = (best: TimeWindow, avg: number): boolean => best.avgPm25 <= avg * INDOOR_RATIO.closed || fineToGoOut(best.avgPm25);

/**
 * When outdoor air is at most Moderate and no smog trap is coming, shutting windows only traps the CO₂, moisture
 * and (with gas cooking) nitrogen dioxide made indoors, so the tip is normal airing, timed at the cleanest hours.
 */
function normalAiring({ profile: p, avg, best, now }: RuleInput, cut: number): RecDraft | null {
  if (!best || cut < 1 || !airingWide(best, avg)) return null;
  const when = phrase(best, now, 'around');
  const gas = p.cooking === 'lpg' || p.cooking === 'png';
  const cooking = gas
    ? L(' Always open a window while cooking on gas: the flame adds nitrogen dioxide and CO₂ that build up without fresh air.', ' गैस पर खाना बनाते समय खिड़की ज़रूर खोलें: लौ से नाइट्रोजन डाइऑक्साइड और CO₂ बनती है, जो ताज़ी हवा के बिना जमा होती है।')
    : L(' Open a window while cooking, too.', ' खाना बनाते समय भी खिड़की खोलें।');
  return {
    id: 'ventilate-smart',
    category: 'indoor',
    priority: 3,
    title: L(`Air the house as usual, ideally ${when.en}`, `घर में रोज़ की तरह हवा आने दें, हो सके तो ${when.hi}`),
    detail: L(
      `Outdoor air is at most Moderate today, so open the windows wide as usual.${cooking.en}`,
      `आज बाहर की हवा ज़्यादा से ज़्यादा ‘मध्यम’ है, इसलिए खिड़कियाँ रोज़ की तरह पूरी खोलें।${cooking.hi}`,
    ),
    explanation: L(
      `Outdoor PM2.5 averages ≈ ${n(best.avgPm25)} µg/m³ in this window vs ≈ ${n(avg)} µg/m³ over the day, so the air you let in then is ${cut}% cleaner. Airing clears CO₂, moisture and cooking fumes.`,
      `इस समय बाहर का PM2.5 औसतन ≈ ${n(best.avgPm25)} µg/m³ है, जबकि दिन का औसत ≈ ${n(avg)} µg/m³, यानी तब अंदर आने वाली हवा ${cut}% साफ़। हवा आने से CO₂, नमी और खाने का धुआँ निकलता है।`,
    ),
    exposureCutPct: cut,
    scope: L('in the air you let in', 'अंदर आने वाली हवा में'),
  };
}

/**
 * `best` is already chosen outside any smog trap, so this never says "air the house" during one. On a clean-air
 * day there is nothing to time and nothing to shut out, so there is no tip; on a Moderate one it is normal airing.
 */
export function ventilateRec(input: RuleInput): RecDraft | null {
  const { profile: p, concern, avg, best, now, trap } = input;
  if (concern === 'low') return null;
  const priority = scaled(concern, 'severe');
  // Air the house when the outdoor air is cleanest instead of at a random time of day.
  const cut = best ? pctCut(avg, best.avgPm25) : 0;
  if (concern === 'moderate' && !trap) return normalAiring(input, cut);
  const order = best ? trapOrder(best, trap) : L('', '');
  if (best && cut >= 1 && airingWide(best, avg)) {
    const when = phrase(best, now, 'around');
    return {
      id: 'ventilate-smart',
      category: 'indoor',
      priority,
      title: L(`Air the house only ${when.en}`, `घर में हवा सिर्फ़ ${when.hi} आने दें`),
      detail: L(
        `Open windows wide for 10–15 minutes so stale air and moisture leave, then shut them again.${order.en} Seal big gaps with a wet towel or tape on very bad days.`,
        `खिड़कियाँ 10–15 मिनट पूरी खोलें ताकि बासी हवा और नमी निकल जाए, फिर बंद कर दें।${order.hi} बहुत खराब दिनों में बड़ी दरारें गीले तौलिये या टेप से बंद करें।`,
      ),
      explanation: L(
        `Outdoor PM2.5 averages ≈ ${n(best.avgPm25)} µg/m³ in this window vs ≈ ${n(avg)} µg/m³ over the day, so the air you let in is ${cut}% cleaner. A short airing clears CO₂ and moisture from breathing and cooking.`,
        `इस समय बाहर का PM2.5 औसतन ≈ ${n(best.avgPm25)} µg/m³ है, जबकि दिन का औसत ≈ ${n(avg)} µg/m³, यानी अंदर आने वाली हवा ${cut}% साफ़। थोड़ी देर हवा आने से साँस और खाने की CO₂ और नमी निकलती है।`,
      ),
      exposureCutPct: cut,
      scope: L('in the air you let in', 'अंदर आने वाली हवा में'),
      shutsWindows: true,
      smogDefence: true,
    };
  }
  // Outdoor air dirtier than indoors all day: the PM2.5 cut comes from keeping windows shut, and the airing is only a
  // brief one for fresh air and moisture. During a trap it waits until the trap lifts.
  const when = best
    ? phrase(best, now, 'around')
    : trap
      ? L('once the smog trap lifts', 'स्मॉग जाल हटने के बाद')
      : L('in the warmest part of the afternoon, when the air mixes most', 'दोपहर में सबसे गर्म समय पर, जब हवा सबसे ज़्यादा मिलती है');
  const indoor = n(avg * shutRatio(p));
  const windows = shut(p);
  const note = best
    ? L(
        ` Even then outdoor PM2.5 ≈ ${n(best.avgPm25)} µg/m³ is above the ≈ ${indoor} µg/m³ indoors with windows shut, so the airing is for fresh air and moisture, not cleaner air.`,
        ` तब भी बाहर का PM2.5 ≈ ${n(best.avgPm25)} µg/m³ बंद खिड़कियों वाले अंदर के ≈ ${indoor} µg/m³ से ज़्यादा है, इसलिए यह हवा ताज़गी और नमी के लिए है, साफ़ हवा के लिए नहीं।`,
      )
    : L('', '');
  return {
    id: 'ventilate-smart',
    category: 'indoor',
    priority,
    title: L(`Keep windows shut; air out briefly ${when.en}`, `खिड़कियाँ बंद रखें; ${when.hi} थोड़ी देर हवा आने दें`),
    detail: L(
      `${best ? 'Outdoor air stays dirtier than the air indoors even at its least polluted' : 'The forecast has no clean window'}, so keep windows shut. For fresh air and moisture, give the house a brief 5–10 minute airing ${when.en}, then shut them again.${order.en}`,
      `${best ? 'सबसे कम प्रदूषित समय में भी बाहर की हवा अंदर से ज़्यादा गंदी है' : 'पूर्वानुमान में कोई साफ़ समय नहीं है'}, इसलिए खिड़कियाँ बंद रखें। ताज़ी हवा और नमी निकालने के लिए ${when.hi} सिर्फ़ 5–10 मिनट हवा आने दें, फिर बंद कर दें।${order.hi}`,
    ),
    explanation: L(windows.working.en + note.en, windows.working.hi + note.hi),
    exposureCutPct: windows.cut,
    scope: SCOPE.home,
    shutsWindows: true,
    smogDefence: true,
  };
}

/** How many rooms the household needs covered: one purifier cleans one closed room. */
function coverage(people: number): Text {
  const rooms = Math.ceil(people / PEOPLE_PER_ROOM);
  const who = persons(people);
  return L(
    ` One unit cleans one closed room: ${who.en} ÷ ${PEOPLE_PER_ROOM} per bedroom ≈ ${rooms} ${rooms === 1 ? 'unit' : 'units'}.`,
    ` एक यूनिट एक बंद कमरा साफ़ करती है: ${who.hi} ÷ ${PEOPLE_PER_ROOM} प्रति कमरा ≈ ${rooms} यूनिट।`,
  );
}

/**
 * Building a filter matters from "sensitive groups" up. A household that already has a purifier gets no tip: its
 * dose baseline already counts the purifier running, and a tip must change something it does not already do.
 */
export function purifierRec({ profile: p, avg, concern }: RuleInput): RecDraft | null {
  if (p.hasPurifier) return null;
  const pct = (ratio: number): string => n(ratio * 100);
  const { closed, diyFilter } = INDOOR_RATIO;
  const rooms = coverage(p.householdSize);
  const cut = pctCut(closed, diyFilter);
  return {
    id: 'diy-purifier',
    category: 'indoor',
    priority: scaled(concern, 'high'),
    title: L('Build a DIY box-fan air purifier', 'घर पर बॉक्स-फ़ैन एयर प्यूरीफ़ायर बनाएँ'),
    detail: L(
      `Tape a MERV-13 or HEPA-grade filter to the back of a box or table fan, with the airflow arrow pointing into the fan. It costs a fraction of a branded purifier. Run it in the room where you sleep.${rooms.en}`,
      `एक बॉक्स या टेबल फ़ैन के पीछे MERV-13 या HEPA-ग्रेड फ़िल्टर टेप करें, हवा का तीर फ़ैन की ओर रहे। यह ब्रांडेड प्यूरीफ़ायर से बहुत सस्ता है। जिस कमरे में सोते हैं, वहाँ चलाएँ।${rooms.hi}`,
    ),
    explanation: L(
      `Tests of fan-filter units show indoor PM2.5 dropping from ≈ ${pct(closed)}% to ≈ ${pct(diyFilter)}% of outside: here ≈ ${n(avg * closed)} → ${n(avg * diyFilter)} µg/m³, ${cut}% less while you are home.`,
      `फ़ैन-फ़िल्टर के परीक्षणों में अंदर का PM2.5 बाहर के ≈ ${pct(closed)}% से ≈ ${pct(diyFilter)}% तक घटता है: यहाँ ≈ ${n(avg * closed)} → ${n(avg * diyFilter)} µg/m³, घर पर ${cut}% कम।`,
    ),
    exposureCutPct: cut,
    scope: SCOPE.home,
    smogDefence: true,
  };
}

export function cleaningRec(): RecDraft {
  const pct = round(WET_CLEAN_CUT * 100);
  return {
    id: 'wet-clean',
    category: 'indoor',
    priority: 3,
    title: L('Wet-mop instead of sweeping; skip the “air-purifying plant” myth', 'झाड़ू की जगह गीला पोंछा लगाएँ; “हवा साफ़ करने वाले पौधों” के भ्रम में न पड़ें'),
    detail: L(
      'Dry sweeping throws settled dust back into the air. Wipe surfaces with a damp cloth. Houseplants are nice, but you would need hundreds per room to match one purifier.',
      'सूखी झाड़ू जमी धूल को फिर हवा में उड़ा देती है। गीले कपड़े से सतह पोंछें। पौधे अच्छे हैं, पर एक प्यूरीफ़ायर जितना असर पाने के लिए हर कमरे में सैकड़ों पौधे चाहिए।',
    ),
    explanation: L(
      `Dry sweeping lifts settled dust back into the air; we count ${pct}% less PM2.5 at home from damp cleaning. That is an assumed figure, kept low because sweeping mostly lifts coarser dust rather than fine particles. A 2019 review (Cummings & Waring) found plants clear indoor air 100–1000× slower than normal ventilation, so we give plants no impact.`,
      `सूखी झाड़ू जमी धूल को फिर हवा में उड़ाती है; गीली सफ़ाई से हम घर पर PM2.5 में ${pct}% कमी मानते हैं। यह अनुमान है, जिसे कम रखा गया है क्योंकि झाड़ू से ज़्यादातर मोटी धूल उड़ती है, बारीक कण कम। 2019 की समीक्षा (Cummings & Waring) में पौधे सामान्य वेंटिलेशन से 100–1000 गुना धीमे पाए गए, इसलिए हम पौधों का कोई असर नहीं गिनते।`,
    ),
    exposureCutPct: pct,
    // A cut in dust the household stirs up, not in outdoor smog, so the dose model does not count it.
    scope: L('from stirred-up dust', 'उड़ी धूल से'),
    unreported: true,
  };
}
