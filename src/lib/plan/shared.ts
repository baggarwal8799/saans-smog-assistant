/** Building blocks shared by every recommendation rule: bilingual text, wording helpers and the rule input. */
import type { AqiLevel } from '../aqi.js';
import { epaActivity, type Activity } from '../epa.js';
import { habitRatio, indoorCut, round, shutRatio } from '../impact.js';
import type { Commute, Concern, Lang, Pollutant, Profile, Recommendation, SmogTrap, TimeWindow } from '../types.js';

export type Text = Readonly<Record<Lang, string>>;
export const L = (en: string, hi: string): Text => ({ en, hi });

/** The US AQI quoted to schools and societies: above it, sports move indoors (EPA "Unhealthy" starts at 151). */
export const HEAVY_EXERTION_AQI = 150;
/** Ozone (µg/m³) averaged over the peak window from which ozone timing advice is worth giving (≈ 51 ppb). */
export const OZONE_CONCERN_UG = 100;

/** Added to any tip that says to shut windows while the home burns fuel, which needs air against carbon monoxide. */
export const CO_CAVEAT = L(
  ' If anything is burning indoors, keep a window slightly open and never sleep with it lit.',
  ' अगर घर में कुछ भी जल रहा हो, तो एक खिड़की थोड़ी खुली रखें और उसे जलता छोड़कर कभी न सोएँ।',
);

/** The one statement about children and masks, shared by the plan and the assistant's fixed answers. */
export const CHILD_MASK_NOTE = L(
  'N95 masks are not made to fit young children; keep them indoors at the worst hours instead. Older children can wear a well-fitted child-size KN95 or KF94.',
  'N95 मास्क छोटे बच्चों के चेहरे पर ठीक से नहीं बैठते; सबसे खराब घंटों में उन्हें घर के अंदर ही रखें। बड़े बच्चे अच्छी तरह फ़िट होने वाला बच्चों के साइज़ का KN95 या KF94 पहन सकते हैं।',
);

/** Metro lines exist in few cities, so every metro suggestion is conditional on one serving the route. */
export const METRO_IF = L('if a metro line serves your route', 'अगर आपके रास्ते पर मेट्रो लाइन हो');

/** Shutting the windows, worked out from this household's own indoor habit for every tip that asks for it. */
export function shut(p: Profile): { cut: number; working: Text } {
  const now = round(habitRatio(p) * 100);
  const after = round(shutRatio(p) * 100);
  const cut = indoorCut(p);
  return {
    cut,
    working: L(
      `Shut windows keep indoor PM2.5 near ${after}% of outside instead of the ≈ ${now}% your home has now: ${cut}% less.`,
      `बंद खिड़कियों से अंदर का PM2.5 बाहर का लगभग ${after}% रहता है, अभी घर में ≈ ${now}% की जगह: ${cut}% कम।`,
    ),
  };
}

