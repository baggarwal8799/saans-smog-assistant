/** What a rule sees (RuleInput), what it returns (RecDraft), and how a draft becomes one language's tip. */
import type { AqiLevel } from '../aqi.js';
import type { Concern, Lang, Pollutant, Profile, RecId, Recommendation, SmogTrap, TimeWindow } from '../types.js';
import type { Text } from './text.js';

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
  id: RecId;
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
