/**
 * Protecting the household's US EPA sensitive groups: children, elders and anyone with a heart or lung condition.
 * How strict the advice is comes from the EPA activity guide (epa.ts) for the plan's band, the table the assistant's
 * verdicts use, so the two never disagree. From "Unhealthy" up the advice covers the whole day; the worst 2-hour
 * window is then an extra, never the whole advice, and no time is offered for going out.
 */
import type { Activity } from '../epa.js';
import { aqiKey, t } from '../i18n.js';
import { indoorCut, shutRatio } from '../impact.js';
import type { TimeWindow } from '../types.js';
import { partOfDay } from '../windows.js';
import { L, SCOPE, forMembers, memberNames, membersActivity, membersOf, n, type RecDraft, type RuleInput, type Text } from './shared.js';
import { phrase } from './spans.js';

type Level = Exclude<Activity, 'fine'>;

/** The EPA guide for sensitive groups at each level, in its own words. */
const GUIDE: Readonly<Record<Level, Text>> = {
  reduce: L('sensitive groups should reduce prolonged or heavy exertion outdoors', 'संवेदनशील लोगों को बाहर लंबी या ज़ोरदार मेहनत कम करनी चाहिए'),
  avoid: L('sensitive groups should avoid prolonged or heavy exertion outdoors', 'संवेदनशील लोगों को बाहर लंबी या ज़ोरदार मेहनत से बचना चाहिए'),
  avoidAll: L('sensitive groups should avoid all physical activity outdoors', 'संवेदनशील लोगों को बाहर हर तरह की शारीरिक गतिविधि से बचना चाहिए'),
};

const WATCH = L(' Watch for coughing or breathlessness.', ' खाँसी या साँस फूलने पर नज़र रखें।');

/** Title and detail for one level. `worst` is required only for "reduce", where the window is the advice. */
function advice(level: Level, p: RuleInput['profile'], worst: TimeWindow | null, now: string): { title: Text; detail: Text } {
  const who = memberNames(p);
  const when = worst ? phrase(worst, now, 'fromTo') : L('', '');
  const part = worst ? partOfDay(worst.start) : L('', '');
  if (level === 'reduce') {
    const school = forMembers(p, { children: L('school runs, ', 'स्कूल आना-जाना, ') });
    return {
      title: L(`Keep ${who.en} indoors ${when.en}`, `${when.hi} ${who.hi} को घर में रखें`),
      detail: L(
        `This ${part.en} stretch has the most PM2.5 in the forecast. Outside it, keep ${school.en}walks and errands short and gentle.${WATCH.en}`,
        `पूर्वानुमान में ${part.hi} का यह समय सबसे ज़्यादा PM2.5 वाला है। इसके बाहर ${school.hi}सैर और काम थोड़ी देर और हल्के रखें।${WATCH.hi}`,
      ),
    };
  }
  if (level === 'avoid') {
    const peak = worst
      ? L(` Keep them fully indoors ${when.en}, the ${part.en} peak.`, ` ${when.hi}, ${part.hi} के सबसे खराब समय में, उन्हें पूरी तरह घर में रखें।`)
      : L('', '');
    return {
      title: L(`All day today: no long or hard outdoor activity for ${who.en}`, `आज दिन भर ${who.hi} को बाहर लंबी या ज़ोरदार गतिविधि न करने दें`),
      detail: L(
        `Move their play, sport and long walks indoors, and keep any trip out short and gentle.${peak.en}${WATCH.en}`,
        `उनका खेल, कसरत और लंबी सैर घर के अंदर कराएँ, और बाहर का कोई भी काम छोटा और हल्का रखें।${peak.hi}${WATCH.hi}`,
      ),
    };
  }
  const peak = worst ? L(` The air is worst ${when.en}, in the ${part.en}.`, ` हवा ${when.hi}, ${part.hi} में, सबसे खराब होगी।`) : L('', '');
  return {
    title: L(`Keep ${who.en} indoors all day today`, `आज दिन भर ${who.hi} को घर के अंदर रखें`),
    detail: L(
      `No outdoor play, sport or walks for them today; keep them active indoors.${peak.en}${WATCH.en}`,
      `आज उन्हें बाहर न खेलने दें, न कसरत कराएँ, न सैर; घर में ही सक्रिय रखें।${peak.hi}${WATCH.hi}`,
    ),
  };
}

export function vulnerableRec(input: RuleInput): RecDraft | null {
  const { profile: p, worst, now, band } = input;
  const level = membersActivity(input);
  if (membersOf(p).length === 0 || level === 'fine' || (level === 'reduce' && !worst)) return null;
  const { title, detail } = advice(level, p, worst, now);
  const meds = forMembers(p, { respiratory: L(' Keep inhalers and medicines handy.', ' इनहेलर और दवाएँ पास रखें।') });
  const cut = indoorCut(p, 1);
  const ratio = n(shutRatio(p) * 100);
  const when = worst ? phrase(worst, now, 'fromTo') : L('', '');
  const peak = worst
    ? L(` Forecast PM2.5 peaks at ≈ ${n(worst.avgPm25)} µg/m³ ${when.en}.`, ` पूर्वानुमान में PM2.5 ${when.hi} ≈ ${n(worst.avgPm25)} µg/m³ तक पहुँचता है।`)
    : L('', '');
  return {
    id: 'protect-vulnerable',
    category: 'routine',
    priority: 1,
    title,
    detail: L(detail.en + meds.en, detail.hi + meds.hi),
    explanation: L(
      `US EPA, ${t('en', aqiKey(band))} air: ${GUIDE[level].en}. Indoors with windows shut, their air is about ${ratio}% of outside: ${cut}% less PM2.5 for them.${peak.en}`,
      `US EPA, ‘${t('hi', aqiKey(band))}’ हवा: ${GUIDE[level].hi}। खिड़कियाँ बंद करके घर में उनकी हवा बाहर की लगभग ${ratio}% रहती है: उनके लिए PM2.5 ${cut}% कम।${peak.hi}`,
    ),
    exposureCutPct: cut,
    scope: level === 'reduce' ? SCOPE.vulnerable : L('for them indoors', 'घर के अंदर उनके लिए'),
    smogDefence: true,
    epaActivity: true,
  };
}