/** "a, b and c" / "a, b और c". */
export function joinList(items: readonly Text[]): Text {
  const join = (lang: Lang, and: string): string => {
    const words = items.map((t) => t[lang]);
    return words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} ${and} ${words[words.length - 1] ?? ''}`;
  };
  return L(join('en', 'and'), join('hi', 'और'));
}

/** The household members advice may name. A sentence about one appears only when the profile has that member. */
export type Member = 'children' | 'elderly' | 'respiratory';
const MEMBER_FLAG = { children: 'hasChildren', elderly: 'hasElderly', respiratory: 'hasRespiratory' } as const;
const MEMBER_NAME: Readonly<Record<Member, Text>> = {
  children: L('children', 'बच्चों'),
  elderly: L('elders', 'बुज़ुर्गों'),
  respiratory: L('anyone with a heart or lung condition', 'दिल या फेफड़े की बीमारी वालों'),
};
export const membersOf = (p: Profile): Member[] => (Object.keys(MEMBER_FLAG) as Member[]).filter((m) => p[MEMBER_FLAG[m]]);
/** The sentences written for each member, kept only for the members this household has. */
export function forMembers(p: Profile, notes: Partial<Record<Member, Text>>): Text {
  const kept = membersOf(p).flatMap((m) => notes[m] ?? []);
  return L(kept.map((t) => t.en).join(''), kept.map((t) => t.hi).join(''));
}
/** "children and elders" (Hindi in the oblique case, before को), naming only the members the household has. */
export const memberNames = (p: Profile): Text => joinList(membersOf(p).map((m) => MEMBER_NAME[m]));

/** EPA activity guidance for the household's sensitive members: children, elders, a heart or lung condition. */
export const membersActivity = ({ band }: Pick<RuleInput, 'band'>): Activity => epaActivity(band, true);
/** For the adult the profile describes (commute, workout): a sensitive group only with the heart or lung condition. */
export const selfActivity = ({ band, profile }: Pick<RuleInput, 'band' | 'profile'>): Activity => epaActivity(band, profile.hasRespiratory);
/** The strictest guidance for anyone in this household. */
export const householdActivity = ({ band, profile }: Pick<RuleInput, 'band' | 'profile'>): Activity =>
  epaActivity(band, membersOf(profile).length > 0);

/** Everything a rule may look at. Built once per plan in recommend.ts. */
export interface RuleInput {
  profile: Profile;
  /** How bad the air is, for priorities and caution words; no rule applies its own threshold. */
  concern: Concern;
  /** The US EPA band (concern.ts `planBand`); every rule about going out reads its strictness from epa.ts with it. */
  band: AqiLevel;
  /** Average PM2.5 over the next 24 h, µg/m³. */
  avg: number;
  /** Cleanest daytime window outside any smog trap. */
  best: TimeWindow | null;
  worst: TimeWindow | null;
  ozonePeak: TimeWindow | null;
  trap: SmogTrap | null;
  dominant: Pollutant | null;
  /** Local time at the place, e.g. 2026-11-18T13:00. */
  now: string;
  /** India-specific schemes and words (Ujjwala, RWA, angithi) only make sense there. */
  india: boolean;
  /** Mosquito-coil advice only where coils are a common habit: India, in the mosquito belt. */
  mosquitoes: boolean;
}

export interface RecDraft {
  id: string;
  category: Recommendation['category'];
  priority: Recommendation['priority'];
  title: Text;
  detail: Text;
  explanation: Text;
  co2KgPerMonth?: number;
  exposureCutPct?: number;
  /** What the percentage applies to, e.g. "outdoors": the cut is never claimed for the whole day. */
  scope?: Text;
  removesSource?: boolean;
  community?: boolean;
  /** Which pollutant the percentage cuts; PM2.5 unless stated. */
  pollutant?: 'ozone';
  /** The tip tells people to shut windows, so it needs the carbon-monoxide caveat when fuel burns indoors. */
  shutsWindows?: boolean;
  /** Life safety: its own group, above "Do these first", never counted against MAX_URGENT. */
  safety?: boolean;
  /**
   * A US EPA core action: it changes WHO goes out or HOW HARD they exert themselves (exercise indoors, keep the
   * vulnerable in, no hard exercise in the ozone peak). It ranks above every other tip in its priority.
   */
  epaActivity?: boolean;
  /** Its only purpose is keeping outdoor smog out, so on a clean-air day there is nothing for it to do. */
  smogDefence?: boolean;
  /**
   * About a habit the household form never asks about (coils, incense, dry sweeping). Shown as an option, but never
   * the basis of a headline claim such as "your biggest wins are indoor smoke sources".
   */
  unreported?: boolean;
}

/** Below this, a tip that only cuts exposure changes too little to ask for, like the commute rule's 25% minimum. */
export const MIN_EXPOSURE_CUT_PCT = 10;

export const SCOPE = {
  outdoors: L('outdoors', 'बाहर'),
  exercise: L('while exercising', 'व्यायाम के दौरान'),
  home: L('at home', 'घर पर'),
  kitchen: L('in the kitchen', 'रसोई में'),
  vulnerable: L('for them in that window', 'उस समय उनके लिए'),
} as const;

export const MODE_NAME: Readonly<Record<Commute, Text>> = {
  car: L('car', 'कार'),
  motorbike: L('motorbike', 'मोटरसाइकिल'),
  auto: L('auto-rickshaw', 'ऑटो'),
  bus: L('bus', 'बस'),
  metro: L('metro', 'मेट्रो'),
  bicycle: L('bicycle', 'साइकिल'),
  walk: L('walking', 'पैदल'),
  wfh: L('home', 'घर'),
};

export const n = (v: number, d = 0): string => String(round(v, d));

/** "4 people" / "4 लोग", so household size reads naturally in every working. */
export const persons = (k: number): Text => L(`${k} ${k === 1 ? 'person' : 'people'}`, `${k} ${k === 1 ? 'व्यक्ति' : 'लोग'}`);

/** Picks the India-specific or the general wording of a line. */
export const local = (india: boolean, inIndia: Text, elsewhere: Text): Text => (india ? inIndia : elsewhere);

/** Mosquitoes, and so coils, are plausible up to roughly the subtropics: |latitude| ≤ 35°. */
export const MOSQUITO_MAX_ABS_LAT = 35;
export const mosquitoZone = (lat: number): boolean => Math.abs(lat) <= MOSQUITO_MAX_ABS_LAT;

/** Country names as the geocoders return them, in English and Hindi. */
const INDIA_NAMES: ReadonlySet<string> = new Set(['India', 'भारत']);
export const isIndia = (country: string | undefined): boolean => country !== undefined && INDIA_NAMES.has(country);

export function localize(d: RecDraft, lang: Lang): Recommendation {
  const rec: Recommendation = {
    id: d.id,
    category: d.category,
    priority: d.priority,
    title: d.title[lang],
    detail: d.detail[lang],
    impact: { explanation: d.explanation[lang] },
  };
  if (d.co2KgPerMonth !== undefined) rec.impact.co2KgPerMonth = d.co2KgPerMonth;
  if (d.exposureCutPct !== undefined) {
    rec.impact.exposureCutPct = d.exposureCutPct;
    rec.impact.pollutant = d.pollutant === 'ozone' ? 'ozone' : 'PM2.5';
  }
  if (d.scope) rec.impact.scope = d.scope[lang];
  if (d.removesSource) rec.impact.removesSource = true;
  if (d.community) rec.impact.community = true;
  if (d.safety) rec.safety = true;
  return rec;
}
