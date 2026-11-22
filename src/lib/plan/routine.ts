/** Low-emission daily routine: when and where to exercise, and masks. Commute tips live in ./commute.ts. */
import { cautious, fineToGoOut } from '../concern.js';
import { BREATHING_M3_PER_H, N95_REAL_WORLD_FILTRATION, indoorCut, pctCut, round, shutRatio } from '../impact.js';
import { partOfDay } from '../windows.js';
import { CHILD_MASK_NOTE, L, SCOPE, forMembers, memberNames, membersActivity, membersOf, n, selfActivity, type RecDraft, type RuleInput } from './shared.js';
import { phrase } from './spans.js';

export function exerciseRec(input: RuleInput): RecDraft | null {
  const { profile: p, concern, avg, best, now } = input;
  if (p.exerciseMinutes <= 0) return null;
  // A workout is the "prolonged or heavy exertion" the EPA guide limits, so it moves indoors wherever the guide puts
  // any limit on the person exercising. With no clean window on a day that is not "Good", indoors is the safe default.
  const self = selfActivity(input);
  if (self !== 'fine' || (!best && concern !== 'low')) {
    const reduceOnly = self === 'reduce' || self === 'fine';
    const ratio = shutRatio(p);
    const cut = indoorCut(p, 1);
    return {
      id: 'exercise-indoors',
      category: 'routine',
      priority: 1,
      // Where the guide only says "reduce" (Unhealthy air, no sensitive condition), the advice says reduce, with
      // indoors as the way to do it; from "avoid" on, the workout moves indoors.
      title: reduceOnly
        ? L('Keep today’s workout short and light, or move it indoors', 'आज व्यायाम छोटा और हल्का रखें, या घर के अंदर करें')
        : L('Move today’s workout indoors', 'आज का व्यायाम घर के अंदर करें'),
      detail: L(
        `Hard exercise makes you breathe about six times more air than resting. ${reduceOnly ? 'US EPA advises reducing prolonged or heavy exertion outdoors at this level; the simplest way is yoga, skipping or stair climbing' : 'Do yoga, skipping or stair climbing'} indoors with windows shut instead.`,
        `तेज़ व्यायाम में आराम के मुकाबले लगभग छह गुना ज़्यादा हवा साँस में जाती है। ${reduceOnly ? 'इस स्तर पर US EPA बाहर लंबा या तेज़ व्यायाम कम करने की सलाह देता है; सबसे आसान तरीका है ' : ''}खिड़कियाँ बंद रखकर घर में योग, रस्सी कूद या सीढ़ियाँ चढ़ें।`,
      ),
      explanation: L(
        `Outdoors ≈ ${n(avg)} µg/m³; indoors with windows shut ≈ ${n(avg * ratio)} µg/m³ (${n(ratio * 100)}% of outside). Breathing ${BREATHING_M3_PER_H.heavy} m³/h either way, so ${cut}% less PM2.5.`,
        `बाहर ≈ ${n(avg)} µg/m³; बंद खिड़कियों के साथ अंदर ≈ ${n(avg * ratio)} µg/m³ (बाहर का ${n(ratio * 100)}%)। दोनों में ${BREATHING_M3_PER_H.heavy} m³/घंटा साँस, यानी ${cut}% कम PM2.5।`,
      ),
      exposureCutPct: cut,
      scope: SCOPE.exercise,
      shutsWindows: true,
      smogDefence: true,
      epaActivity: true,
    };
  }
  if (!best) return null;
  const cut = pctCut(avg, best.avgPm25);
  const when = phrase(best, now, 'between');
  const who = memberNames(p);
  // Sensitive members get the guide's own limit for this band, which here is at most "reduce".
  const light = membersActivity(input) !== 'fine' && membersOf(p).length > 0
    ? L(` Today, ${who.en} should keep it light or exercise indoors.`, ` आज ${who.hi} को हल्का व्यायाम करना चाहिए या घर में करना चाहिए।`)
    : L('', '');
  const part = partOfDay(best.start);
  // "Cleanest" only when this window's own air is at most Moderate; otherwise it is just the least polluted.
  const fine = fineToGoOut(best.avgPm25);
  const why = fine
    ? L(`This ${part.en} window is the cleanest in the forecast.`, `पूर्वानुमान में ${part.hi} का यह समय सबसे साफ़ है।`)
    : L(`This ${part.en} window is the least polluted in the forecast, but its PM2.5 is still above the Moderate band.`, `पूर्वानुमान में ${part.hi} का यह समय सबसे कम प्रदूषित है, पर इसका PM2.5 अब भी ‘मध्यम’ स्तर से ऊपर है।`);
  return {
    id: 'exercise-window',
    category: 'routine',
    priority: cut >= 15 ? 1 : 2,
    title: fine
      ? L(`Exercise outside ${when.en}`, `बाहर व्यायाम ${when.hi} करें`)
      : L(`If you must exercise outside, go ${when.en}`, `बाहर व्यायाम करना ही हो तो ${when.hi} करें`),
    detail: L(
      `${why.en} Avoid main roads and keep it to moderate effort.${light.en}`,
      `${why.hi} मुख्य सड़कों से दूर रहें और हल्का-मध्यम व्यायाम करें।${light.hi}`,
    ),
    explanation: L(
      `PM2.5 averages ${n(best.avgPm25)} µg/m³ in this window vs ${n(avg)} µg/m³ over the day: ${cut}% less inhaled for the same workout.`,
      `इस समय PM2.5 औसतन ${n(best.avgPm25)} µg/m³ है, जबकि पूरे दिन का औसत ${n(avg)} µg/m³: उसी व्यायाम में ${cut}% कम प्रदूषण।`,
    ),
    exposureCutPct: cut,
    scope: SCOPE.exercise,
    smogDefence: true,
  };
}

