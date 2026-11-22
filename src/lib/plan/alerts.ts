/** Time-critical alerts: the ozone peak and the winter smog trap. Protecting vulnerable people: ./vulnerable.ts. */
import { cautious } from '../concern.js';
import { activityRank } from '../epa.js';
import { INDOOR_OZONE_RATIO, pctCut } from '../impact.js';
import type { Concern, Pollutant, TimeWindow } from '../types.js';
import { TRAP_MIXING_M, TRAP_WIND_KMH } from '../weather.js';
import { OZONE_SENSITIVE_UG, partOfDay } from '../windows.js';
import { weatherFigure } from './figures.js';
import { L, OZONE_CONCERN_UG, SCOPE, forMembers, householdActivity, n, shut, type RecDraft, type RuleInput } from './shared.js';
import { phrase } from './spans.js';

/**
 * Ozone timing advice is proportional: only when ozone drives the AQI and either its peak reaches the concern
 * level or the concern is cautious. A "Good" day with ordinary ozone gets no alarm.
 */
export function ozoneWorthWarning(peak: TimeWindow | null, dominant: Pollutant | null, concern: Concern): boolean {
  if (dominant !== 'o3' || peak?.avgO3 === undefined) return false;
  return peak.avgO3 >= OZONE_CONCERN_UG || cautious(concern);
}

export function ozoneRec(input: RuleInput): RecDraft | null {
  const { profile: p, dominant, ozonePeak, now, concern } = input;
  if (!ozonePeak || !ozoneWorthWarning(ozonePeak, dominant, concern)) return null;
  // A gentle walk is offered only where the EPA guide lets everyone in the household go out; from its "avoid" on,
  // the assistant answers "No" to going out, so the plan does too.
  const gentle = activityRank(householdActivity(input)) >= activityRank('avoid')
    ? L('Exercise indoors today.', 'आज घर में ही व्यायाम करें।')
    : L('Walk gently or exercise indoors.', 'धीरे टहलें या घर में व्यायाम करें।');
  const when = phrase(ozonePeak, now, 'fromTo');
  const part = partOfDay(ozonePeak.start);
  const o3 = ozonePeak.avgO3 ?? 0;
  const cut = pctCut(1, INDOOR_OZONE_RATIO);
  const asthma = forMembers(p, { respiratory: L(' This matters most for anyone with asthma.', ' अस्थमा वालों के लिए यह सबसे ज़रूरी है।') });
  return {
    id: 'ozone-effort',
    category: 'routine',
    priority: 1,
    title: L(`Ozone is the main pollutant: no hard outdoor exercise ${when.en}`, `मुख्य प्रदूषक ओज़ोन है: ${when.hi} बाहर तेज़ व्यायाम न करें`),
    detail: L(
      `Ozone forms in sunlight from traffic and industry fumes; today it peaks in the ${part.en}. It is a gas: masks do not stop it. ${gentle.en}${asthma.en}`,
      `ओज़ोन धूप में गाड़ियों और उद्योगों के धुएँ से बनती है; आज यह ${part.hi} में सबसे ज़्यादा है। यह गैस है: मास्क इसे नहीं रोकता। ${gentle.hi}${asthma.hi}`,
    ),
    explanation: L(
      `Ozone averages ≈ ${n(o3)} µg/m³ in this window (about ${OZONE_SENSITIVE_UG} µg/m³ is unhealthy for sensitive groups). Indoor ozone is typically about ${n(INDOOR_OZONE_RATIO * 100)}% of outdoor, so exercising indoors means ${cut}% less ozone breathed.`,
      `इस समय ओज़ोन औसतन ≈ ${n(o3)} µg/m³ है (लगभग ${OZONE_SENSITIVE_UG} µg/m³ संवेदनशील लोगों के लिए हानिकारक है)। घर के अंदर ओज़ोन आमतौर पर बाहर की लगभग ${n(INDOOR_OZONE_RATIO * 100)}% होती है, इसलिए अंदर व्यायाम से साँस में ओज़ोन ${cut}% कम।`,
    ),
    exposureCutPct: cut,
    scope: SCOPE.exercise,
    pollutant: 'ozone',
    epaActivity: true,
  };
}

export function smogTrapRec({ profile: p, trap, now, mosquitoes }: RuleInput): RecDraft | null {
  if (!trap) return null;
  const windows = shut(p);
  const wind = weatherFigure('wind', trap.avgWindKmh);
  const mixing = weatherFigure('mixing', trap.minMixingM);
  const when = phrase(trap, now, 'fromTo');
  const smoke = mosquitoes ? L('coils', 'कॉइल') : L('candles', 'मोमबत्ती');
  return {
    id: 'smog-trap',
    category: 'routine',
    priority: 1,
    title: L(`Smog trap ${when.en}: shut windows before it starts, and burn nothing`, `${when.hi} स्मॉग जाल: शुरू होने से पहले खिड़कियाँ बंद करें, और कुछ न जलाएँ`),
    detail: L(
      `Cold, still air will sit low over the city like a lid, so smoke from traffic, cooking and burning stays at breathing height. Close windows before it starts, run any purifier, and skip incense, ${smoke.en} and wood fires.`,
      `ठंडी, रुकी हुई हवा शहर पर ढक्कन की तरह बैठ जाएगी, इसलिए गाड़ियों, खाने और जलाने का धुआँ साँस की ऊँचाई पर ही रहेगा। शुरू होने से पहले खिड़कियाँ बंद करें, प्यूरीफ़ायर चलाएँ, और अगरबत्ती, ${smoke.hi} या लकड़ी न जलाएँ।`,
    ),
    explanation: L(
      `Forecast wind ${wind.en} and a mixing layer ${mixing.en} deep (a trap is wind under ${TRAP_WIND_KMH} km/h and a layer under ${TRAP_MIXING_M} m). ${windows.working.en}`,
      `पूर्वानुमान: हवा ${wind.hi} और मिश्रण परत ${mixing.hi} (जाल का मतलब: हवा ${TRAP_WIND_KMH} किमी/घंटा से कम और परत ${TRAP_MIXING_M} मीटर से कम)। ${windows.working.hi}`,
    ),
    exposureCutPct: windows.cut,
    scope: L('at home during the trap', 'जाल के दौरान घर पर'),
    shutsWindows: true,
    smogDefence: true,
  };
}