export function maskRec({ profile: p, concern, dominant }: RuleInput): RecDraft | null {
  if (!cautious(concern)) return null;
  const pct = round(N95_REAL_WORLD_FILTRATION * 100);
  const who = forMembers(p, {
    children: L(` ${CHILD_MASK_NOTE.en}`, ` ${CHILD_MASK_NOTE.hi}`),
    respiratory: L(' Anyone with lung or heart disease should check with their doctor first.', ' फेफड़े या दिल की बीमारी वाले पहले डॉक्टर से पूछें।'),
  });
  const ozone = dominant === 'o3';
  return {
    id: 'n95',
    category: 'routine',
    // Masks only stop particles; when ozone drives the AQI, timing matters more than the mask.
    priority: ozone ? 2 : 1,
    title: L('Wear a well-fitted N95 or FFP2 outdoors', 'बाहर अच्छी तरह फ़िट N95 या FFP2 मास्क पहनें'),
    detail: L(
      `Cloth and surgical masks do little against PM2.5. Pinch the nose clip and check for leaks.${who.en}${ozone ? ' Note: no mask filters ozone, today’s main pollutant, so also follow the ozone timing advice.' : ''}`,
      `कपड़े और सर्जिकल मास्क PM2.5 से ज़्यादा नहीं बचाते। नाक की क्लिप दबाएँ और लीक जाँचें।${who.hi}${ozone ? ' ध्यान दें: आज का मुख्य प्रदूषक ओज़ोन है, जिसे कोई मास्क नहीं रोकता, इसलिए ओज़ोन के समय वाली सलाह भी मानें।' : ''}`,
    ),
    explanation: L(
      `N95s filter ≥95% in the lab; with real-world fit leaks we count ${pct}% of the PM2.5 you would breathe on the move.`,
      `N95 लैब में ≥95% छानता है; असल में फ़िट के लीक को देखते हुए हम बाहर की साँस का ${pct}% मानते हैं।`,
    ),
    exposureCutPct: pct,
    scope: SCOPE.outdoors,
    smogDefence: true,
  };
}
